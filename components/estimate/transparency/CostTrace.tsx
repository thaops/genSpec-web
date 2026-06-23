"use client";

import { useMemo } from "react";
import type { BoqRow, Estimate, ResourceKind, TraceItem } from "@/lib/types";
import { useT } from "@/lib/i18n/I18nProvider";
import { cn, formatNum } from "@/lib/utils";
import { Popover } from "./Popover";
import { SourcePopover } from "./SourcePopover";

const KIND_TONE: Record<ResourceKind, string> = {
  material: "text-accent-300",
  labor: "text-emerald-300",
  equipment: "text-sky-300",
};

// Compose a readable derivation for one take-off line: prefer the formula,
// else the L×W×H×count dimensions ("6 × 1.8 × 1.8 × 0.5").
function deriveExpr(line: TraceItem["quantityTrace"][number]): string | null {
  if (line.formula?.trim()) return line.formula.trim();
  const d = line.dims;
  if (!d) return null;
  const parts = [d.length, d.width, d.height, d.count].filter((v) => v != null) as number[];
  return parts.length ? parts.map((v) => formatNum(v)).join(" × ") : null;
}

// Clickable unit-price cell that traces the full QS chain for a BOQ row from
// the authoritative backend trace engine:
// Nguồn → Giả định → Công thức → Khối lượng → Đơn giá → Thành tiền.
export function CostTrace({
  row,
  estimate,
  className,
}: {
  row: BoqRow;
  estimate: Estimate;
  className?: string;
}) {
  const { t } = useT();

  const item = useMemo<TraceItem | undefined>(
    () => estimate.trace?.find((tr) => tr.code.toLowerCase() === row.code.toLowerCase()),
    [estimate.trace, row.code]
  );

  const components = item?.components ?? [];
  const qtyLines = item?.quantityTrace ?? [];
  const assumptions = item?.assumptions ?? [];

  if (row.unitPrice <= 0 && components.length === 0) {
    return <span className={cn("font-mono text-xs text-zinc-500", className)}>{formatNum(row.unitPrice)}</span>;
  }

  return (
    <Popover
      className="w-[26rem]"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          title={t("transparency.viewUnitPrice")}
          className={cn(
            "cursor-pointer rounded px-1 font-mono text-xs underline decoration-dotted decoration-zinc-600 underline-offset-2 transition-colors hover:text-accent-300 hover:decoration-accent-400",
            open && "text-accent-300",
            className
          )}
        >
          {formatNum(row.unitPrice)}
        </button>
      )}
    >
      <div className="space-y-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {t("transparency.unitPriceTrace")}
          <span className="ml-1.5 font-mono text-accent-300">{row.code}</span>
        </p>

        {/* Chain header */}
        <div className="flex flex-wrap items-center gap-1 text-[9.5px] font-medium uppercase tracking-wide text-zinc-600">
          {[
            t("transparency.chainSource"),
            t("transparency.chainAssumption"),
            t("transparency.chainFormula"),
            t("transparency.chainQuantity"),
            t("transparency.chainUnitPrice"),
            t("transparency.chainCost"),
          ].map((c, i) => (
            <span key={c} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-700">→</span>}
              <span>{c}</span>
            </span>
          ))}
        </div>

        {/* Assumptions */}
        {assumptions.length > 0 && (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {t("transparency.assumption")}
            </p>
            <ul className="space-y-0.5 text-[11px] text-zinc-300">
              {assumptions.slice(0, 4).map((a, i) => (
                <li key={i}>• {a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Quantity derivation: formula → quantity per take-off line */}
        {qtyLines.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {t("transparency.chainFormula")} → {t("transparency.chainQuantity")}
            </p>
            <div className="max-h-32 space-y-1 overflow-auto">
              {qtyLines.map((l, i) => {
                const expr = deriveExpr(l);
                return (
                  <div key={l.takeoffId || i} className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1 text-[11px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-zinc-300" title={l.note || l.group}>
                        {l.note || l.group || row.name}
                      </span>
                      <span className="shrink-0 font-mono font-medium text-zinc-100">{formatNum(l.quantity)}</span>
                    </div>
                    {expr && (
                      <div className="mt-0.5 font-mono text-[10.5px] text-zinc-500">
                        {expr} = {formatNum(l.quantity)} {row.unit}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unit-price components: norm × resource price = amount, each with source */}
        {components.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {t("transparency.unitPriceTrace")}
            </p>
            <div className="max-h-44 space-y-1 overflow-auto">
              {components.map((c, i) => (
                <div key={i} className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5 text-[11px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate", KIND_TONE[c.kind])} title={c.name}>
                      {c.name}
                    </span>
                    <SourcePopover source={c.source} />
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-[10.5px] text-zinc-400">
                    <span>
                      {t("transparency.norm")} {formatNum(c.norm)} × {formatNum(c.price)}
                    </span>
                    <span className="font-medium text-zinc-200">{formatNum(c.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Roll-up: unit price × quantity = total */}
        <div className="space-y-1 border-t border-zinc-800 pt-1.5 text-[11px]">
          <Line label={t("transparency.chainUnitPrice")} value={formatNum(row.unitPrice)} />
          <Line label={`${t("transparency.chainQuantity")} (${row.unit})`} value={formatNum(row.quantity)} />
          <div className="flex items-baseline justify-between">
            <span className="text-zinc-400">{t("transparency.chainCost")}</span>
            <span className="font-mono text-sm font-semibold text-white">{formatNum(row.total)}</span>
          </div>
        </div>
      </div>
    </Popover>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono tabular-nums text-zinc-300">{value}</span>
    </div>
  );
}
