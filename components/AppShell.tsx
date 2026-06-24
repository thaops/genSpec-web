"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import type { EstimateListItem } from "@/lib/types";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { DashboardIcon, PlusIcon, LogoutIcon } from "./ui/icons";
import { Spinner } from "./ui/Button";
import { LanguageToggle } from "./LanguageToggle";
import { ProjectHistory } from "./home/ProjectHistory";
import { NewProjectModal } from "./home/NewProjectModal";
import { useToast } from "./ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";

const NAV: { href: string; labelKey: TKey; icon: typeof DashboardIcon; exact?: boolean }[] = [
  { href: "/", labelKey: "nav.dashboard", icon: DashboardIcon, exact: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, isAuthenticated, signOut } = useAuth();
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [estimates, setEstimates] = useState<EstimateListItem[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  async function createProject(name: string, file: File | null) {
    if (creating) return;
    setCreating(true);
    try {
      const est = await api.createEstimate(name || t("home.defaultName"));
      if (file) await api.importExcel(est.id, file);
      setModalOpen(false);
      router.push(`/estimate/${est.id}`);
    } catch (err) {
      toast.error(t("dashboard.createFailed"), (err as ApiError).message);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, router]);

  // Load the project history into the sidebar; refresh whenever we land on a page.
  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    let alive = true;
    api
      .listEstimates()
      .then((e) => alive && setEstimates(e))
      .catch(() => alive && setEstimates([]));
    return () => {
      alive = false;
    };
  }, [ready, isAuthenticated, pathname]);

  async function deleteEstimate(id: string) {
    if (!window.confirm(t("dashboard.deleteConfirm"))) return;
    try {
      await api.deleteEstimate(id);
      setEstimates((prev) => prev?.filter((e) => e.id !== id) ?? null);
      toast.success(t("dashboard.deleted"));
    } catch (err) {
      toast.error(t("dashboard.createFailed"), (err as ApiError).message);
    }
  }

  if (!ready || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <>
    <NewProjectModal
      open={modalOpen}
      loading={creating}
      onClose={() => setModalOpen(false)}
      onSubmit={createProject}
    />
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/40 px-4 py-5 lg:flex">
        <Link href="/" className="mb-8 px-2">
          <Logo />
        </Link>
        {/* Control panel — nav + new project */}
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-500/10 text-accent-200 ring-1 ring-inset ring-accent-500/20"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {t(item.labelKey)}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-600 to-accent-500 px-3 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-10px_rgba(37,99,235,0.8)] transition-opacity hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4" />
            {t("nav.newProject")}
          </button>
        </nav>

        {/* Project history — under the control panel, scrolls, collapsible */}
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
            <ProjectHistory estimates={estimates} onDelete={deleteEstimate} />
          </div>
        </div>

        <div className="mt-3 shrink-0 border-t border-zinc-800/60 pt-3">
          <UserCard
            name={user?.name ?? "User"}
            email={user?.email ?? ""}
            signOutLabel={t("nav.signOut")}
            onSignOut={() => {
              signOut();
              router.replace("/login");
            }}
          />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile + context) */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/70 px-4 backdrop-blur lg:px-8">
          <Link href="/" className="lg:hidden">
            <Logo />
          </Link>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <nav className="flex items-center gap-1 lg:hidden">
              {NAV.map((item) => {
                const active = isActive(item.href, item.exact);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      active
                        ? "bg-accent-500/10 text-accent-200"
                        : "text-zinc-400 hover:bg-zinc-800/50"
                    )}
                    aria-label={t(item.labelKey)}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-900/60 py-1 pl-1 pr-3">
              <Avatar name={user?.name ?? "U"} />
              <span className="hidden text-sm text-zinc-300 sm:block">
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

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
    </>
  );
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

function UserCard({
  name,
  email,
  signOutLabel,
  onSignOut,
}: {
  name: string;
  email: string;
  signOutLabel: string;
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">{name}</p>
        <p className="truncate text-xs text-zinc-500">{email}</p>
      </div>
      <button
        onClick={onSignOut}
        className="text-zinc-500 transition-colors hover:text-rose-400"
        aria-label={signOutLabel}
      >
        <LogoutIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
