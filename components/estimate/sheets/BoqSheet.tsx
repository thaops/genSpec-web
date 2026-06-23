"use client";

import { cn, formatNum, formatVnd } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { SheetShell, HeadRow, H, type SheetProps } from "./shell";
import { QuantityBreakdown } from "../transparency/QuantityBreakdown";
import { CostTrace } from "../transparency/CostTrace";

const COLS =
  "grid grid-cols-[56px_130px_minmax(200px,1fr)_64px_96px_120px_140px]";

export function BoqSheet({ estimate }: SheetProps) {
  const { t } = useT();
  const rows = estimate.boq ?? [];
  const takeoff = estimate.takeoff ?? [];
  const directTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <SheetShell titleKey="tabs.boq" readonly hint={t("boq.hint")}>
      <div className="min-w-[860px]">
        <HeadRow cols={COLS}>
          <H>{t("boq.stt")}</H>
          <H>{t("boq.code")}</H>
          <H>{t("boq.name")}</H>
          <H>{t("boq.unit")}</H>
          <H right>{t("boq.quantity")}</H>
          <H right>{t("boq.unitPrice")}</H>
          <H right>{t("boq.total")}</H>
        </HeadRow>

        {rows.length === 0 && (
          <p className="px-4 py-16 text-center text-sm text-zinc-600">
            {t("sheet.empty")}
          </p>
        )}

        {rows.map((r, idx) => (
          <div
            key={`${r.code}-${idx}`}
            className={cn(
              COLS,
              "items-center border-b border-zinc-800/60 text-zinc-300 hover:bg-zinc-800/40",
              idx % 2 === 1 && "bg-zinc-900/20"
            )}
          >
            <div className="px-2 py-1.5 text-xs text-zinc-500">{idx + 1}</div>
            <div className="truncate px-2 py-1.5 font-mono text-xs text-accent-300">
              {r.code}
            </div>
            <div className="truncate px-2 py-1.5 text-xs" title={r.name}>
              {r.name}
            </div>
            <div className="px-2 py-1.5 text-xs text-zinc-400">{r.unit}</div>
            <div className="flex justify-end px-2 py-1.5 text-right">
              <QuantityBreakdown
                code={r.code}
                takeoff={takeoff}
                quantity={r.quantity}
                className="text-zinc-300"
              />
            </div>
            <div className="flex justify-end px-2 py-1.5 text-right">
              <CostTrace row={r} estimate={estimate} className="text-zinc-400" />
            </div>
            <div className="px-2 py-1.5 text-right font-mono text-xs font-medium text-zinc-100">
              {formatNum(r.total)}
            </div>
          </div>
        ))}
      </div>

      <Footer label={t("boq.directTotal")} value={directTotal} />
    </SheetShell>
  );
}

export function Footer({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
      <div className="flex items-baseline justify-end gap-2 text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-base font-semibold text-white">
          {formatVnd(value)}
        </span>
      </div>
    </div>
  );
}
