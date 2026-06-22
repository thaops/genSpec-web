"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { useStaggerReveal, useCycle, usePrefersReducedMotion } from "@/lib/hooks";
import { SparkleIcon, CheckCircleIcon, ChevronDownIcon } from "@/components/ui/icons";
import type { TKey } from "@/lib/i18n/dictionaries";

const STATUS_KEYS: TKey[] = [
  "copilot.think1",
  "copilot.think2",
  "copilot.think3",
  "copilot.think4",
];

// Animated "đang suy nghĩ" card shown while a copilot request is in flight.
export function ThinkingLive({ hasFiles }: { hasFiles: boolean }) {
  const { t } = useT();
  const keys: TKey[] = hasFiles
    ? ["copilot.thinkFiles", ...STATUS_KEYS]
    : STATUS_KEYS;
  const idx = useCycle(keys.length, { interval: 1500 });

  return (
    <div className="animate-slide-up flex items-start gap-2.5 rounded-2xl border border-accent-500/25 bg-accent-500/[0.06] px-3.5 py-3">
      <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-300">
        <span className="animate-pulse-glow absolute inset-0 rounded-lg" />
        <SparkleIcon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[13px] font-medium">
          <span key={idx} className="text-shimmer animate-fade-in">
            {t(keys[idx])}
          </span>
        </p>
        <div className="mt-2 flex gap-1">
          {keys.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i <= idx ? "bg-accent-500/60" : "bg-zinc-700/60"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Step-by-step reveal of the real `thinking` steps. `revealed` controls whether
// the staggered animation runs (true the first time only).
export function ThinkingTrace({
  steps,
  revealed,
  defaultOpen = true,
}: {
  steps: string[];
  revealed: boolean;
  defaultOpen?: boolean;
}) {
  const { t } = useT();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(defaultOpen);
  const visible = useStaggerReveal(steps.length, {
    enabled: revealed,
    interval: 240,
  });

  if (steps.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-accent-300"
      >
        <CheckCircleIcon className="h-3.5 w-3.5 text-accent-400/70" />
        {t("copilot.reasoningSteps", { count: steps.length })}
        <ChevronDownIcon
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            open ? "rotate-180" : "rotate-0"
          )}
        />
      </button>

      {open && (
        <ol className="relative mt-2 space-y-1.5 pl-1">
          {/* connecting line */}
          <span className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-gradient-to-b from-accent-500/40 via-zinc-700/60 to-transparent" />
          {steps.map((step, i) => {
            const shown = !revealed || i < visible;
            return (
              <li
                key={i}
                className={cn(
                  "relative flex items-start gap-2 pl-4 text-[12px] leading-snug text-zinc-400",
                  shown
                    ? reduced
                      ? "opacity-100"
                      : "animate-slide-up"
                    : "opacity-0"
                )}
                style={shown && !reduced ? { animationDelay: `${i * 20}ms` } : undefined}
              >
                <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full border border-accent-400/60 bg-accent-500/30" />
                <span>{step}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
