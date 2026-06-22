"use client";

import { useState } from "react";
import { cn, formatNum } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { CatalogItem, TakeoffItem } from "@/lib/types";
import {
  previewQuantity,
  dimsExpression,
  evalFormula,
} from "@/lib/formula";
import { SheetShell, HeadRow, H, type SheetProps } from "./shell";
import { EditableTextCell } from "../EditableTextCell";
import { EditableNumberCell } from "../EditableNumberCell";
import { CatalogAutocomplete } from "../CatalogAutocomplete";
import { FormulaExplainer } from "../transparency/FormulaExplainer";
import { TrashIcon, PlusIcon, AlertIcon } from "@/components/ui/icons";

const COLS =
  "grid grid-cols-[120px_110px_minmax(150px,0.9fr)_56px_60px_60px_60px_52px_minmax(200px,1.4fr)_96px_36px]";

export function TakeoffSheet({ estimate, apply }: SheetProps) {
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  const rows = estimate.takeoff ?? [];

  function patch(item: TakeoffItem, p: Partial<TakeoffItem>) {
    return apply([
      {
        type: "upsert_takeoff",
        id: item.id,
        group: item.group,
        code: item.code,
        name: item.name,
        unit: item.unit,
        length: item.length,
        width: item.width,
        height: item.height,
        count: item.count,
        formula: item.formula,
        note: item.note,
        ...p,
      },
    ]);
  }

  function addFromCatalog(c: CatalogItem) {
    setAdding(false);
    return apply([
      {
        type: "upsert_takeoff",
        code: c.code,
        name: c.name,
        unit: c.unit,
        count: 1,
      },
    ]);
  }

  function remove(item: TakeoffItem) {
    return apply([{ type: "delete_takeoff", id: item.id }]);
  }

  return (
    <SheetShell titleKey="tabs.takeoff" hint={t("takeoff.hint")}>
      <div className="min-w-[1180px]">
        <HeadRow cols={COLS}>
          <H>{t("takeoff.group")}</H>
          <H>{t("takeoff.code")}</H>
          <H>{t("takeoff.name")}</H>
          <H>{t("takeoff.unit")}</H>
          <H right>{t("takeoff.length")}</H>
          <H right>{t("takeoff.width")}</H>
          <H right>{t("takeoff.height")}</H>
          <H right>{t("takeoff.count")}</H>
          <H>{t("takeoff.formula")}</H>
          <H right>{t("takeoff.quantity")}</H>
          <H />
        </HeadRow>

        {rows.length === 0 && !adding && (
          <p className="px-4 py-16 text-center text-sm text-zinc-600">
            {t("sheet.empty")}
          </p>
        )}

        {rows.map((r, idx) => (
          <div
            key={r.id}
            className={cn(
              COLS,
              "group items-center border-b border-zinc-800/60 text-zinc-300",
              idx % 2 === 1 && "bg-zinc-900/20",
              "hover:bg-zinc-800/40"
            )}
          >
            <EditableTextCell
              value={r.group ?? ""}
              onCommit={(v) => patch(r, { group: v })}
            />
            <EditableTextCell
              value={r.code}
              mono
              className="text-accent-300"
              onCommit={(v) => patch(r, { code: v })}
            />
            <div className="min-w-0">
              <EditableTextCell
                value={r.name}
                onCommit={(v) => patch(r, { name: v })}
              />
              <EditableTextCell
                value={r.note ?? ""}
                placeholder={t("takeoff.notePlaceholder")}
                className="!py-0.5 text-[10px] italic text-zinc-500"
                onCommit={(v) => patch(r, { note: v })}
              />
            </div>
            <EditableTextCell
              value={r.unit}
              onCommit={(v) => patch(r, { unit: v })}
            />
            <EditableNumberCell
              value={r.length ?? 0}
              onCommit={(v) => patch(r, { length: v })}
            />
            <EditableNumberCell
              value={r.width ?? 0}
              onCommit={(v) => patch(r, { width: v })}
            />
            <EditableNumberCell
              value={r.height ?? 0}
              onCommit={(v) => patch(r, { height: v })}
            />
            <EditableNumberCell
              value={r.count ?? 0}
              onCommit={(v) => patch(r, { count: v })}
            />
            <div className="flex min-w-0 items-center gap-0.5">
              <FormulaCell row={r} onCommit={(v) => patch(r, { formula: v })} />
              <FormulaExplainer item={r} />
            </div>
            <QtyCell row={r} />
            <div className="flex items-center justify-center">
              <button
                onClick={() => remove(r)}
                className="rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                aria-label={t("sheet.deleteRow")}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        <div className="border-b border-zinc-800/60 px-3 py-2">
          {adding ? (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CatalogAutocomplete onPick={addFromCatalog} />
              </div>
              <button
                onClick={() => setAdding(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-accent-300"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t("sheet.addRow")}
            </button>
          )}
        </div>
      </div>
    </SheetShell>
  );
}

// Editable formula cell. Shows the real expression (explicit formula, or the
// implicit L×W×H×SL product as readable text). Invalid formulas are flagged.
function FormulaCell({
  row,
  onCommit,
}: {
  row: TakeoffItem;
  onCommit: (v: string) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const explicit = row.formula?.trim() ?? "";
  const derived = dimsExpression(row);
  const invalid = explicit !== "" && evalFormula(explicit) === null;

  function open() {
    setDraft(explicit);
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (draft !== explicit) onCommit(draft);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        placeholder={t("takeoff.formulaPlaceholder")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none ring-1 ring-accent-500/60"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      title={explicit || derived || t("takeoff.derived")}
      className={cn(
        "flex w-full min-w-0 flex-1 items-center gap-1 truncate px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-zinc-800/60",
        invalid ? "text-rose-300" : explicit ? "text-zinc-200" : "text-zinc-500"
      )}
    >
      {invalid && <AlertIcon className="h-3 w-3 shrink-0 text-rose-400" />}
      <span className="truncate">
        {explicit || (derived ? derived : t("takeoff.derived"))}
      </span>
    </button>
  );
}

// Live-preview quantity. Recomputes from the formula/dims so an edit shows
// instantly; flags when the server's stored value disagrees (pending recompute).
function QtyCell({ row }: { row: TakeoffItem }) {
  const { t } = useT();
  const preview = previewQuantity(row);
  const value = preview != null ? preview : row.quantity;
  const drift =
    preview != null && Math.abs(preview - row.quantity) > 1e-6;

  return (
    <div
      className="flex items-center justify-end gap-1 px-2 py-1.5 text-right font-mono text-xs font-medium text-zinc-100"
      title={
        drift
          ? `${t("takeoff.preview")}: ${formatNum(preview!)} · server: ${formatNum(row.quantity)}`
          : undefined
      }
    >
      {drift && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
      {formatNum(value)}
    </div>
  );
}
