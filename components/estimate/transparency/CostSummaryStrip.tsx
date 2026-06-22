"use client";

import { cn, formatVnd, formatVndShort } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { CostSummary } from "@/lib/types";

// Compact KPI strip QS reads first: total + cost breakdown. Used atop sheet 01.
export function CostSummaryStrip({ cost }: { cost: CostSummary }) {
  const { t } = useT();

  const items: { label: string; value: number; accent?: boolean }[] = [
    { label: t("transparency.costMaterial"), value: cost.directMaterial },
    { label: t("transparency.costLabor"), value: cost.directLabor },
    { label: t("transparency.costMachine"), value: cost.directMachine },
    { label: t("transparency.costOverhead"), value: cost.overhead },
    { label: t("transparency.costVat"), value: cost.vat },
    { label: t("transparency.costContingency"), value: cost.contingency },
  ];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 px-5 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            {t("transparency.grandTotal")}
          </p>
          <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-white">
            {formatVnd(cost.total)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-zinc-800/70 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        {items.map((it) => (
          <div key={it.label} className="px-4 py-3">
            <p className="truncate text-[11px] text-zinc-500">{it.label}</p>
            <p
              className={cn(
                "mt-0.5 font-mono text-sm font-semibold tabular-nums",
                it.accent ? "text-accent-200" : "text-zinc-200"
              )}
              title={formatVnd(it.value)}
            >
              {formatVndShort(it.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
