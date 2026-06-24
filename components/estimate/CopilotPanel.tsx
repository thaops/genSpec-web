"use client";

import { useState } from "react";
import type { Ref } from "react";
import type { Estimate, Confidence } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { SparkleIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Copilot, type CopilotHandle } from "./Copilot";
import { confTone } from "./ConfidenceBadges";

const STORAGE_KEY = "genspec_copilot_collapsed";

interface Props {
  estimate: Estimate;
  onEstimateUpdated: (e: Estimate) => void;
  controlRef?: Ref<CopilotHandle>;
  // controlled collapse (so the page can auto-expand on pending prompt)
  collapsed: boolean;
  onCollapsedChange: (c: boolean) => void;
  activeSheetId?: string;
  selectedRange?: { startRow: number; startCol: number; endRow: number; endCol: number };
  onFindings?: (findings: any[]) => void;
}

type Tab = "chat" | "activity";

// Docked AI side panel (right of the editor). Collapses to a thin rail.
export function CopilotPanel({
  estimate,
  onEstimateUpdated,
  controlRef,
  collapsed,
  onCollapsedChange,
  activeSheetId,
  selectedRange,
  onFindings,
}: Props) {
  const { t } = useT();
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [confidence, setConfidence] = useState<Confidence | null>(null);

  // Persist collapsed state.
  function setCollapsed(c: boolean) {
    onCollapsedChange(c);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, c ? "1" : "0");
    }
  }

  // Collapsed rail.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={t("copilot.expand")}
        title={t("copilot.expand")}
        className="group flex w-12 shrink-0 flex-col items-center gap-3 border-l border-zinc-800 bg-zinc-950 py-4"
      >
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            "bg-gradient-to-br from-accent-500 to-accent-700 text-white",
            "shadow-[0_8px_24px_-8px_rgba(59,130,246,0.7)] transition-transform group-hover:scale-105"
          )}
        >
          <SparkleIcon className="h-5 w-5" />
          {working && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-zinc-950 bg-emerald-400" />
            </span>
          )}
        </span>
        <span
          className="text-[11px] font-medium tracking-wide text-zinc-500 group-hover:text-zinc-300"
          style={{ writingMode: "vertical-rl" }}
        >
          {t("copilot.title")}
        </span>
      </button>
    );
  }

  const overall = confidence?.overall;

  return (
    <aside
      aria-label={t("copilot.title")}
      className="flex w-full max-w-[440px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">
          <SparkleIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-200">
            {t("copilot.title")}
          </h2>
          <p className="truncate text-[11px] text-zinc-500">
            {t("copilot.subtitle")}
          </p>
        </div>
        {typeof overall === "number" && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              confTone(overall) === "emerald" &&
                "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              confTone(overall) === "amber" &&
                "border-amber-500/30 bg-amber-500/10 text-amber-300",
              confTone(overall) === "rose" &&
                "border-rose-500/30 bg-rose-500/10 text-rose-300"
            )}
            title={t("copilot.confidence")}
          >
            {Math.round(overall)}%
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label={t("copilot.collapse")}
          title={t("copilot.collapse")}
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <Copilot
          estimate={estimate}
          onEstimateUpdated={onEstimateUpdated}
          onLoadingChange={setWorking}
          onConfidence={setConfidence}
          tab={tab}
          onTabChange={setTab}
          controlRef={controlRef}
          activeSheetId={activeSheetId}
          selectedRange={selectedRange}
          onFindings={onFindings}
        />
      </div>
    </aside>
  );
}

// Read the persisted collapsed flag (client only).
export function readCopilotCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}
