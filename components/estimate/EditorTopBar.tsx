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
import { ChevronDown, Coins, LayoutPanelLeft, Maximize2, Minimize2, MoreHorizontal, Upload } from "lucide-react";
import { NotificationBell } from "@/components/ui/NotificationCenter";

interface Props {
  estimate: Estimate;
  onRename: (name: string) => void;
  onExport: () => void;
  onExportTHDT?: () => void;
  onExportTMDT?: () => void;
  exporting: boolean;
  onImportExcel?: (file: File) => void;
  importing?: boolean;
  onReprice?: () => void;
  repricing?: boolean;
  saveState?: "idle" | "dirty" | "saving" | "saved";
  splitMode?: boolean;
  onSplitModeChange?: (v: boolean) => void;
  focusMode?: boolean;
  onToggleFocus?: () => void;
}

export function EditorTopBar({
  estimate,
  onRename,
  onExport,
  onExportTHDT,
  onExportTMDT,
  exporting,
  onImportExcel,
  importing = false,
  onReprice,
  repricing = false,
  saveState = "idle",
  splitMode,
  onSplitModeChange,
  focusMode = false,
  onToggleFocus,
}: Props) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(estimate.name);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!moreMenuRef.current?.contains(e.target as Node)) setMoreMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreMenuOpen]);

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
      )}

      {onReprice && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onReprice}
          loading={repricing}
          leftIcon={<Coins className="h-4 w-4" />}
        >
          {repricing ? "Đang áp giá…" : "Áp giá tỉnh"}
        </Button>
      )}

      <div ref={exportMenuRef} className="relative">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onExport()}
          loading={exporting}
          leftIcon={<DownloadIcon className="h-4 w-4" />}
        >
          {exporting ? t("editor.exporting") : t("editor.export")}
          {onExportTHDT && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setExportMenuOpen((v) => !v);
              }}
              className="ml-1 inline-flex cursor-pointer rounded p-0.5 hover:bg-black/10"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
        {exportMenuOpen && onExportTHDT && (
          <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setExportMenuOpen(false);
                onExport();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              Xuất F1
            </button>
            <button
              type="button"
              onClick={() => {
                setExportMenuOpen(false);
                onExportTHDT();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              Xuất THDT
            </button>
            {onExportTMDT && (
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  onExportTMDT();
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                Xuất TMĐT
              </button>
            )}
          </div>
        )}
      </div>

      {/* Focus mode — ẩn 2 cột để làm việc rộng (phím tắt \) */}
      {onToggleFocus && (
        <button
          type="button"
          onClick={onToggleFocus}
          title={focusMode ? "Thoát tập trung (\\)" : "Tập trung — ẩn 2 cột (\\)"}
          className={cn(
            "flex items-center rounded-md p-1.5 transition-colors",
            focusMode ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          )}
        >
          {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      )}

      {/* Overflow — gom hành động phụ (bớt nút ở hàng chính) */}
      <div ref={moreMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setMoreMenuOpen((v) => !v)}
          title="Thêm"
          className="flex items-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {moreMenuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
            {onSplitModeChange && (
              <button
                type="button"
                onClick={() => { onSplitModeChange(!splitMode); setMoreMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <LayoutPanelLeft className="h-4 w-4 text-zinc-400" />
                {splitMode ? "Tắt xem cạnh nhau" : "Xem bản vẽ + bảng"}
              </button>
            )}
            {onImportExcel && (
              <button
                type="button"
                onClick={() => { importFileRef.current?.click(); setMoreMenuOpen(false); }}
                disabled={importing}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                <Upload className="h-4 w-4 text-zinc-400" />
                {importing ? t("editor.importing") : t("editor.importExcel")}
              </button>
            )}
          </div>
        )}
      </div>

      <NotificationBell />
      <ThemeToggle />
      <LanguageToggle />
    </div>
  );
}
