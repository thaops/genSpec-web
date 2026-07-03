"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import type { EstimateListItem } from "@/lib/types";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { Spinner } from "./ui/Button";
import { useToast } from "./ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider";
import { NewProjectModal } from "./home/NewProjectModal";
import { CommandPalette } from "./home/CommandPalette";
import { ThemeToggle } from "./ui/ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { LogoutIcon } from "./ui/icons";
import { Search, Home, FolderOpen, X, ClipboardList, Settings, Plus } from "lucide-react";


/** Lets pages inside the shell open the shared New Workspace modal. */
const NewWorkspaceModalContext = createContext<() => void>(() => {});
export function useNewWorkspaceModal() {
  return useContext(NewWorkspaceModalContext);
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-xs font-semibold text-white">
      {initials || "U"}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, isAuthenticated, signOut } = useAuth();
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);

  // Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    let alive = true;
    api
      .listEstimates()
      .then((e) => alive && setEstimates(e))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, isAuthenticated, pathname]);

  async function createProject(name: string, file: File | null) {
    if (creating) return;
    setCreating(true);
    try {
      const est = await api.createEstimate(name || t("home.defaultName"));
      if (file) {
        // Backend import (ExcelJS) is the source of truth — await it so the
        // editor loads the fully-styled workbook, never a style-less preview.
        setImporting(true);
        try {
          await api.importExcel(est.id, file);
        } catch (err) {
          toast.error(t("home.importFailed"), (err as ApiError).message);
        } finally {
          setImporting(false);
        }
      }
      setModalOpen(false);
      router.push(`/estimate/${est.id}`);
    } catch (err) {
      toast.error(t("dashboard.createFailed"), (err as ApiError).message);
      setCreating(false);
    }
  }

  if (!ready || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <>
      <NewProjectModal
        open={modalOpen}
        loading={creating}
        loadingLabel={importing ? t("home.importing") : undefined}
        onClose={() => setModalOpen(false)}
        onSubmit={createProject}
      />
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        estimates={estimates}
        onImport={() => setModalOpen(true)}
      />

      <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950/80 px-4 backdrop-blur">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>

          {/* Global search */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex max-w-xs flex-1 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-left text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-400"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">
              Search workspaces, materials, codes...
            </span>
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle />
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              + New Workspace
            </button>
            <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 py-1 pl-1 pr-3">
              <Avatar name={user?.name ?? "U"} />
              <span className="hidden text-xs text-zinc-300 sm:block">
                {user?.name}
              </span>
              <button
                onClick={() => {
                  signOut();
                  router.replace("/login");
                }}
                className="text-zinc-500 transition-colors hover:text-rose-400"
                aria-label={t("nav.signOut")}
              >
                <LogoutIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Icon sidebar */}
          <aside className="relative flex w-12 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-950 py-3">
            {/* Home */}
            <Link
              href="/"
              title="Home"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                pathname === "/"
                  ? "bg-accent-500/15 text-accent-300"
                  : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300",
              )}
            >
              <Home className="h-4 w-4" />
            </Link>

            {/* Workspaces toggle */}
            <button
              title="Workspaces"
              onClick={() => setWsOpen((o) => !o)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                wsOpen
                  ? "bg-zinc-800 text-zinc-200"
                  : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300",
              )}
            >
              <FolderOpen className="h-4 w-4" />
            </button>

            {/* Workspace flyout panel */}
            {wsOpen && (
              <div className="absolute left-full top-0 z-30 flex h-full w-56 flex-col border-r border-zinc-800 bg-zinc-950 shadow-2xl">
                <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
                  <span className="text-[12px] font-semibold text-zinc-300">
                    Workspaces
                  </span>
                  <button
                    onClick={() => setWsOpen(false)}
                    className="text-zinc-600 hover:text-zinc-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto py-1">
                  {estimates.length === 0 ? (
                    <p className="px-3 py-4 text-center text-[11px] text-zinc-600">
                      Chưa có workspace
                    </p>
                  ) : (
                    estimates.map((est) => (
                      <Link
                        key={est.id}
                        href={`/estimate/${est.id}`}
                        onClick={() => setWsOpen(false)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 text-[12px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200",
                          pathname === `/estimate/${est.id}` &&
                            "bg-zinc-800/60 text-zinc-200",
                        )}
                      >
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{est.name}</span>
                      </Link>
                    ))
                  )}
                </div>
                <div className="border-t border-zinc-800 px-3 py-2">
                  <button
                    onClick={() => {
                      setModalOpen(true);
                      setWsOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-accent-400 transition-colors hover:text-accent-300"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Workspace
                  </button>
                </div>
              </div>
            )}

            <div className="mt-auto">
              <button
                title="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </aside>

          {/* Backdrop to close workspace panel */}
          {wsOpen && (
            <div
              className="fixed inset-0 z-20"
              onClick={() => setWsOpen(false)}
            />
          )}

          {/* Page */}
          <main className="flex-1 overflow-hidden">
            <NewWorkspaceModalContext.Provider value={() => setModalOpen(true)}>
              {children}
            </NewWorkspaceModalContext.Provider>
          </main>
        </div>
      </div>
    </>
  );
}
