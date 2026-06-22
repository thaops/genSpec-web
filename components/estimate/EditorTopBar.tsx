"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Estimate } from "@/lib/types";
import { cn, formatVnd } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ChevronLeftIcon, DownloadIcon, EditIcon } from "@/components/ui/icons";

interface Props {
  estimate: Estimate;
  onRename: (name: string) => void;
  onExport: () => void;
  exporting: boolean;
}

export function EditorTopBar({
  estimate,
  onRename,
  onExport,
  exporting,
}: Props) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(estimate.name);
  const inputRef = useRef<HTMLInputElement>(null);

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

      <Button
        size="sm"
        variant="secondary"
        onClick={onExport}
        loading={exporting}
        leftIcon={<DownloadIcon className="h-4 w-4" />}
      >
        {exporting ? t("editor.exporting") : t("editor.export")}
      </Button>

      <LanguageToggle />
    </div>
  );
}
