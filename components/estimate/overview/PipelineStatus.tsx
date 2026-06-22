"use client";

import type { Estimate } from "@/lib/types";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, AlertIcon } from "@/components/ui/icons";

interface Step {
  labelKey: TKey;
  ok: boolean;
}

function deriveSteps(e: Estimate): Step[] {
  const materialsOk =
    e.materials.length > 0 &&
    e.materials.every((m) => m.price > 0 && (m.source?.name?.trim()?.length ?? 0) > 0);
  return [
    { labelKey: "overview.stepTakeoff", ok: e.takeoff.length > 0 },
    { labelKey: "overview.stepBoq", ok: e.boq.length > 0 },
    { labelKey: "overview.stepAnalysis", ok: e.analyses.length > 0 },
    { labelKey: "overview.stepMaterials", ok: materialsOk },
    { labelKey: "overview.stepLabor", ok: e.labor.length > 0 },
    { labelKey: "overview.stepEquipment", ok: e.equipment.length > 0 },
    { labelKey: "overview.stepCost", ok: e.costSummary.total > 0 },
  ];
}

export function PipelineStatus({ estimate }: { estimate: Estimate }) {
  const { t } = useT();
  const steps = deriveSteps(estimate);

  return (
    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-1">
      {steps.map((s) => (
        <li
          key={s.labelKey}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]",
            s.ok
              ? "border-emerald-500/20 bg-emerald-500/5 text-zinc-200"
              : "border-amber-500/20 bg-amber-500/5 text-zinc-300"
          )}
        >
          {s.ok ? (
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertIcon className="h-4 w-4 shrink-0 text-amber-400" />
          )}
          <span className="min-w-0 flex-1 truncate">{t(s.labelKey)}</span>
          <span
            className={cn(
              "shrink-0 text-[10px] font-medium uppercase tracking-wide",
              s.ok ? "text-emerald-400/80" : "text-amber-400/80"
            )}
          >
            {s.ok ? t("overview.statusOk") : t("overview.statusWarn")}
          </span>
        </li>
      ))}
    </ul>
  );
}
