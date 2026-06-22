"use client";

import type { Estimate } from "@/lib/types";
import { useT } from "@/lib/i18n/I18nProvider";
import { formatVndShort } from "@/lib/utils";

interface Driver {
  name: string;
  value: number;
}

// Top BOQ rows by total; falls back to materialSummary by amount.
function pickDrivers(estimate: Estimate, n: number): Driver[] {
  const fromBoq = (estimate.boq ?? [])
    .map((r) => ({ name: r.name || r.code, value: r.total }))
    .filter((d) => d.value > 0);
  const source =
    fromBoq.length > 0
      ? fromBoq
      : (estimate.materialSummary ?? [])
          .map((r) => ({ name: r.name || r.ref, value: r.amount }))
          .filter((d) => d.value > 0);
  return [...source].sort((a, b) => b.value - a.value).slice(0, n);
}

export function TopCostDrivers({ estimate }: { estimate: Estimate }) {
  const { t } = useT();
  const drivers = pickDrivers(estimate, 6);
  const max = drivers.length ? drivers[0].value : 1;

  if (drivers.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[13px] text-zinc-500">
        {t("overview.empty")}
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {drivers.map((d, i) => (
        <li key={`${d.name}-${i}`} className="group">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 flex-1 truncate text-zinc-300">
              <span className="mr-1.5 font-mono text-[11px] text-zinc-600">
                {i + 1}
              </span>
              {d.name}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-zinc-200">
              {formatVndShort(d.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-600 to-accent-400 motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out"
              style={{ width: `${Math.max(4, (d.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
