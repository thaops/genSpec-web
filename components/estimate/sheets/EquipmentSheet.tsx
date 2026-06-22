"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { Equipment } from "@/lib/types";
import { SheetShell, HeadRow, H, type SheetProps } from "./shell";
import { EditableTextCell } from "../EditableTextCell";
import { EditableNumberCell } from "../EditableNumberCell";
import { TrashIcon, PlusIcon } from "@/components/ui/icons";
import { SourcePopover } from "../transparency/SourcePopover";

const COLS = "grid grid-cols-[140px_minmax(220px,1fr)_80px_140px_36px]";

export function EquipmentSheet({ estimate, apply }: SheetProps) {
  const { t } = useT();
  const rows = estimate.equipment ?? [];

  function patch(e: Equipment, p: Partial<Equipment>) {
    return apply([
      {
        type: "upsert_equipment",
        id: e.id,
        code: e.code,
        name: e.name,
        unit: e.unit,
        shiftRate: e.shiftRate,
        ...p,
      },
    ]);
  }

  function add() {
    return apply([
      { type: "upsert_equipment", code: "", name: "", unit: "", shiftRate: 0 },
    ]);
  }

  return (
    <SheetShell titleKey="tabs.equipment">
      <div className="min-w-[680px]">
        <HeadRow cols={COLS}>
          <H>{t("equipment.code")}</H>
          <H>{t("equipment.name")}</H>
          <H>{t("equipment.unit")}</H>
          <H right>{t("equipment.shiftRate")}</H>
          <H />
        </HeadRow>

        {rows.length === 0 && (
          <p className="px-4 py-16 text-center text-sm text-zinc-600">
            {t("sheet.empty")}
          </p>
        )}

        {rows.map((e, idx) => (
          <div
            key={e.id}
            className={cn(
              COLS,
              "group items-center border-b border-zinc-800/60 text-zinc-300",
              idx % 2 === 1 && "bg-zinc-900/20",
              "hover:bg-zinc-800/40"
            )}
          >
            <EditableTextCell
              value={e.code}
              mono
              className="text-accent-300"
              onCommit={(v) => patch(e, { code: v })}
            />
            <EditableTextCell value={e.name} onCommit={(v) => patch(e, { name: v })} />
            <EditableTextCell value={e.unit} onCommit={(v) => patch(e, { unit: v })} />
            <div className="flex items-center justify-end gap-1 px-1">
              <SourcePopover source={e.source} />
              <div className="min-w-[72px]">
                <EditableNumberCell
                  value={e.shiftRate}
                  onCommit={(v) => patch(e, { shiftRate: v })}
                />
              </div>
            </div>
            <div className="flex items-center justify-center">
              <button
                onClick={() => apply([{ type: "delete_equipment", id: e.id }])}
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
