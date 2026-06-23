"use client";

import type { Confidence } from "@/lib/types";
import { useT } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, AlertIcon } from "@/components/ui/icons";
import { ConfidenceBadges } from "./ConfidenceBadges";

// Confidence with its BASIS: per-section badges, the reasons that raise it,
// the data still missing, and the estimated ± uncertainty. No bare scores.
export function ConfidenceCard({ confidence }: { confidence?: Confidence }) {
  const { t } = useT();
  if (!confidence) return null;

  const reasons = confidence.reasons?.filter((r) => r?.trim()) ?? [];
  const missing = confidence.missing?.filter((m) => m?.trim()) ?? [];
  const unc = confidence.uncertaintyPct;

  return (
    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
      <ConfidenceBadges confidence={confidence} />

      {reasons.length > 0 && (
        <Section
          tone="emerald"
          icon={<CheckCircleIcon className="h-3 w-3" />}
          label={t("copilot.confReasons")}
          items={reasons}
        />
      )}
      {missing.length > 0 && (
        <Section
          tone="amber"
          icon={<AlertIcon className="h-3 w-3" />}
          label={t("copilot.confMissing")}
          items={missing}
        />
      )}

      {typeof unc === "number" && (
        <div className="flex items-baseline justify-between border-t border-zinc-800/70 pt-1.5 text-[11px]">
          <span className="text-zinc-500">{t("copilot.confUncertainty")}</span>
          <span className="font-mono font-semibold text-zinc-200">±{Math.round(unc)}%</span>
        </div>
      )}
    </div>
  );
}

const TONE: Record<"emerald" | "amber", string> = {
  emerald: "text-emerald-300",
  amber: "text-amber-300",
};

function Section({
  tone,
  icon,
  label,
  items,
}: {
  tone: "emerald" | "amber";
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  return (
    <div>
      <div className={cn("mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide", TONE[tone])}>
        {icon}
        {label}
      </div>
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] text-zinc-300">
            <span className={cn("select-none", TONE[tone])}>•</span>
            <span className="min-w-0 flex-1">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
