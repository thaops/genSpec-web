"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { Labor } from "@/lib/types";
import { SheetShell, HeadRow, H, type SheetProps } from "./shell";
import { EditableTextCell } from "../EditableTextCell";
import { EditableNumberCell } from "../EditableNumberCell";
import { TrashIcon, PlusIcon } from "@/components/ui/icons";
import { SourcePopover } from "../transparency/SourcePopover";

const COLS = "grid grid-cols-[150px_minmax(220px,1fr)_150px_36px]";

export function LaborSheet({ estimate, apply }: SheetProps) {
  const { t } = useT();
  const rows = estimate.labor ?? [];

  function patch(l: Labor, p: Partial<Labor>) {
    return apply([
      {
        type: "upsert_labor",
        id: l.id,
        grade: l.grade,
        name: l.name,
        dayRate: l.dayRate,
        ...p,
      },
    ]);
  }

  function add() {
    return apply([{ type: "upsert_labor", grade: "", name: "", dayRate: 0 }]);
  }

  return (
    <SheetShell titleKey="tabs.labor">
      <div className="min-w-[620px]">
        <HeadRow cols={COLS}>
          <H>{t("laborSheet.grade")}</H>
          <H>{t("laborSheet.name")}</H>
          <H right>{t("laborSheet.dayRate")}</H>
          <H />
        </HeadRow>

        {rows.length === 0 && (
          <p className="px-4 py-16 text-center text-sm text-zinc-600">
            {t("sheet.empty")}
          </p>
        )}

        {rows.map((l, idx) => (
          <div
            key={l.id}
            className={cn(
              COLS,
              "group items-center border-b border-zinc-800/60 text-zinc-300",
              idx % 2 === 1 && "bg-zinc-900/20",
              "hover:bg-zinc-800/40"
            )}
          >
            <EditableTextCell
              value={l.grade}
              mono
              className="text-accent-300"
              onCommit={(v) => patch(l, { grade: v })}
            />
            <EditableTextCell value={l.name} onCommit={(v) => patch(l, { name: v })} />
            <div className="flex items-center justify-end gap-1 px-1">
              <SourcePopover source={l.source} />
              <div className="min-w-[72px]">
                <EditableNumberCell
                  value={l.dayRate}
                  onCommit={(v) => patch(l, { dayRate: v })}
                />
              </div>
            </div>
            <div className="flex items-center justify-center">
              <button
                onClick={() => apply([{ type: "delete_labor", id: l.id }])}
                className="rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                aria-label={t("sheet.deleteRow")}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        <div className="border-b border-zinc-800/60 px-3 py-2">
          <button
            onClick={add}
            className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-accent-300"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {t("sheet.addRow")}
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
