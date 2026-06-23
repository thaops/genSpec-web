"use client";

import { useState } from "react";
import type { TraceItem } from "@/lib/types";
import { useT } from "@/lib/i18n/I18nProvider";
import { cn, formatNum, formatVndShort } from "@/lib/utils";
import { ChevronDownIcon } from "@/components/ui/icons";
import { SourcePopover } from "./SourcePopover";

// Build "6 × 1.8 × 1.8 × 0.5" from a take-off line (formula preferred, else dims).
function deriveExpr(line: TraceItem["quantityTrace"][number]): string | null {
  if (line.formula?.trim()) return line.formula.trim();
  const d = line.dims;
  if (!d) return null;
  const parts = [d.length, d.width, d.height, d.count].filter((v) => v != null) as number[];
  return parts.length ? parts.map((v) => formatNum(v)).join(" × ") : null;
}

// Inline audit trail for a proposal: shows, per BOQ item, how the quantity was
// derived (công thức → khối lượng) and where the unit price came from (sources).
// This is the "click 58.7 tấn → 500 × 0.117 = 58.7" experience, BEFORE applying.
export function TracePanel({ trace }: { trace?: TraceItem[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const items = (trace ?? []).filter((it) => it.quantity > 0 || it.total > 0);
  if (items.length === 0) return null;

  const shown = open ? items : items.slice(0, 3);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-accent-300"
      >
        <ChevronDownIcon className={cn("h-3 w-3 transition-transform", open ? "rotate-180" : "rotate-0")} />
        {t("transparency.traceTitle")} ({items.length})
      </button>

      <div className="mt-2 space-y-1.5">
        {shown.map((it) => (
          <TraceRow key={it.code} item={it} />
        ))}
        {!open && items.length > 3 && (
          <p className="text-[10.5px] text-zinc-600">+{items.length - 3}…</p>
        )}
      </div>
    </div>
  );
}

function TraceRow({ item }: { item: TraceItem }) {
  const { t } = useT();
  const line = item.quantityTrace[0];
  const expr = line ? deriveExpr(line) : null;
  const sources = item.components.map((c) => c.source).filter(Boolean).slice(0, 3);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5 text-[11px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-zinc-200" title={item.name}>
          <span className="font-mono text-accent-300">{item.code}</span> {item.name}
        </span>
        <span className="shrink-0 font-mono font-semibold text-white">{formatVndShort(item.total)}</span>
      </div>

      {/* Quantity derivation */}
      <div className="mt-0.5 font-mono text-[10.5px] text-zinc-400">
        {expr ? `${expr} = ` : ""}
        <span className="text-zinc-200">
          {formatNum(item.quantity)} {item.unit}
        </span>
        <span className="text-zinc-600"> × </span>
        {formatNum(item.unitPrice)}
        {line?.note ? <span className="ml-1 text-zinc-500">· {line.note}</span> : null}
      </div>

      {/* Source chips for the unit price */}
      {sources.length > 0 && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[9.5px] uppercase tracking-wide text-zinc-600">{t("transparency.chainSource")}</span>
          {sources.map((s, i) => (
            <SourcePopover key={i} source={s ?? undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
