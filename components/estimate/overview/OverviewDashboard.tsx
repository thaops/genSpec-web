"use client";

import type { Estimate } from "@/lib/types";
import { useT } from "@/lib/i18n/I18nProvider";
import { cn, formatVnd, formatVndShort } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { CostDonut, type DonutSlice } from "./CostDonut";
import { TopCostDrivers } from "./TopCostDrivers";
import { PipelineStatus } from "./PipelineStatus";
import { ValidationPanel } from "../transparency/ValidationPanel";
import { Boxes, HardHat, Wrench, Layers } from "lucide-react";

type IconComp = React.ComponentType<{ className?: string }>;

interface CardDef {
  key: string;
  label: string;
  value: number;
  pct: number;
  Icon: IconComp;
  accent: string;
}

export function OverviewDashboard({ estimate }: { estimate: Estimate }) {
  const { t } = useT();
  const c = estimate.costSummary;
  const pi = estimate.projectInfo;
  const directTotal = c.directTotal || 1;
  const pct = (v: number) => Math.round((v / directTotal) * 100);

  const cards: CardDef[] = [
    {
      key: "material",
      label: t("overview.cardMaterial"),
      value: c.directMaterial,
      pct: pct(c.directMaterial),
      Icon: Boxes,
      accent: "text-accent-300",
    },
    {
      key: "labor",
      label: t("overview.cardLabor"),
      value: c.directLabor,
      pct: pct(c.directLabor),
      Icon: HardHat,
      accent: "text-emerald-300",
    },
    {
      key: "machine",
      label: t("overview.cardMachine"),
      value: c.directMachine,
      pct: pct(c.directMachine),
      Icon: Wrench,
      accent: "text-sky-300",
    },
    {
      key: "overhead",
      label: t("overview.cardOverhead"),
      value: c.overhead,
      pct: pct(c.overhead),
      Icon: Layers,
      accent: "text-violet-300",
    },
  ];

  const other =
    Math.max(0, c.overhead) +
    Math.max(0, c.profit) +
    Math.max(0, c.vat) +
    Math.max(0, c.contingency);
  const slices: DonutSlice[] = [
    {
      key: "material",
      label: t("overview.legMaterial"),
      value: c.directMaterial,
      color: "#3b82f6",
    },
    {
      key: "labor",
      label: t("overview.legLabor"),
      value: c.directLabor,
      color: "#34d399",
    },
    {
      key: "machine",
      label: t("overview.legMachine"),
      value: c.directMachine,
      color: "#38bdf8",
    },
    {
      key: "other",
      label: t("overview.legOther"),
      value: other,
      color: "#a78bfa",
    },
  ];

  const infoBits = [
    pi.location && { label: t("overview.infoLocation"), value: pi.location },
    pi.normVersion && { label: t("overview.infoNorm"), value: pi.normVersion },
    pi.priceVersion && { label: t("overview.infoPrice"), value: pi.priceVersion },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-5 py-5">
        {/* Hero + info strip */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              {t("overview.grandTotal")}
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-mono text-[32px] font-bold leading-none text-white">
                {formatVndShort(c.total)}
              </span>
              <span className="font-mono text-sm tabular-nums text-zinc-400">
                {formatVnd(c.total)}
              </span>
            </div>
            <div className="mt-1 truncate text-[13px] text-zinc-400">
              {estimate.name || pi.name || t("editor.untitled")}
            </div>
          </div>

          {infoBits.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
              {infoBits.map((b) => (
                <div key={b.label} className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {b.label}
                  </div>
                  <div className="truncate text-zinc-300">{b.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cost cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.key} className="p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-zinc-400">{card.label}</span>
                <card.Icon className={cn("h-4 w-4", card.accent)} />
              </div>
              <div className="mt-1.5 font-mono text-[20px] font-semibold leading-none text-zinc-100">
                {formatVndShort(card.value)}
              </div>
              <div className="mt-1 text-[11px] tabular-nums text-zinc-500">
                {t("overview.ofDirect", { pct: card.pct })}
              </div>
            </Card>
          ))}
        </div>

        {/* Donut + Top drivers */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                {t("overview.donutTitle")}
              </h3>
              <span className="text-[11px] text-zinc-500">
                {t("overview.donutSubtitle")}
              </span>
            </div>
            <CostDonut slices={slices} />
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                {t("overview.topDrivers")}
              </h3>
              <span className="text-[11px] text-zinc-500">
                {t("overview.topDriversSub")}
              </span>
            </div>
            <TopCostDrivers estimate={estimate} />
          </Card>
        </div>

        {/* Validation self-check + Pipeline status */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                {t("validation.title")}
              </h3>
            </div>
            <ValidationPanel report={estimate.validation} />
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                {t("overview.pipeline")}
              </h3>
              <span className="text-[11px] text-zinc-500">
                {t("overview.pipelineSub")}
              </span>
            </div>
            <PipelineStatus estimate={estimate} />
          </Card>
        </div>
      </div>
    </div>
  );
}
