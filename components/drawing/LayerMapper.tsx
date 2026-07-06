"use client";

import { useMemo, useState } from "react";
import type { DrawingObject, DrawingObjectType, LayerRule } from "@/lib/types";
import { OBJECT_TYPE_LABELS } from "@/lib/drawing/objectMeasure";
import { Check, Layers, Loader2 } from "lucide-react";

// Types a user can assign a layer to (curated — not raw CAD entity types).
const ASSIGNABLE: DrawingObjectType[] = [
  "beam", "column", "wall", "slab", "stair", "roof", "footing", "pile",
  "door", "window", "opening", "ramp", "axis", "ignored",
];

interface LayerMapperProps {
  objects: DrawingObject[];
  initialRules: LayerRule[];
  onApply: (rules: LayerRule[]) => Promise<void>;
}

interface LayerRow {
  key: string;                    // composite `${LAYER}|${lineType||'*'}`
  layer: string;
  lineType?: string;              // set only when the row is linetype-specific
  count: number;
  currentType: DrawingObjectType; // dominant detected type (for reference)
}

const normLt = (o: DrawingObject): string =>
  String(o.properties?.lineType ?? "").trim().toUpperCase();

/**
 * Tier 2 — per-project layer override. Lists distinct layers with entity counts,
 * lets the user map layer → type once; applying re-runs detection so every entity
 * on that layer is reclassified. "" = leave to auto-detection.
 */
export function LayerMapper({ objects, initialRules, onApply }: LayerMapperProps) {
  const rows = useMemo<LayerRow[]>(() => {
    // Group by layer; split into linetype sub-rows only when a layer mixes styles
    // (e.g. Continuous vs Dashed) — keeps simple drawings simple.
    const byLayer = new Map<string, DrawingObject[]>();
    for (const o of objects) {
      const l = o.layer || "(no layer)";
      (byLayer.get(l) ?? byLayer.set(l, []).get(l)!).push(o);
    }
    const out: LayerRow[] = [];
    const dominant = (objs: DrawingObject[]) => {
      const t: Record<string, number> = {};
      for (const o of objs) t[o.type] = (t[o.type] ?? 0) + 1;
      return (Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown") as DrawingObjectType;
    };
    for (const [layer, objs] of byLayer) {
      const L = layer.toUpperCase();
      const lts = new Set(objs.map(normLt));
      if (lts.size > 1) {
        for (const lt of [...lts].sort()) {
          const sub = objs.filter((o) => normLt(o) === lt);
          out.push({ key: `${L}|${lt || "*"}`, layer, lineType: lt || undefined, count: sub.length, currentType: dominant(sub) });
        }
      } else {
        out.push({ key: `${L}|*`, layer, count: objs.length, currentType: dominant(objs) });
      }
    }
    return out.sort((a, b) => b.count - a.count);
  }, [objects]);

  // composite key → assigned type; seed from existing project rules
  const [assign, setAssign] = useState<Record<string, DrawingObjectType | "">>(() => {
    const seed: Record<string, DrawingObjectType | ""> = {};
    for (const r of initialRules) seed[`${r.layer.toUpperCase()}|${r.lineType?.toUpperCase() || "*"}`] = r.type;
    return seed;
  });
  const [saving, setSaving] = useState(false);

  const dirtyCount = Object.values(assign).filter((v) => v).length;

  async function apply() {
    const rules: LayerRule[] = Object.entries(assign)
      .filter(([, type]) => type)
      .map(([key, type]) => {
        const [layer, lt] = key.split("|");
        return { layer, lineType: lt === "*" ? undefined : lt, type: type as DrawingObjectType };
      });
    setSaving(true);
    try {
      await onApply(rules);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0 flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
        <Layers className="h-3.5 w-3.5 text-blue-400" />
        Gán loại theo layer
        <span className="ml-auto text-[10px] font-normal text-zinc-500">{rows.length} layer</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
        {rows.map((r) => {
          const val = assign[r.key] ?? "";
          return (
            <div key={r.key} className="px-3 py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-zinc-200 truncate">
                  {r.layer}
                  {r.lineType && <span className="text-violet-400/80"> · {r.lineType}</span>}
                </div>
                <div className="text-[9px] text-zinc-600">
                  {r.count} đối tượng · giờ: {OBJECT_TYPE_LABELS[r.currentType] ?? r.currentType}
                </div>
              </div>
              <select
                value={val}
                onChange={(e) => setAssign((s) => ({ ...s, [r.key]: e.target.value as DrawingObjectType | "" }))}
                className={`text-[10px] rounded bg-zinc-800 border px-1.5 py-1 outline-none ${
                  val ? "border-blue-500/50 text-blue-300" : "border-zinc-700 text-zinc-400"
                }`}
              >
                <option value="">— auto —</option>
                {ASSIGNABLE.map((t) => (
                  <option key={t} value={t}>{OBJECT_TYPE_LABELS[t] ?? t}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-zinc-800 shrink-0">
        <button
          onClick={apply}
          disabled={saving}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Áp dụng {dirtyCount > 0 ? `(${dirtyCount})` : ""} & bóc lại
        </button>
      </div>
    </div>
  );
}
