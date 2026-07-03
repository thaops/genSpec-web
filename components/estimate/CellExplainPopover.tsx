"use client";

import type { CopilotSource } from "@/lib/types";
import { ExternalLink, Undo2, X } from "lucide-react";

/** One AI-edited cell tracked by the page (key = `${sheetId}:${cell}`). */
export interface AiCellEdit {
  patchId: string;
  sheetId: string;
  cell: string;
  oldValue: string;
  newValue: string;
  message: string;
  sources: CopilotSource[];
  appliedAt: string;
}

/** 0-based column index → A1 letter ("A", "AA", …). */
export function colLetter(col: number): string {
  let letter = "";
  let n = col;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/** aiEdits map key for a 0-based row/col on a sheet. */
export function cellKeyOf(sheetId: string, row: number, col: number): string {
  return `${sheetId}:${colLetter(col)}${row + 1}`.toUpperCase();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Floating "Vì sao?" card — shown at the top-right of the workbook area when
// the user selects a single cell the AI just edited (Univer canvas does not
// expose per-cell DOM, so the card is anchored to the container instead).
export function CellExplainPopover({
  entry,
  onUndo,
  onClose,
}: {
  entry: AiCellEdit;
  onUndo: () => void;
  onClose: () => void;
}) {
  const time = new Date(entry.appliedAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="absolute right-3 top-3 z-30 w-72 animate-slide-up rounded-xl border border-zinc-800 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur">
      {/* Header */}
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[12px] font-semibold text-zinc-200">
          ✨ AI đã sửa ô <span className="font-mono text-accent-300">{entry.cell}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          className="shrink-0 rounded-md p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Old → new value */}
      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-[11px]">
        <span className="min-w-0 truncate font-mono text-zinc-500 line-through">
          {entry.oldValue || "∅"}
        </span>
        <span className="shrink-0 text-zinc-600">→</span>
        <span className="min-w-0 truncate font-mono font-medium text-emerald-300">
          {entry.newValue || "∅"}
        </span>
      </div>

      {/* Proposal message excerpt */}
      {entry.message && (
        <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-zinc-400">
          {entry.message}
        </p>
      )}

      {/* Sources */}
      {entry.sources.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Nguồn
          </p>
          {entry.sources.slice(0, 3).map((s, i) =>
            s.uri ? (
              <a
                key={i}
                href={s.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-accent-500/30 bg-accent-500/10 px-2 py-1 text-[10px] text-accent-200 transition-colors hover:border-accent-500/50 hover:bg-accent-500/15"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate">
                  {s.title || hostOf(s.uri)}
                </span>
              </a>
            ) : s.title ? (
              <p key={i} className="truncate text-[10px] text-zinc-400">
                • {s.title}
              </p>
            ) : null
          )}
        </div>
      )}

      {/* Footer: time + undo */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-zinc-800 pt-2">
        <span className="text-[10px] text-zinc-500">Lúc {time}</span>
        <button
          type="button"
          onClick={onUndo}
          className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Undo2 className="h-3 w-3" />
          Hoàn tác cả lượt này
        </button>
      </div>
    </div>
  );
}
