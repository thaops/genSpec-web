"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";
import { GridIcon } from "@/components/ui/icons";

// Fixed set of 9 named QS sheets.
export type SheetKey =
  | "info"
  | "takeoff"
  | "boq"
  | "analysis"
  | "materials"
  | "labor"
  | "equipment"
  | "matSummary"
  | "cost";

// Overview is a synthetic first tab (a dashboard, not an editable sheet).
export type TabKey = "overview" | SheetKey;

export const SHEET_TABS: { key: SheetKey; label: TKey; readonly?: boolean }[] = [
  { key: "info", label: "tabs.info" },
  { key: "takeoff", label: "tabs.takeoff" },
  { key: "boq", label: "tabs.boq", readonly: true },
  { key: "analysis", label: "tabs.analysis" },
  { key: "materials", label: "tabs.materials" },
  { key: "labor", label: "tabs.labor" },
  { key: "equipment", label: "tabs.equipment" },
  { key: "matSummary", label: "tabs.matSummary", readonly: true },
  { key: "cost", label: "tabs.cost" },
];

interface Props {
  active: TabKey;
  onSelect: (key: TabKey) => void;
}

export function SheetTabs({ active, onSelect }: Props) {
  const { t } = useT();
  const overviewActive = active === "overview";
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-950/60 px-2 pt-1.5">
      <button
        type="button"
        role="tab"
        aria-selected={overviewActive}
        onClick={() => onSelect("overview")}
        className={cn(
          "my-1 mr-1 flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-[13px] font-semibold transition-colors",
          overviewActive
            ? "border-accent-400 bg-zinc-900 text-accent-200"
            : "border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
        )}
      >
        <GridIcon className="h-3.5 w-3.5" />
        {t("tabs.overview")}
      </button>
      <span className="my-2 w-px shrink-0 bg-zinc-800" aria-hidden />
      {SHEET_TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.key)}
            className={cn(
              "my-1 flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? tab.readonly
                  ? "border-emerald-500 bg-zinc-900 text-emerald-200"
                  : "border-accent-500 bg-zinc-900 text-zinc-100"
                : "border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
            )}
          >
            {t(tab.label)}
          </button>
        );
      })}
    </div>
  );
}
