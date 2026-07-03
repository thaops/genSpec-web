"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DrawingCalibration, DrawingObject } from "@/lib/types";
import { measureObject, formatMeasure, OBJECT_TYPE_LABELS } from "@/lib/drawing/objectMeasure";
import { Check, X as XIcon, Search, ClipboardCheck } from "lucide-react";

export type ReviewStatus = "approved" | "rejected";
export type ReviewStates = Record<string, ReviewStatus>;

const TYPE_ICONS: Record<string, string> = {
  beam: "⬛", column: "🟫", wall: "🧱", slab: "⬜",
  door: "🚪", window: "🪟", stair: "📶", roof: "🏠",
  footing: "⚓", pile: "🔩", axis: "╋", dimension: "↔", leader: "↗",
  block: "⬦", polyline: "〰", hatch: "▨", text: "T",
  symbol: "◈", viewport: "▭", unknown: "❓",
};

interface ReviewQueueProps {
  objects: DrawingObject[];
  calibration: DrawingCalibration | null;
  states: ReviewStates;
  onStateChange: (objectId: string, status: ReviewStatus) => void;
  onSelect: (obj: DrawingObject) => void;
  onInspect: (obj: DrawingObject) => void;
  onClose: () => void;
}

/**
 * Review Queue — vertical panel listing detected objects sorted by ascending
 * confidence (most suspicious first). Keyboard: A approve, X reject,
 * E inspect, ↑/↓ navigate.
 */
export function ReviewQueue({
  objects,
  calibration,
  states,
  onStateChange,
  onSelect,
  onInspect,
  onClose,
}: ReviewQueueProps) {
  const sorted = useMemo(
    () => [...objects].sort((a, b) => a.confidence - b.confidence),
    [objects]
  );
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const reviewed = sorted.filter((o) => states[o.id]).length;
  const total = sorted.length;
  const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  const unit = calibration ? "m" : "đv";

  // Keep cursor in range when objects change
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, sorted.length - 1)));
  }, [sorted.length]);

  // Scroll active item into view
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function moveTo(idx: number) {
    const clamped = Math.max(0, Math.min(idx, sorted.length - 1));
    setCursor(clamped);
    const obj = sorted[clamped];
    if (obj) onSelect(obj);
  }

  function mark(status: ReviewStatus) {
    const obj = sorted[cursor];
    if (!obj) return;
    onStateChange(obj.id, status);
    moveTo(cursor + 1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k === "a") { e.preventDefault(); mark("approved"); }
    else if (k === "x") { e.preventDefault(); mark("rejected"); }
    else if (k === "e") {
      e.preventDefault();
      const obj = sorted[cursor];
      if (obj) onInspect(obj);
    } else if (e.key === "ArrowDown") { e.preventDefault(); moveTo(cursor + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveTo(cursor - 1); }
  }

  return (
    <div
      ref={containerRef}
      data-review-queue
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col h-full outline-none focus-within:ring-1 focus-within:ring-blue-500/30"
    >
      {/* Header + progress */}
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
            <ClipboardCheck className="h-3.5 w-3.5 text-blue-400" />
            Duyệt đối tượng
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>Đã duyệt {reviewed}/{total}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[9px] text-zinc-600">A duyệt · X từ chối · E inspect · ↑↓ di chuyển</div>
      </div>

      {/* List: ascending confidence — suspicious first */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-zinc-600">
            <Search className="h-6 w-6" />
            <p className="text-xs">Chưa có đối tượng — chạy Detect trước</p>
          </div>
        )}
        {sorted.map((obj, idx) => {
          const status = states[obj.id];
          const active = idx === cursor;
          const m = measureObject(obj, calibration);
          const confPct = Math.round(obj.confidence * 100);
          const confColor = obj.confidence >= 0.8 ? "text-emerald-400" : obj.confidence >= 0.5 ? "text-amber-400" : "text-rose-400";
          return (
            <button
              key={obj.id}
              data-idx={idx}
              onClick={() => { setCursor(idx); onSelect(obj); containerRef.current?.focus(); }}
              className={`w-full text-left px-3 py-2 border-b border-zinc-800/60 transition-colors ${
                active ? "bg-blue-500/10 border-l-2 border-l-blue-500" : "hover:bg-zinc-800/50 border-l-2 border-l-transparent"
              } ${status === "rejected" ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm shrink-0">{TYPE_ICONS[obj.type] ?? "❓"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-zinc-200 truncate">
                    {OBJECT_TYPE_LABELS[obj.type] ?? obj.type}
                    <span className="text-zinc-600"> · {obj.layer}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    L {formatMeasure(m.length)} {unit} · S {formatMeasure(m.area)} {unit}²
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={`text-[10px] ${confColor}`}>{confPct}%</span>
                  {status === "approved" && <Check className="h-3 w-3 text-emerald-400" />}
                  {status === "rejected" && <XIcon className="h-3 w-3 text-rose-400" />}
                  {!status && <span className="text-[9px] text-zinc-600">chưa xem</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
