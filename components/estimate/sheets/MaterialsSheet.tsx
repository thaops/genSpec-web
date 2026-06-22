"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { Material } from "@/lib/types";
import { SheetShell, HeadRow, H, type SheetProps } from "./shell";
import { EditableTextCell } from "../EditableTextCell";
import { EditableNumberCell } from "../EditableNumberCell";
import { TrashIcon, PlusIcon } from "@/components/ui/icons";
import { SourcePopover } from "../transparency/SourcePopover";

const COLS = "grid grid-cols-[140px_minmax(200px,1fr)_80px_130px_minmax(160px,1fr)_36px]";

export function MaterialsSheet({ estimate, apply }: SheetProps) {
  const { t } = useT();
  const rows = estimate.materials ?? [];

  function patch(m: Material, p: Partial<Material>) {
    return apply([
      {
        type: "upsert_material",
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        price: m.price,
        source: m.source,
        ...p,
      },
    ]);
  }

  function add() {
    return apply([
      { type: "upsert_material", code: "", name: "", unit: "", price: 0 },
    ]);
  }

  return (
    <SheetShell titleKey="tabs.materials">
      <div className="min-w-[820px]">
        <HeadRow cols={COLS}>
          <H>{t("materials.code")}</H>
          <H>{t("materials.name")}</H>
          <H>{t("materials.unit")}</H>
          <H right>{t("materials.price")}</H>
          <H>{t("materials.source")}</H>
          <H />
        </HeadRow>

        {rows.length === 0 && (
          <p className="px-4 py-16 text-center text-sm text-zinc-600">
            {t("sheet.empty")}
          </p>
        )}

        {rows.map((m, idx) => (
          <div
            key={m.id}
            className={cn(
              COLS,
              "group items-center border-b border-zinc-800/60 text-zinc-300",
              idx % 2 === 1 && "bg-zinc-900/20",
              "hover:bg-zinc-800/40"
            )}
          >
            <EditableTextCell
              value={m.code}
              mono
              className="text-accent-300"
              onCommit={(v) => patch(m, { code: v })}
            />
            <EditableTextCell value={m.name} onCommit={(v) => patch(m, { name: v })} />
            <EditableTextCell value={m.unit} onCommit={(v) => patch(m, { unit: v })} />
            <div className="flex items-center justify-end gap-1 px-1">
              <SourcePopover source={m.source} />
              <div className="min-w-[72px]">
                <EditableNumberCell
                  value={m.price}
                  onCommit={(v) => patch(m, { price: v })}
                />
              </div>
            </div>
            <EditableTextCell
              value={m.source?.name ?? ""}
              onCommit={(v) =>
                patch(m, { source: { ...m.source, name: v } })
              }
            />
            <div className="flex items-center justify-center">
              <button
                onClick={() => apply([{ type: "delete_material", id: m.id }])}
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
