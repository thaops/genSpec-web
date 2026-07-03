"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Estimate } from "@/lib/types";
import { cn, formatVnd } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button, Spinner } from "@/components/ui/Button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ChevronLeftIcon, DownloadIcon, EditIcon } from "@/components/ui/icons";
import { LayoutPanelLeft, Upload } from "lucide-react";
import { NotificationBell } from "@/components/ui/NotificationCenter";

interface Props {
  estimate: Estimate;
  onRename: (name: string) => void;
  onExport: () => void;
  exporting: boolean;
  onImportExcel?: (file: File) => void;
  importing?: boolean;
  saveState?: "idle" | "dirty" | "saving" | "saved";
  splitMode?: boolean;
  onSplitModeChange?: (v: boolean) => void;
}

export function EditorTopBar({
  estimate,
  onRename,
  onExport,
  exporting,
  onImportExcel,
  importing = false,
  saveState = "idle",
  splitMode,
  onSplitModeChange,
}: Props) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(estimate.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== estimate.name) onRename(name);
    else setDraft(estimate.name);
  }

  return (
    <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/70 px-3 py-2 backdrop-blur lg:px-4">
      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        aria-label={t("editor.backToDashboard")}
      >
        <ChevronLeftIcon className="h-4 w-4" />
        <span className="hidden md:inline">{t("editor.backToDashboard")}</span>
      </Link>

      <div className="h-5 w-px bg-zinc-800" />

      {/* Editable project name */}
      <div className="group flex min-w-0 flex-1 items-center gap-1.5">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(estimate.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-accent-500/60 bg-zinc-900 px-2 py-1 text-sm font-semibold text-zinc-100 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(estimate.name);
              setEditing(true);
            }}
            title={t("editor.renameProject")}
            className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-zinc-800/60"
          >
            <span className="truncate text-sm font-semibold text-zinc-100">
              {estimate.name || t("editor.untitled")}
            </span>
            <EditIcon className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-400" />
          </button>
        )}
      </div>

      {/* Grand total */}
      <div className="hidden items-baseline gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 sm:flex">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {t("editor.grandTotal")}
        </span>
        <span
          className={cn(
            "font-mono text-sm font-semibold text-white tabular-nums"
          )}
        >
          {formatVnd(estimate.costSummary?.total ?? estimate.costs?.total ?? 0)}
        </span>
      </div>

      {/* Split view toggle */}
      {onSplitModeChange && (
        <button
          onClick={() => onSplitModeChange(!splitMode)}
          title="Toggle split view (Spreadsheet | Drawing)"
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
            splitMode
              ? "bg-blue-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
          )}
        >
          <LayoutPanelLeft className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Split</span>
        </button>
      )}

      {/* Save-state indicator */}
      {saveState === "dirty" && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-amber-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          {t("editor.unsaved")}
        </span>
      )}
      {saveState === "saving" && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
          <Spinner className="h-3 w-3" />
          {t("editor.saving")}
        </span>
      )}
      {saveState === "saved" && (
        <span className="shrink-0 text-xs text-zinc-500">{t("editor.saved")}</span>
      )}

      {onImportExcel && (
        <>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onImportExcel(f);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => importFileRef.current?.click()}
            loading={importing}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            {importing ? t("editor.importing") : t("editor.importExcel")}
          </Button>
        </>
      )}

      <Button
        size="sm"
        variant="secondary"
        onClick={onExport}
        loading={exporting}
        leftIcon={<DownloadIcon className="h-4 w-4" />}
      >
        {exporting ? t("editor.exporting") : t("editor.export")}
      </Button>

      <NotificationBell />
      <ThemeToggle />
      <LanguageToggle />
    </div>
  );
}
