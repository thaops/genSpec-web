"use client";

import type { Confidence } from "@/lib/types";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

// Map a 0-100 score to a tone (≥90 emerald, 70-89 amber, <70 rose).
export function confTone(score: number): "emerald" | "amber" | "rose" {
  if (score >= 90) return "emerald";
  if (score >= 70) return "amber";
  return "rose";
}

const TONE_CLASS: Record<"emerald" | "amber" | "rose", string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

const SECTIONS: { key: keyof Confidence; label: TKey }[] = [
  { key: "boq", label: "copilot.confBoq" },
  { key: "materials", label: "copilot.confMaterials" },
  { key: "labor", label: "copilot.confLabor" },
  { key: "equipment", label: "copilot.confEquipment" },
];

// Per-section confidence chips + an overall pill. Renders nothing if empty.
export function ConfidenceBadges({
  confidence,
  showOverall = true,
}: {
  confidence?: Confidence;
  showOverall?: boolean;
}) {
  const { t } = useT();
  if (!confidence) return null;

  const sections = SECTIONS.filter(
    (s) => typeof confidence[s.key] === "number"
  );
  const hasOverall =
    showOverall && typeof confidence.overall === "number";
  if (sections.length === 0 && !hasOverall) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasOverall && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            TONE_CLASS[confTone(confidence.overall as number)]
          )}
        >
          {t("copilot.confidenceOverall")} {Math.round(confidence.overall as number)}%
        </span>
      )}
      {sections.map((s) => {
        const v = confidence[s.key] as number;
        return (
          <span
            key={s.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              TONE_CLASS[confTone(v)]
            )}
          >
            {t(s.label)} {Math.round(v)}%
          </span>
        );
      })}
    </div>
  );
}
