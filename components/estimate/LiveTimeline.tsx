"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { SparkleIcon, CheckCircleIcon } from "@/components/ui/icons";

export interface TimelineStep {
  text: string;
  at: string; // HH:MM:SS
}

// Realtime list of streamed reasoning steps. The last item is "current"
// (pulsing) while `streaming` is true; earlier ones are completed (checkmark).
export function LiveTimeline({
  steps,
  streaming,
}: {
  steps: TimelineStep[];
  streaming: boolean;
}) {
  const { t } = useT();
  const reduced = usePrefersReducedMotion();
  if (steps.length === 0 && !streaming) return null;

  return (
    <div className="animate-slide-up rounded-2xl border border-accent-500/25 bg-accent-500/[0.06] px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-accent-200">
        <span className="relative flex h-5 w-5 items-center justify-center rounded-md bg-accent-500/15 text-accent-300">
          {streaming && !reduced && (
            <span className="animate-pulse-glow absolute inset-0 rounded-md" />
          )}
          <SparkleIcon className="h-3 w-3" />
        </span>
        {streaming ? t("copilot.streaming") : t("copilot.liveTimeline")}
      </div>

      <ol className="relative space-y-2 pl-1">
        {/* connecting line */}
        {steps.length > 1 && (
          <span className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-accent-500/40 via-zinc-700/60 to-transparent" />
        )}
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          const current = streaming && isLast;
          return (
            <li
              key={i}
              className={cn(
                "relative flex items-start gap-2.5 pl-4 text-[12px] leading-snug",
                current ? "text-zinc-200" : "text-zinc-400",
                reduced ? "opacity-100" : "animate-slide-up"
              )}
            >
              {current ? (
                <span className="absolute left-0 top-[3px] flex h-3.5 w-3.5 items-center justify-center">
                  <span
                    className={cn(
                      "absolute inline-flex h-3.5 w-3.5 rounded-full bg-accent-400/40",
                      !reduced && "animate-ping"
                    )}
                  />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
                </span>
              ) : (
                <CheckCircleIcon className="absolute left-0 top-[2px] h-3.5 w-3.5 text-emerald-400/80" />
              )}
              <span className="min-w-0 flex-1">{s.text}</span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                {s.at}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
