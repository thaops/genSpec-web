"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { Spinner } from "@/components/ui/Button";
import {
  SendIcon,
  PaperclipIcon,
  Cross,
  FileIcon,
} from "@/components/ui/icons";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls";

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

interface Props {
  onSubmit: (message: string, files: File[]) => void;
  loading: boolean;
}

export function HomeComposer({ onSubmit, loading }: Props) {
  const { t } = useT();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const canSend = (value.trim().length > 0 || files.length > 0) && !loading;

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [value]);

  function addFiles(list: FileList | File[]) {
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  function submit() {
    if (!canSend) return;
    onSubmit(value.trim(), files);
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
        "group relative rounded-[26px] border bg-zinc-900/60 p-1.5 backdrop-blur-sm transition-all duration-200",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_24px_60px_-24px_rgba(0,0,0,0.9)]",
        "focus-within:border-accent-500/60 focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.14),0_24px_60px_-24px_rgba(0,0,0,0.9)]",
        dragging ? "border-accent-500/70 bg-accent-500/5" : "border-zinc-700/70"
      )}
    >
      {/* subtle gradient glow ring */}
      <div className="pointer-events-none absolute -inset-px -z-10 rounded-[26px] bg-gradient-to-b from-accent-500/15 to-transparent opacity-0 blur transition-opacity duration-300 group-focus-within:opacity-100" />

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[26px] bg-zinc-950/70 text-sm font-medium text-accent-200 backdrop-blur-sm">
          <PaperclipIcon className="mr-2 h-4 w-4" />
          {t("copilot.dropHint")}
        </div>
      )}

      <div className="rounded-[20px] px-4 pt-3">
        {files.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {files.map((f, i) => {
              const kind = fileKind(f);
              return (
                <span
                  key={`${f.name}-${i}`}
                  className={cn(
                    "animate-fade-in flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]",
                    KIND_STYLES[kind]
                  )}
                >
                  <FileIcon className="h-3 w-3 shrink-0" />
                  <span className="font-medium">{kindLabel[kind]}</span>
                  <span className="max-w-[140px] truncate text-zinc-200/90">
                    {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
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

        <textarea
          ref={taRef}
          value={value}
          disabled={loading}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={t("home.placeholder")}
          className="block max-h-[280px] min-h-[64px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
          aria-label={t("copilot.attach")}
          title={t("copilot.attachHint")}
        >
          <PaperclipIcon className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">{t("copilot.attachHint")}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={onPick}
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className={cn(
            "flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-all active:scale-95",
            canSend
              ? "bg-gradient-to-r from-accent-600 to-accent-500 text-white shadow-[0_8px_24px_-8px_rgba(79,70,229,0.8)] hover:opacity-90"
              : "cursor-not-allowed bg-zinc-800 text-zinc-600"
          )}
          aria-label={t("home.start")}
        >
          {loading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <>
              <span>{loading ? t("home.starting") : t("home.start")}</span>
              <SendIcon className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
