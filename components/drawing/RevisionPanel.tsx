"use client";

import { useMemo, useState } from "react";
import type { Drawing, DrawingCalibration, DrawingDiff, DrawingObject } from "@/lib/types";
import { compareDrawingsV2 } from "@/lib/api";
import { measureObject, formatMeasure, OBJECT_TYPE_LABELS } from "@/lib/drawing/objectMeasure";
import {
  GitCompareArrows, X as XIcon, Loader2, Plus, Minus, Pencil, Sparkles, RefreshCw,
} from "lucide-react";

interface RevisionPanelProps {
  estimateId: string;
  drawings: Drawing[];
  activeDrawingId: string;
  calibration: DrawingCalibration | null;
  onClose: () => void;
  /** Focus/highlight an object on the canvas. drawingId tells which version it belongs to. */
  onFocusObject?: (objectId: string, drawingId: string) => void;
  /** Send the pre-built diff summary to the copilot. */
  onAskAI?: (summaryText: string) => void;
}

type SectionKey = "added" | "removed" | "changed";

const SECTION_META: Record<SectionKey, { title: string; badge: string; text: string; icon: React.ReactNode }> = {
  added:   { title: "Thêm mới", badge: "bg-emerald-500/15 text-emerald-400", text: "text-emerald-400", icon: <Plus className="h-3 w-3" /> },
  removed: { title: "Đã xoá",   badge: "bg-rose-500/15 text-rose-400",       text: "text-rose-400",    icon: <Minus className="h-3 w-3" /> },
  changed: { title: "Thay đổi", badge: "bg-amber-500/15 text-amber-400",     text: "text-amber-400",   icon: <Pencil className="h-3 w-3" /> },
};

/** Per-type net delta (added − removed) in length + area. */
interface TypeDelta {
  type: string;
  label: string;
  count: number;   // net object count
  length: number;  // net length
  area: number;    // net area
}

function computeTypeDeltas(diff: DrawingDiff, cal: DrawingCalibration | null): TypeDelta[] {
  const map = new Map<string, TypeDelta>();
  const acc = (obj: DrawingObject, sign: 1 | -1) => {
    const m = measureObject(obj, cal);
    let d = map.get(obj.type);
    if (!d) {
      d = { type: obj.type, label: OBJECT_TYPE_LABELS[obj.type] ?? obj.type, count: 0, length: 0, area: 0 };
      map.set(obj.type, d);
    }
    d.count += sign;
    d.length += sign * m.length;
    d.area += sign * m.area;
  };
  for (const o of diff.added) acc(o, 1);
  for (const o of diff.removed) acc(o, -1);
  // Changed pairs: delta = after − before
  for (const p of diff.changed) {
    acc(p.after, 1);
    acc(p.before, -1);
    // count nets to 0 for changed pairs — correct: object still exists
  }
  return [...map.values()].filter((d) => d.count !== 0 || Math.abs(d.area) > 1e-9 || Math.abs(d.length) > 1e-9);
}

function signed(v: number): string {
  return `${v >= 0 ? "+" : "−"}${formatMeasure(Math.abs(v))}`;
}

function buildAISummary(
  diff: DrawingDiff,
  deltas: TypeDelta[],
  drawings: Drawing[],
  cal: DrawingCalibration | null
): string {
  const name = (id: string) => drawings.find((d) => d.id === id)?.name ?? id;
  const unit = cal ? "m" : "đv";
  const lines: string[] = [
    `So sánh bản vẽ "${name(diff.drawingId)}" (mới) với "${name(diff.againstDrawingId)}" (cũ):`,
    `- Thêm mới: ${diff.summary.addedCount} đối tượng`,
    `- Đã xoá: ${diff.summary.removedCount} đối tượng`,
    `- Thay đổi: ${diff.summary.changedCount} đối tượng (không đổi: ${diff.unchangedCount})`,
    "",
    `Delta khối lượng theo loại (${cal ? "đã calibrate, đơn vị m/m²" : "đơn vị bản vẽ, chưa calibrate"}):`,
    `| Loại | Δ số lượng | Δ chiều dài (${unit}) | Δ diện tích (${unit}²) |`,
    "|---|---|---|---|",
    ...deltas.map((d) => `| ${d.label} | ${d.count >= 0 ? "+" : ""}${d.count} | ${signed(d.length)} | ${signed(d.area)} |`),
    "",
    "Hãy phân tích tác động của các thay đổi này lên dự toán (khối lượng, hạng mục BOQ bị ảnh hưởng, chi phí ước tính).",
  ];
  return lines.join("\n");
}

interface DiffItemRowProps {
  obj: DrawingObject;
  drawingId: string;
  calibration: DrawingCalibration | null;
  accent: string;
  extra?: string;
  onFocusObject?: (objectId: string, drawingId: string) => void;
}

function DiffItemRow({ obj, drawingId, calibration, accent, extra, onFocusObject }: DiffItemRowProps) {
  const m = measureObject(obj, calibration);
  const unit = calibration ? "m" : "đv";
  return (
    <button
      onClick={() => onFocusObject?.(obj.id, drawingId)}
      className="w-full text-left px-3 py-1.5 border-b border-zinc-800/60 hover:bg-zinc-800/50 transition-colors"
    >
      <div className={`text-[11px] truncate ${accent}`}>
        {OBJECT_TYPE_LABELS[obj.type] ?? obj.type}
        <span className="text-zinc-600"> · {obj.layer}</span>
      </div>
      <div className="text-[10px] text-zinc-500 truncate">
        L {formatMeasure(m.length)} {unit} · S {formatMeasure(m.area)} {unit}²
        {extra && <span className="text-zinc-600"> · {extra}</span>}
      </div>
    </button>
  );
}

/**
 * Revision Panel — compare the active drawing against another drawing in the
 * same estimate and quantify the changes (M3-B).
 */
export function RevisionPanel({
  estimateId,
  drawings,
  activeDrawingId,
  calibration,
  onClose,
  onFocusObject,
  onAskAI,
}: RevisionPanelProps) {
  const [againstId, setAgainstId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DrawingDiff | null>(null);

  const candidates = useMemo(
    () =>
      drawings.filter(
        (d) => d.id !== activeDrawingId && (d.parseStatus === "ready" || d.parseStatus === undefined)
      ),
    [drawings, activeDrawingId]
  );

  const deltas = useMemo(
    () => (diff ? computeTypeDeltas(diff, calibration) : []),
    [diff, calibration]
  );

  async function runCompare() {
    if (!againstId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await compareDrawingsV2(estimateId, activeDrawingId, againstId);
      setDiff(result);
    } catch (err) {
      setError((err as Error)?.message ?? "So sánh thất bại");
    } finally {
      setLoading(false);
    }
  }

  const unit = calibration ? "m" : "đv";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
            <GitCompareArrows className="h-3.5 w-3.5 text-violet-400" />
            So sánh revision
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Picker */}
        <div className="flex items-center gap-1.5">
          <select
            value={againstId}
            onChange={(e) => setAgainstId(e.target.value)}
            className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-violet-500"
          >
            <option value="">So sánh với…</option>
            {candidates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} (v{d.version})
              </option>
            ))}
          </select>
          <button
            onClick={runCompare}
            disabled={!againstId || loading}
            className="shrink-0 rounded bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            So sánh
          </button>
        </div>
        {candidates.length === 0 && (
          <p className="text-[10px] text-zinc-600">
            Chưa có bản vẽ khác trong estimate — upload bản mới rồi quay lại đây.
          </p>
        )}
        {error && <p className="text-[10px] text-rose-400">{error}</p>}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!diff && !loading && (
          <div className="flex flex-col items-center gap-2 py-8 text-zinc-600">
            <GitCompareArrows className="h-6 w-6" />
            <p className="text-xs text-center px-4">
              Chọn bản vẽ cũ để so sánh với bản đang mở
            </p>
          </div>
        )}

        {diff && (
          <>
            {/* Aggregate header */}
            <div className="px-3 py-2 border-b border-zinc-800 space-y-1">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-emerald-400 font-medium">+{diff.summary.addedCount}</span>
                <span className="text-rose-400 font-medium">−{diff.summary.removedCount}</span>
                <span className="text-amber-400 font-medium">~{diff.summary.changedCount}</span>
                <span className="text-zinc-600">· {diff.unchangedCount} không đổi</span>
              </div>
              {deltas.length > 0 && (
                <div className="text-[10px] text-zinc-500 space-y-0.5">
                  {deltas.map((d) => (
                    <div key={d.type} className="truncate">
                      {d.label}: {d.count >= 0 ? "+" : ""}{d.count}
                      {" · "}Δ {signed(d.area)} {unit}²{" · "}Δ {signed(d.length)} {unit}
                    </div>
                  ))}
                  {!calibration && (
                    <div className="text-zinc-600">Chưa calibrate — số đo theo đơn vị bản vẽ</div>
                  )}
                </div>
              )}
              {onAskAI && (
                <button
                  onClick={() => onAskAI(buildAISummary(diff, deltas, drawings, calibration))}
                  className="mt-1 w-full rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-500/20 flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="h-3 w-3" />
                  Gửi cho AI phân tích
                </button>
              )}
            </div>

            {/* Added */}
            <DiffSection section="added" count={diff.added.length}>
              {diff.added.map((o) => (
                <DiffItemRow
                  key={o.id}
                  obj={o}
                  drawingId={diff.drawingId}
                  calibration={calibration}
                  accent={SECTION_META.added.text}
                  onFocusObject={onFocusObject}
                />
              ))}
            </DiffSection>

            {/* Removed */}
            <DiffSection section="removed" count={diff.removed.length}>
              {diff.removed.map((o) => (
                <DiffItemRow
                  key={o.id}
                  obj={o}
                  drawingId={diff.againstDrawingId}
                  calibration={calibration}
                  accent={SECTION_META.removed.text}
                  onFocusObject={onFocusObject}
                />
              ))}
            </DiffSection>

            {/* Changed */}
            <DiffSection section="changed" count={diff.changed.length}>
              {diff.changed.map((p) => (
                <DiffItemRow
                  key={p.after.id}
                  obj={p.after}
                  drawingId={diff.drawingId}
                  calibration={calibration}
                  accent={SECTION_META.changed.text}
                  extra={p.changedFields.join(", ")}
                  onFocusObject={onFocusObject}
                />
              ))}
            </DiffSection>
          </>
        )}
      </div>
    </div>
  );
}

function DiffSection({
  section,
  count,
  children,
}: {
  section: SectionKey;
  count: number;
  children: React.ReactNode;
}) {
  const meta = SECTION_META[section];
  if (count === 0) return null;
  return (
    <div>
      <div className="px-3 py-1.5 flex items-center gap-1.5 bg-zinc-900/60 border-b border-zinc-800 sticky top-0">
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.badge}`}>
          {meta.icon}
          {meta.title}
        </span>
        <span className="text-[10px] text-zinc-600">{count}</span>
      </div>
      {children}
    </div>
  );
}
