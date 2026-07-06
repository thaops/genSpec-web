"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent, ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { Spinner } from "@/components/ui/Button";
import { SendIcon, PaperclipIcon, Cross, FileIcon } from "@/components/ui/icons";
import { MapPin } from "lucide-react";
import { PROVINCES } from "@/lib/provinces";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls";
const MAX_TEXTAREA_PX = 200;

type FileKind = "pdf" | "excel" | "image" | "file";

function fileKind(file: File): FileKind {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    type.includes("spreadsheet") ||
    type.includes("excel")
  )
    return "excel";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name))
    return "image";
  return "file";
}

const KIND_STYLES: Record<FileKind, string> = {
  pdf: "text-rose-300 bg-rose-500/10 border-rose-500/30",
  excel: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  image: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  file: "text-zinc-300 bg-zinc-700/40 border-zinc-600/50",
};

// F3: @-mention context suggestion (sheets, selection, drawings, objects)
export type MentionKind = "sheet" | "selection" | "drawing" | "object";

export interface MentionItem {
  label: string;
  kind: MentionKind;
  sheetId?: string;
}

const MENTION_KIND_VI: Record<MentionKind, string> = {
  sheet: "Sheet",
  selection: "Vùng chọn",
  drawing: "Bản vẽ",
  object: "Đối tượng",
};

interface MentionState {
  start: number; // index of the "@" in value
  query: string;
}

function detectMention(text: string, caret: number): MentionState | null {
  const upto = text.slice(0, caret);
  const m = /@([^\s@\[\]]*)$/.exec(upto);
  if (!m) return null;
  return { start: caret - m[0].length, query: m[1] };
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  files: File[];
  onAddFiles: (list: FileList | File[]) => void;
  onRemoveFile: (index: number) => void;
  onSend: () => void;
  loading: boolean;
  mentionItems?: MentionItem[];
  /** Tỉnh/thành dự án (địa điểm) — dùng để tra giá theo tỉnh. */
  province?: string;
  onProvinceChange?: (province: string) => void;
}

export function CopilotComposer({
  value,
  onChange,
  files,
  onAddFiles,
  onRemoveFile,
  onSend,
  loading,
  mentionItems = [],
  province,
  onProvinceChange,
}: Props) {
  const { t } = useT();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const mentionMatches = mention
    ? mentionItems.filter((it) =>
        it.label.toLowerCase().includes(mention.query.toLowerCase())
      )
    : [];
  const mentionOpen = mention !== null && mentionMatches.length > 0;

  function refreshMention() {
    const el = taRef.current;
    if (!el) return;
    const next = detectMention(el.value, el.selectionStart ?? el.value.length);
    setMention(next);
    setMentionIndex(0);
  }

  function pickMention(item: MentionItem) {
    if (!mention) return;
    const el = taRef.current;
    const caret = el?.selectionStart ?? value.length;
    const inserted = `@[${item.label}] `;
    const next = value.slice(0, mention.start) + inserted + value.slice(caret);
    onChange(next);
    setMention(null);
    // Restore caret right after the inserted token
    requestAnimationFrame(() => {
      const pos = mention.start + inserted.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  const canSend = (value.trim().length > 0 || files.length > 0) && !loading;

  // Auto-grow the textarea up to a max height, then scroll.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) onAddFiles(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) onAddFiles(e.dataTransfer.files);
  }

  const kindLabel: Record<FileKind, string> = {
    pdf: t("copilot.fileTypePdf"),
    excel: t("copilot.fileTypeExcel"),
    image: t("copilot.fileTypeImage"),
    file: t("copilot.fileTypeFile"),
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={onDrop}
      className={cn(
        "relative rounded-2xl border bg-zinc-900/70 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] transition-colors",
        "focus-within:border-accent-500/60 focus-within:bg-zinc-900/90",
        dragging ? "border-accent-500/70 bg-accent-500/5" : "border-zinc-700/80"
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-zinc-950/70 text-sm font-medium text-accent-200 backdrop-blur-sm">
          <PaperclipIcon className="mr-2 h-4 w-4" />
          {t("copilot.dropHint")}
        </div>
      )}

      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {files.map((f, i) => {
            const kind = fileKind(f);
            return (
              <span
                key={`${f.name}-${i}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]",
                  KIND_STYLES[kind]
                )}
              >
                <FileIcon className="h-3 w-3 shrink-0" />
                <span className="font-medium">{kindLabel[kind]}</span>
                <span className="max-w-[120px] truncate text-zinc-200/90">
                  {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(i)}
                  className="text-zinc-400 transition-colors hover:text-rose-300"
                  aria-label={t("copilot.removeFile")}
                >
                  <Cross className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Mention dropdown */}
      {mentionOpen && (
        <div className="absolute bottom-full left-3 z-20 mb-1 max-h-56 w-72 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
          {mentionMatches.map((it, i) => (
            <button
              key={`${it.kind}-${it.label}-${i}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pickMention(it);
              }}
              onMouseEnter={() => setMentionIndex(i)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                i === mentionIndex
                  ? "bg-accent-500/15 text-accent-200"
                  : "text-zinc-300"
              )}
            >
              <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
                {MENTION_KIND_VI[it.kind]}
              </span>
              <span className="truncate">{it.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={taRef}
        value={value}
        disabled={loading}
        onChange={(e) => {
          onChange(e.target.value);
          requestAnimationFrame(refreshMention);
        }}
        onKeyDown={(e) => {
          if (mentionOpen) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMentionIndex((i) => (i + 1) % mentionMatches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setMentionIndex(
                (i) => (i - 1 + mentionMatches.length) % mentionMatches.length
              );
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pickMention(mentionMatches[mentionIndex]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMention(null);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        onBlur={() => setMention(null)}
        rows={3}
        placeholder={t("copilot.placeholder")}
        className="block max-h-[200px] min-h-[76px] w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
      />

      {/* Bottom row */}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
            aria-label={t("copilot.attach")}
            title={t("copilot.attachHint")}
          >
            <PaperclipIcon className="h-[18px] w-[18px]" />
          </button>
          {onProvinceChange && (
            <label
              className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/60 pl-2 pr-1 py-1 text-[11px] text-zinc-300 [html.light_&]:border-zinc-700 [html.light_&]:text-zinc-300"
              title="Địa điểm dự án — dùng để tra đơn giá theo tỉnh"
            >
              <MapPin className="h-3.5 w-3.5 text-accent-400 [html.light_&]:text-accent-700" />
              <select
                value={province ?? ""}
                onChange={(e) => onProvinceChange(e.target.value)}
                disabled={loading}
                className="cursor-pointer appearance-none bg-transparent pr-1 text-[11px] text-zinc-200 focus:outline-none [html.light_&]:text-zinc-100 disabled:opacity-50"
              >
                <option value="" className="bg-zinc-900">Chọn tỉnh…</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p} className="bg-zinc-900">{p}</option>
                ))}
              </select>
            </label>
          )}
          {!onProvinceChange && (
            <span className="hidden text-[11px] text-zinc-600 sm:inline">
              {t("copilot.enterToSend")}
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={onPick}
          />
        </div>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-all active:scale-95",
            canSend
              ? "bg-accent-600 text-white shadow-[0_6px_18px_-6px_rgba(79,70,229,0.7)] hover:bg-accent-500"
              : "cursor-not-allowed bg-zinc-800 text-zinc-600"
          )}
          aria-label={t("copilot.send")}
        >
          {loading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <SendIcon className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>
    </div>
  );
}
