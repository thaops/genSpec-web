"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import { formatVndShort } from "@/lib/utils";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string; // stroke color
}

const R = 54;
const STROKE = 18;
const C = 2 * Math.PI * R;

// SVG donut (no chart library). Arcs animate in via stroke-dashoffset transition.
export function CostDonut({ slices }: { slices: DonutSlice[] }) {
  const { t } = useT();
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;

  const arcs = slices.reduce<
    Array<DonutSlice & { frac: number; len: number; dashOffset: number }>
  >((acc, s) => {
    const prev = acc.length ? acc[acc.length - 1] : null;
    const offset = prev ? -prev.dashOffset + prev.len : 0;
    const frac = Math.max(0, s.value) / total;
    const len = frac * C;
    acc.push({ ...s, frac, len, dashOffset: -offset });
    return acc;
  }, []);

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-zinc-800/70"
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={a.dashOffset}
              className="motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {t("overview.donutTitle")}
          </span>
          <span className="font-mono text-base font-bold text-zinc-100">
            {formatVndShort(total)}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {arcs.map((a) => (
          <li key={a.key} className="flex items-center gap-2 text-[13px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: a.color }}
            />
            <span className="min-w-0 flex-1 truncate text-zinc-300">
              {a.label}
            </span>
            <span className="font-mono tabular-nums text-zinc-400">
              {Math.round(a.frac * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
