"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button, Spinner } from "@/components/ui/Button";
import { Cross, FileIcon, PaperclipIcon } from "@/components/ui/icons";

interface Props {
  open: boolean;
  loading: boolean;
  loadingLabel?: string;
  onClose: () => void;
  onSubmit: (name: string, file: File | null) => void;
}

export function NewProjectModal({ open, loading, loadingLabel, onClose, onSubmit }: Props) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setFile(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() && !file) return;
    onSubmit(name.trim() || file!.name.replace(/\.[^.]+$/, ""), file);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="animate-slide-up w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">
            {t("home.newProject")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Cross className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              {t("home.projectName")}
            </label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("home.projectNamePlaceholder")}
              disabled={loading}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent-500/70 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:opacity-60"
            />
          </div>

          {/* Excel file */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              {t("home.excelFile")} <span className="text-zinc-600">({t("home.optional")})</span>
            </label>
            {file ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5">
                <FileIcon className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="flex-1 truncate text-sm text-emerald-300">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-zinc-500 hover:text-rose-400"
                >
                  <Cross className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border border-dashed border-zinc-700 px-3.5 py-3 text-sm text-zinc-400",
                  "transition-colors hover:border-accent-500/50 hover:bg-accent-500/5 hover:text-accent-300",
                  "disabled:opacity-50"
                )}
              >
                <PaperclipIcon className="h-4 w-4 shrink-0" />
                {t("home.excelFilePlaceholder")}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name.trim()) {
                  setName(f.name.replace(/\.[^.]+$/, ""));
                }
                e.target.value = "";
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={(!name.trim() && !file) || loading}
            >
              {loading ? <Spinner className="h-4 w-4" /> : null}
              {loading ? loadingLabel ?? t("home.creating") : t("home.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
