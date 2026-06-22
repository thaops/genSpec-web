"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";
import type { ProjectInfo } from "@/lib/types";
import { SheetShell, type SheetProps } from "./shell";
import { CostSummaryStrip } from "../transparency/CostSummaryStrip";

type TextField = Exclude<keyof ProjectInfo, "floors">;

const TEXT_FIELDS: { key: TextField; label: TKey; full?: boolean }[] = [
  { key: "name", label: "info.name", full: true },
  { key: "buildingType", label: "info.buildingType" },
  { key: "area", label: "info.area" },
  { key: "location", label: "info.location" },
  { key: "investor", label: "info.investor" },
  { key: "preparedBy", label: "info.preparedBy" },
  { key: "dateCreated", label: "info.dateCreated" },
  { key: "normVersion", label: "info.normVersion" },
  { key: "priceVersion", label: "info.priceVersion" },
];

export function InfoSheet({ estimate, apply }: SheetProps) {
  const { t } = useT();
  const info = estimate.projectInfo ?? {};

  function save(patch: Partial<ProjectInfo>) {
    return apply([{ type: "set_project_info", patch }]);
  }

  return (
    <SheetShell titleKey="tabs.info">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-6">
        {/* KPI strip — the numbers a QS reads first */}
        <CostSummaryStrip cost={estimate.costSummary} />

        {/* Project info form */}
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
          <div className="border-b border-zinc-800 px-5 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t("info.title")}
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
            {TEXT_FIELDS.map((f) => (
              <Field
                key={f.key}
                className={f.full ? "sm:col-span-2 lg:col-span-3" : undefined}
                label={t(f.label)}
                value={info[f.key] ?? ""}
                onCommit={(v) => save({ [f.key]: v || undefined })}
              />
            ))}
            <Field
              label={t("info.floors")}
              value={info.floors != null ? String(info.floors) : ""}
              inputMode="numeric"
              onCommit={(v) => {
                const n = Number(v.replace(/[^\d.-]/g, ""));
                return save({
                  floors: v.trim() && isFinite(n) ? n : undefined,
                });
              }}
            />
            <Field
              className="sm:col-span-2 lg:col-span-3"
              label={t("info.note")}
              value={info.note ?? ""}
              textarea
              onCommit={(v) => save({ note: v || undefined })}
            />
          </div>
        </div>
      </div>
    </SheetShell>
  );
}

function Field({
  label,
  value,
  onCommit,
  className,
  textarea,
  inputMode,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  textarea?: boolean;
  inputMode?: "numeric";
}) {
  const [draft, setDraft] = useState(value);
  // Keep local draft in sync when the underlying value changes externally.
  const [seed, setSeed] = useState(value);
  if (seed !== value) {
    setSeed(value);
    setDraft(value);
  }

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  const base =
    "w-full rounded-md border border-zinc-700 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/40";

  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      {textarea ? (
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          className={`${base} resize-none`}
        />
      ) : (
        <input
          value={draft}
          inputMode={inputMode}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className={base}
        />
      )}
    </div>
  );
}
