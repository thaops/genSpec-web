"use client";

import { useMemo, useState } from "react";
import { cn, formatNum, formatVnd } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type {
  AnalysisComponent,
  Estimate,
  PriceSource,
  ResourceKind,
  UnitPriceAnalysis,
} from "@/lib/types";
import { SheetShell, type SheetProps } from "./shell";
import { SourcePopover } from "../transparency/SourcePopover";
import { EditableTextCell } from "../EditableTextCell";
import { EditableNumberCell } from "../EditableNumberCell";
import {
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/ui/icons";

// Resolve a component's unit price from the resource sheets (05/06/07).
function priceOf(est: Estimate, c: AnalysisComponent): number {
  if (c.kind === "material")
    return est.materials.find((m) => m.code === c.ref)?.price ?? 0;
  if (c.kind === "labor")
    return est.labor.find((l) => l.grade === c.ref)?.dayRate ?? 0;
  return est.equipment.find((e) => e.code === c.ref)?.shiftRate ?? 0;
}

// Resolve a component's price provenance from the resource sheets (05/06/07).
function sourceOf(est: Estimate, c: AnalysisComponent): PriceSource | undefined {
  if (c.kind === "material")
    return est.materials.find((m) => m.code === c.ref)?.source;
  if (c.kind === "labor")
    return est.labor.find((l) => l.grade === c.ref)?.source;
  return est.equipment.find((e) => e.code === c.ref)?.source;
}

const COMP_COLS =
  "grid grid-cols-[1fr_120px_90px_56px_90px_130px_120px_32px]";

export function AnalysisSheet({ estimate, apply }: SheetProps) {
  const { t } = useT();
  const analyses = estimate.analyses ?? [];
  const [open, setOpen] = useState<Record<string, boolean>>({});

  function addAnalysis() {
    return apply([
      {
        type: "upsert_analysis",
        code: `PT.${Date.now().toString().slice(-5)}`,
        name: "",
        unit: "",
        components: [],
      },
    ]);
  }

  return (
    <SheetShell titleKey="tabs.analysis">
      <div className="space-y-3 px-4 py-4">
        {analyses.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-zinc-600">
            {t("analysis.empty")}
          </p>
        )}

        {analyses.map((a) => (
          <AnalysisCard
            key={a.id}
            estimate={estimate}
            apply={apply}
            analysis={a}
            open={open[a.id] ?? false}
            onToggle={() =>
              setOpen((p) => ({ ...p, [a.id]: !(p[a.id] ?? false) }))
            }
          />
        ))}

        <button
          onClick={addAnalysis}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-accent-500/40 hover:text-accent-300"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t("analysis.add")}
        </button>
      </div>
    </SheetShell>
  );
}

function AnalysisCard({
  estimate,
  apply,
  analysis,
  open,
  onToggle,
}: {
  estimate: Estimate;
  apply: SheetProps["apply"];
  analysis: UnitPriceAnalysis;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useT();

  const kindLabel: Record<ResourceKind, string> = {
    material: t("analysis.kindMaterial"),
    labor: t("analysis.kindLabor"),
    equipment: t("analysis.kindEquipment"),
  };

  const lines = useMemo(
    () =>
      analysis.components.map((c) => {
        const price = priceOf(estimate, c);
        return { c, price, amount: price * c.norm, source: sourceOf(estimate, c) };
      }),
    [analysis.components, estimate]
  );
  const unitPrice = lines.reduce((s, l) => s + l.amount, 0);

  // Persist a mutated component list for this analysis.
  function saveComponents(components: AnalysisComponent[]) {
    return apply([
      {
        type: "upsert_analysis",
        id: analysis.id,
        code: analysis.code,
        name: analysis.name,
        unit: analysis.unit,
        components,
      },
    ]);
  }

  function saveHead(p: Partial<UnitPriceAnalysis>) {
    return apply([
      {
        type: "upsert_analysis",
        id: analysis.id,
        code: p.code ?? analysis.code,
        name: p.name ?? analysis.name,
        unit: p.unit ?? analysis.unit,
        components: analysis.components,
      },
    ]);
  }

  function patchComponent(idx: number, patch: Partial<AnalysisComponent>) {
    const next = analysis.components.map((c, i) =>
      i === idx ? { ...c, ...patch } : c
    );
    return saveComponents(next);
  }

  function addComponent() {
    return saveComponents([
      ...analysis.components,
      { kind: "material", ref: "", norm: 0 },
    ]);
  }

  function removeComponent(idx: number) {
    return saveComponents(analysis.components.filter((_, i) => i !== idx));
  }

  function removeAnalysis() {
    return apply([{ type: "delete_analysis", id: analysis.id }]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      {/* Card header */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-2 py-1.5">
        <button
          onClick={onToggle}
          className="rounded p-1 text-zinc-500 hover:text-zinc-200"
          aria-label={analysis.code}
        >
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 transition-transform",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
        </button>
        <div className="w-32 shrink-0">
          <EditableTextCell
            value={analysis.code}
            mono
            className="text-accent-300"
            onCommit={(v) => saveHead({ code: v })}
          />
        </div>
        <div className="min-w-0 flex-1">
          <EditableTextCell
            value={analysis.name}
            placeholder={t("analysis.name")}
            onCommit={(v) => saveHead({ name: v })}
          />
        </div>
        <div className="w-16 shrink-0">
          <EditableTextCell
            value={analysis.unit}
            align="right"
            placeholder={t("analysis.unit")}
            onCommit={(v) => saveHead({ unit: v })}
          />
        </div>
        <div className="flex w-40 shrink-0 items-baseline justify-end gap-1.5 px-2">
          <span className="text-[10px] uppercase text-zinc-500">
            {t("analysis.unitPrice")}
          </span>
          <span className="font-mono text-sm font-semibold text-zinc-100">
            {formatNum(unitPrice)}
          </span>
        </div>
        <button
          onClick={removeAnalysis}
          className="rounded p-1.5 text-zinc-600 transition-colors hover:text-rose-400"
          aria-label={t("sheet.deleteRow")}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div>
          <div
            className={cn(
              COMP_COLS,
              "border-b border-zinc-800/60 bg-zinc-950/40 text-[10px] font-medium uppercase tracking-wide text-zinc-500"
            )}
          >
            <div className="px-2 py-1.5">{t("analysis.component")}</div>
            <div className="px-2 py-1.5">{t("analysis.ref")}</div>
            <div className="px-2 py-1.5">{t("analysis.kind")}</div>
            <div className="px-2 py-1.5">{t("analysis.unit")}</div>
            <div className="px-2 py-1.5 text-right">{t("analysis.norm")}</div>
            <div className="px-2 py-1.5 text-right">{t("analysis.price")}</div>
            <div className="px-2 py-1.5 text-right">{t("analysis.amount")}</div>
            <div />
          </div>

          {lines.map((l, idx) => (
            <div
              key={idx}
              className={cn(
                COMP_COLS,
                "group items-center border-b border-zinc-800/40 text-zinc-300 hover:bg-zinc-800/30"
              )}
            >
              <EditableTextCell
                value={l.c.name ?? ""}
                placeholder={t("analysis.component")}
                onCommit={(v) => patchComponent(idx, { name: v })}
              />
              <EditableTextCell
                value={l.c.ref}
                mono
                onCommit={(v) => patchComponent(idx, { ref: v })}
              />
              <div className="px-1">
                <select
                  value={l.c.kind}
                  onChange={(e) =>
                    patchComponent(idx, {
                      kind: e.target.value as ResourceKind,
                    })
                  }
                  className="w-full cursor-pointer rounded bg-transparent py-1 text-xs text-zinc-300 outline-none hover:bg-zinc-800/60 focus:bg-zinc-800"
                >
                  {(["material", "labor", "equipment"] as ResourceKind[]).map(
                    (k) => (
                      <option key={k} value={k} className="bg-zinc-900">
                        {kindLabel[k]}
                      </option>
                    )
                  )}
                </select>
              </div>
              <EditableTextCell
                value={l.c.unit ?? ""}
                onCommit={(v) => patchComponent(idx, { unit: v })}
              />
              <EditableNumberCell
                value={l.c.norm}
                onCommit={(v) => patchComponent(idx, { norm: v })}
              />
              <div className="flex items-center justify-end gap-1 px-2 py-1.5 text-right font-mono text-xs text-zinc-400">
                <SourcePopover source={l.source} />
                {formatNum(l.price)}
              </div>
              <div
                className="px-2 py-1.5 text-right font-mono text-xs font-medium text-zinc-100"
                title={`${t("analysis.norm")} ${formatNum(
                  l.c.norm
                )} × ${t("analysis.price")} ${formatNum(
                  l.price
                )} = ${formatNum(l.amount)}`}
              >
                {formatNum(l.amount)}
              </div>
              <div className="flex items-center justify-center">
                <button
                  onClick={() => removeComponent(idx)}
                  className="rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                  aria-label={t("sheet.deleteRow")}
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={addComponent}
              className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-accent-300"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t("analysis.addComponent")}
            </button>
            <span className="flex items-baseline gap-1.5">
              <span
                className="text-[10px] text-zinc-500"
                title={t("transparency.formulaLabel")}
              >
                = Σ
              </span>
              <span className="font-mono text-xs font-medium text-zinc-200">
                {formatVnd(unitPrice)}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
