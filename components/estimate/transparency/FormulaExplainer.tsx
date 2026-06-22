"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TakeoffItem } from "@/lib/types";
import {
  explainFormula,
  dimsExpression,
  displayNum,
  type FormulaExplanation,
} from "@/lib/formula";
import { InfoIcon } from "@/components/ui/icons";
import { Popover } from "./Popover";

// Build the explanation for a row: explicit formula if present, else the
// implicit dimensional product (Dài × Rộng × Cao × SL).
function explainRow(r: TakeoffItem): FormulaExplanation | null {
  const explicit = r.formula?.trim();
  if (explicit) return explainFormula(explicit);
  const dims = dimsExpression(r); // already × form
  if (!dims || dims === "—") return null;
  return explainFormula(dims.replace(/×/g, "*"));
}

// Annotate a single-product term with the dim labels when its operand count
// matches the row's populated dimensions (best effort, Dài×Rộng×Cao×SL).
function dimHint(r: TakeoffItem, termExpr: string): string | null {
  const operands = termExpr.split("×").map((s) => s.trim());
  if (operands.length < 2 || termExpr.includes("(")) return null;
  const labels = ["takeoff.length", "takeoff.width", "takeoff.height", "takeoff.count"] as const;
  const present = [r.length, r.width, r.height, r.count]
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v != null && x.v !== 0);
  if (present.length !== operands.length) return null;
  return present.map((x) => labels[x.i]).join("|");
}

// Inner breakdown body — reused by FormulaExplainer popover and
// QuantityBreakdown line popovers.
export function FormulaBreakdown({
  item,
  compact,
}: {
  item: TakeoffItem;
  compact?: boolean;
}) {
  const { t } = useT();
  const ex = explainRow(item);
  const note = item.note?.trim();

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      {note && (
        <p className="text-[11px] font-medium leading-snug text-zinc-100">
          {note}
        </p>
      )}
      {!note && !compact && (
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {t("transparency.derivation")}
        </p>
      )}

      {ex ? (
        <div className="space-y-1">
          {ex.terms.map((term, i) => {
            const hint = dimHint(item, term.expr);
            return (
              <div
                key={i}
                className="flex items-baseline justify-between gap-3 font-mono text-[11px]"
              >
                <span className="min-w-0 break-all text-zinc-300">
                  {term.expr}
                  {hint && (
                    <span className="ml-1 font-sans text-[10px] text-zinc-600">
                      ({hint.split("|").map((k) => t(k as Parameters<typeof t>[0])).join("×")})
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-zinc-200">
                  = {displayNum(term.value)}
                </span>
              </div>
            );
          })}

          {ex.factor && (
            <div className="flex items-baseline justify-between gap-3 border-t border-zinc-800/70 pt-1 font-mono text-[11px] text-zinc-400">
              <span>
                {ex.factor.expr}
                <span className="ml-1 font-sans text-[10px] text-zinc-600">
                  ({t("transparency.factorHint")})
                </span>
              </span>
            </div>
          )}

          <div className="flex items-baseline justify-between gap-3 border-t border-zinc-800 pt-1.5">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
              {t("transparency.total")}
            </span>
            <span className="font-mono text-sm font-semibold text-white">
              = {displayNum(ex.total)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500">{t("transparency.noFormula")}</p>
      )}
    </div>
  );
}

// Small "ⓘ explain" trigger that opens the term-by-term breakdown for a row.
export function FormulaExplainer({
  item,
  className,
}: {
  item: TakeoffItem;
  className?: string;
}) {
  const { t } = useT();
  return (
    <Popover
      align="start"
      className="w-72"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          title={t("transparency.explain")}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-600 transition-colors hover:text-accent-300",
            open && "text-accent-300",
            className
          )}
        >
          <InfoIcon className="h-3.5 w-3.5" />
        </button>
      )}
    >
      <FormulaBreakdown item={item} />
    </Popover>
  );
}
