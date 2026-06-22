"use client";

import { useMemo } from "react";
import { cn, formatNum } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { ResourceKind } from "@/lib/types";
import { SheetShell, HeadRow, H, type SheetProps } from "./shell";
import { Footer } from "./BoqSheet";

const COLS =
  "grid grid-cols-[110px_minmax(200px,1fr)_64px_120px_120px_140px]";

export function MaterialSummarySheet({ estimate }: SheetProps) {
  const { t } = useT();

  const kindLabel: Record<ResourceKind, string> = {
    material: t("analysis.kindMaterial"),
    labor: t("analysis.kindLabor"),
    equipment: t("analysis.kindEquipment"),
  };

  const rows = useMemo(
    () =>
      [...(estimate.materialSummary ?? [])].sort((a, b) => b.amount - a.amount),
    [estimate.materialSummary]
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <SheetShell titleKey="tabs.matSummary" readonly>
      <div className="min-w-[760px]">
        <HeadRow cols={COLS}>
          <H>{t("matSummary.kind")}</H>
          <H>{t("matSummary.name")}</H>
          <H>{t("matSummary.unit")}</H>
          <H right>{t("matSummary.quantity")}</H>
          <H right>{t("matSummary.price")}</H>
          <H right>{t("matSummary.amount")}</H>
        </HeadRow>

        {rows.length === 0 && (
          <p className="px-4 py-16 text-center text-sm text-zinc-600">
            {t("sheet.empty")}
          </p>
        )}

        {rows.map((r, idx) => (
          <div
            key={`${r.kind}-${r.ref}-${idx}`}
            className={cn(
              COLS,
              "items-center border-b border-zinc-800/60 text-zinc-300 hover:bg-zinc-800/40",
              idx % 2 === 1 && "bg-zinc-900/20"
            )}
          >
            <div className="px-2 py-1.5 text-[11px] text-zinc-400">
              {kindLabel[r.kind]}
            </div>
            <div className="truncate px-2 py-1.5 text-xs" title={r.name}>
              <span className="font-mono text-zinc-500">{r.ref}</span> {r.name}
            </div>
            <div className="px-2 py-1.5 text-xs text-zinc-400">{r.unit}</div>
            <div className="px-2 py-1.5 text-right font-mono text-xs text-zinc-300">
              {formatNum(r.quantity)}
            </div>
            <div className="px-2 py-1.5 text-right font-mono text-xs text-zinc-400">
              {formatNum(r.price)}
            </div>
            <div className="px-2 py-1.5 text-right font-mono text-xs font-medium text-zinc-100">
              {formatNum(r.amount)}
            </div>
          </div>
        ))}
      </div>

      <Footer label={t("matSummary.total")} value={total} />
    </SheetShell>
  );
}
