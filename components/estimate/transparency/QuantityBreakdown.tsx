"use client";

import { useMemo } from "react";
import { cn, formatNum } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TakeoffItem } from "@/lib/types";
import { Popover } from "./Popover";
import { FormulaBreakdown } from "./FormulaExplainer";

// Clickable quantity cell that traces a BOQ total back to its take-off lines:
// Bản vẽ → công thức → khối lượng → dự toán.
export function QuantityBreakdown({
  code,
  takeoff,
  quantity,
  className,
}: {
  code: string;
  takeoff: TakeoffItem[];
  quantity: number;
  className?: string;
}) {
  const { t } = useT();
  const lines = useMemo(
    () => takeoff.filter((r) => r.code === code),
    [takeoff, code]
  );
  const sum = lines.reduce((s, r) => s + (r.quantity ?? 0), 0);

  return (
    <Popover
      className="w-80"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          title={t("transparency.viewBreakdown")}
          className={cn(
            "cursor-pointer rounded px-1 font-mono text-xs underline decoration-dotted decoration-zinc-600 underline-offset-2 transition-colors hover:text-accent-300 hover:decoration-accent-400",
            open && "text-accent-300",
            className
          )}
        >
          {formatNum(quantity)}
        </button>
      )}
    >
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {t("transparency.breakdown")}
          <span className="ml-1.5 font-mono text-accent-300">{code}</span>
        </p>

        {lines.length === 0 ? (
          <p className="py-2 text-[11px] text-zinc-500">
            {t("transparency.noTakeoff")}
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-auto">
            {lines.map((r) => (
              <div
                key={r.id}
                className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5 text-[11px]"
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-zinc-300" title={r.name}>
                    {r.group || r.name || "—"}
                  </span>
                  <span className="shrink-0 font-mono font-medium text-zinc-100">
                    {formatNum(r.quantity ?? 0)}
                  </span>
                </div>
                <FormulaBreakdown item={r} compact />
              </div>
            ))}
          </div>
        )}

        {lines.length > 0 && (
          <div className="flex items-baseline justify-between border-t border-zinc-800 pt-1.5 text-[11px]">
            <span className="text-zinc-400">{t("transparency.total")}</span>
            <span className="font-mono text-sm font-semibold text-white">
              {formatNum(sum)}
            </span>
          </div>
        )}
      </div>
    </Popover>
  );
}
