"use client";

import { cn, formatVnd, formatVndShort } from "@/lib/utils";

export interface CostSlice {
  label: string;
  value: number;
  color: string; // hex
}

// Donut chart + legend for the cost structure (sheet 09 side panel).
// Pure SVG, no chart libraries. Slices < 0 are clamped to 0.
export function CostBreakdownChart({
  slices,
  total,
  centerLabel,
}: {
  slices: CostSlice[];
  total: number;
  centerLabel: string;
}) {
  const safe = slices.map((s) => ({ ...s, value: Math.max(0, s.value) }));
  const sum = safe.reduce((s, x) => s + x.value, 0) || 1;

  const R = 52;
  const STROKE = 18;
  const C = 2 * Math.PI * R;

  // Precompute each slice's arc length + start offset (no render-time mutation).
  const arcs = safe.reduce<{ slice: CostSlice; len: number; offset: number }[]>(
    (acc, s) => {
      const len = (s.value / sum) * C;
      const prev = acc.length ? acc[acc.length - 1] : null;
      const offset = prev ? prev.offset + prev.len : 0;
      acc.push({ slice: s, len, offset });
      return acc;
    },
    []
  );

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-[140px] w-[140px]">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke="#1b2740"
            strokeWidth={STROKE}
          />
          {arcs.map(({ slice, len, offset }, i) => (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={slice.color}
              strokeWidth={STROKE}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            {centerLabel}
          </span>
          <span className="font-mono text-base font-bold text-white">
            {formatVndShort(total)}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {safe.map((s, i) => {
          const pct = (s.value / sum) * 100;
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 truncate text-zinc-400">{s.label}</span>
              <span className="font-mono tabular-nums text-zinc-500">
                {pct.toFixed(1)}%
              </span>
              <span
                className={cn(
                  "w-24 text-right font-mono tabular-nums text-zinc-200"
                )}
              >
                {formatVnd(s.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
