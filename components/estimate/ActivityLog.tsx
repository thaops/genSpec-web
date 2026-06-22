"use client";

import type { ActivityEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { SparkleIcon, EditIcon } from "@/components/ui/icons";

function timeHHMM(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Render `detail` as a diff when it looks like "from → to".
function Detail({ detail }: { detail: string }) {
  const m = detail.split(/\s*(?:→|->)\s*/);
  if (m.length === 2) {
    return (
      <span className="font-mono text-[11px]">
        <span className="text-rose-300/90 line-through">{m[0]}</span>
        <span className="px-1 text-zinc-600">→</span>
        <span className="text-emerald-300">{m[1]}</span>
      </span>
    );
  }
  return <span className="text-[11px] text-zinc-400">{detail}</span>;
}

// Reverse-chronological change log timeline, grouped by AI vs manual.
export function ActivityLog({ log }: { log: ActivityEntry[] }) {
  const { t } = useT();
  const entries = [...(log ?? [])].reverse();

  if (entries.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-zinc-600">
        {t("activity.empty")}
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 px-4 py-4">
      <span className="absolute left-[22px] top-5 bottom-5 w-px bg-zinc-800" />
      {entries.map((e, i) => {
        const ai = e.source === "ai";
        return (
          <li key={i} className="relative flex gap-3">
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border",
                ai
                  ? "border-accent-500/30 bg-accent-500/10 text-accent-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400"
              )}
            >
              {ai ? (
                <SparkleIcon className="h-3 w-3" />
              ) : (
                <EditIcon className="h-3 w-3" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] text-zinc-200">
                  {e.label}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                  {timeHHMM(e.at)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-px text-[9px] font-medium uppercase tracking-wide",
                    ai
                      ? "bg-accent-500/10 text-accent-300"
                      : "bg-zinc-800 text-zinc-500"
                  )}
                >
                  {ai ? t("activity.ai") : t("activity.manual")}
                </span>
                {e.detail && <Detail detail={e.detail} />}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
