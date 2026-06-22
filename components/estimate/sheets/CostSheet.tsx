"use client";

import { useState } from "react";
import { cn, formatVnd } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { Markups } from "@/lib/types";
import { SheetShell, type SheetProps } from "./shell";
import {
  CostBreakdownChart,
  type CostSlice,
} from "../transparency/CostBreakdownChart";

export function CostSheet({ estimate, apply }: SheetProps) {
  const { t } = useT();
  const c = estimate.costSummary;
  const m = estimate.markups;

  function setMarkup(key: keyof Markups, value: number) {
    return apply([{ type: "set_markups", patch: { [key]: value } }]);
  }

  const slices: CostSlice[] = [
    { label: t("transparency.costMaterial"), value: c.directMaterial, color: "#22d3ee" },
    { label: t("transparency.costLabor"), value: c.directLabor, color: "#3b82f6" },
    { label: t("transparency.costMachine"), value: c.directMachine, color: "#818cf8" },
    { label: t("transparency.costOverhead"), value: c.overhead, color: "#a78bfa" },
    { label: t("cost.profit"), value: c.profit, color: "#f472b6" },
    { label: t("transparency.costVat"), value: c.vat, color: "#fbbf24" },
    { label: t("transparency.costContingency"), value: c.contingency, color: "#34d399" },
  ];

  return (
    <SheetShell titleKey="tabs.cost" hint={t("cost.markupHint")}>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          {/* A — direct */}
          <Section label={t("cost.directTitle")} />
          <Row label={t("cost.directMaterial")} value={c.directMaterial} />
          <Row label={t("cost.directLabor")} value={c.directLabor} />
          <Row label={t("cost.directMachine")} value={c.directMachine} />
          <Row label={t("cost.directTotal")} value={c.directTotal} strong />

          {/* B / C with editable % */}
          <MarkupRow
            label={t("cost.overhead")}
            pct={m.overheadPct}
            value={c.overhead}
            onCommit={(v) => setMarkup("overheadPct", v)}
          />
          <MarkupRow
            label={t("cost.profit")}
            pct={m.profitPct}
            value={c.profit}
            onCommit={(v) => setMarkup("profitPct", v)}
          />
          <Row label={t("cost.preTax")} value={c.preTax} strong />

          {/* D / E with editable % */}
          <MarkupRow
            label={t("cost.vat")}
            pct={m.vatPct}
            value={c.vat}
            onCommit={(v) => setMarkup("vatPct", v)}
          />
          <MarkupRow
            label={t("cost.contingency")}
            pct={m.contingencyPct}
            value={c.contingency}
            onCommit={(v) => setMarkup("contingencyPct", v)}
          />

          {/* F — grand total */}
          <div className="flex items-center justify-between gap-4 bg-accent-500/10 px-4 py-3.5">
            <span className="text-sm font-semibold text-accent-100">
              {t("cost.total")}
            </span>
            <span className="font-mono text-lg font-bold text-white">
              {formatVnd(c.total)}
            </span>
          </div>
        </div>

        {/* Cost structure chart — fills the empty side */}
        <aside className="h-fit rounded-lg border border-zinc-800 bg-zinc-900/30 px-5 py-5 lg:sticky lg:top-4">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t("transparency.costStructure")}
          </h3>
          <CostBreakdownChart
            slices={slices}
            total={c.total}
            centerLabel={t("transparency.grandTotal")}
          />
        </aside>
      </div>
    </SheetShell>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
      {label}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-zinc-800/60 px-4 py-2.5",
        strong && "bg-zinc-900/40"
      )}
    >
      <span className={cn("text-sm", strong ? "font-medium text-zinc-100" : "text-zinc-300")}>
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          strong ? "font-semibold text-zinc-100" : "text-zinc-300"
        )}
      >
        {formatVnd(value)}
      </span>
    </div>
  );
}

function MarkupRow({
  label,
  pct,
  value,
  onCommit,
}: {
  label: string;
  pct: number;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(pct));
  const [seed, setSeed] = useState(pct);
  if (seed !== pct) {
    setSeed(pct);
    setDraft(String(pct));
  }

  function commit() {
    const n = Number(draft.replace(/[^\d.-]/g, ""));
    const next = isFinite(n) ? n : 0;
    if (next !== pct) onCommit(next);
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800/60 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-300">{label}</span>
        <span className="flex items-center rounded-md border border-zinc-700 bg-zinc-900/60 pr-1.5 focus-within:border-accent-500/50">
          <input
            value={draft}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-12 bg-transparent py-1 pl-2 text-right font-mono text-xs text-accent-200 outline-none"
          />
          <span className="text-xs text-zinc-500">%</span>
        </span>
      </div>
      <span className="font-mono text-sm tabular-nums text-zinc-300">
        {formatVnd(value)}
      </span>
    </div>
  );
}
