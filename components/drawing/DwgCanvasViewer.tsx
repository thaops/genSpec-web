"use client";

import { useEffect, useRef } from "react";
import type { DrawingObject } from "@/lib/types";

interface Props {
  objects: DrawingObject[];
  selectedObjectId?: string;
  onObjectClick?: (obj: DrawingObject) => void;
}

const TYPE_COLOR: Record<string, string> = {
  beam:      "#60a5fa",
  column:    "#34d399",
  wall:      "#a78bfa",
  slab:      "#818cf8",
  footing:   "#f59e0b",
  pile:      "#fb923c",
  door:      "#f472b6",
  window:    "#38bdf8",
  opening:   "#7dd3fc",
  stair:     "#c084fc",
  ramp:      "#d946ef",
  dimension: "#52525b",
  leader:    "#52525b",
  text:      "#71717a",
  symbol:    "#6b7280",
  block:     "#6b7280",
  polyline:  "#94a3b8",
  hatch:     "#374151",
  viewport:  "#334155",
  unknown:   "#3f3f46",
};

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

function computeBounds(objects: DrawingObject[]): Bounds | null {
  if (objects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const { x, y, w, h } = obj.boundingBox;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  return { minX, minY, maxX, maxY };
}

export function DwgCanvasViewer({ objects, selectedObjectId, onObjectClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // All mutable state in one ref — avoids stale closure issues
  const stateRef = useRef({
    objects,
    selectedObjectId,
    bounds: null as Bounds | null,
    offsetX: 0,
    offsetY: 0,
    scale:   1,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  // Keep state ref in sync with props
  stateRef.current.objects = objects;
  stateRef.current.selectedObjectId = selectedObjectId;

  // ── Draw ──────────────────────────────────────────────────────────────────
  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const { objects: objs, selectedObjectId: selId, bounds, offsetX, offsetY, scale } = stateRef.current;

    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, height);
    if (!bounds || objs.length === 0) return;

    // world → screen helpers (Y-flip: DWG y-up, canvas y-down)
    const wx = (x: number) => (x - bounds.minX) * scale + offsetX;
    const wy = (y: number) => (bounds.maxY - y) * scale + offsetY;

    for (const obj of objs) {
      const selected = !!selId && (obj.id === selId || obj.stableId === selId);
      ctx.strokeStyle = selected ? "#facc15" : (TYPE_COLOR[obj.type] ?? "#52525b");
      ctx.lineWidth = selected ? 2 : 0.8;

      const pts = obj.geometry;
      const props = obj.properties ?? {};

      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(wx(pts[0][0]), wy(pts[0][1]));
        for (let i = 1; i < pts.length; i++) ctx.lineTo(wx(pts[i][0]), wy(pts[i][1]));
        ctx.stroke();
      } else if (pts.length === 1) {
        const cx = wx(pts[0][0]);
        const cy = wy(pts[0][1]);
        const radius = typeof props.radius === "number" ? props.radius * scale : 0;

        if (radius > 0.3) {
          const sa = typeof props.startAngle === "number" ? -(props.startAngle as number) * Math.PI / 180 : 0;
          const ea = typeof props.endAngle   === "number" ? -(props.endAngle   as number) * Math.PI / 180 : Math.PI * 2;
          const isArc = typeof props.startAngle === "number";
          ctx.beginPath();
          ctx.arc(cx, cy, radius, sa, ea, isArc);
          ctx.stroke();
        } else {
          const sz = Math.max(1.5, 2 * scale);
          ctx.beginPath();
          ctx.moveTo(cx - sz, cy); ctx.lineTo(cx + sz, cy);
          ctx.moveTo(cx, cy - sz); ctx.lineTo(cx, cy + sz);
          ctx.stroke();
        }
      }
    }
  }

  // ── Fit view ──────────────────────────────────────────────────────────────
  function fitView() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Ensure canvas pixel dimensions match layout
    if (canvas.offsetWidth > 0) {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    const b = computeBounds(stateRef.current.objects);
    if (!b) { redraw(); return; }
    stateRef.current.bounds = b;
    const W = canvas.width, H = canvas.height;
    const ww = b.maxX - b.minX || 1;
    const wh = b.maxY - b.minY || 1;
    const scale = Math.min(W / ww, H / wh) * 0.9;
    stateRef.current.scale   = scale;
    stateRef.current.offsetX = (W - ww * scale) / 2;
    stateRef.current.offsetY = (H - wh * scale) / 2;
    redraw();
  }

  // ── Re-fit when objects arrive / change ──────────────────────────────────
  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects]);

  // ── Redraw on selection change ────────────────────────────────────────────
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObjectId]);

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => { fitView(); });
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mouse events ─────────────────────────────────────────────────────────
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const s = stateRef.current;
    s.scale   = s.scale * factor;
    s.offsetX = mx - (mx - s.offsetX) * factor;
    s.offsetY = my - (my - s.offsetY) * factor;
    redraw();
  }

  function onMouseDown(e: React.MouseEvent) {
    const s = stateRef.current;
    s.dragging = true; s.lastX = e.clientX; s.lastY = e.clientY;
  }

  function onMouseMove(e: React.MouseEvent) {
    const s = stateRef.current;
    if (!s.dragging) return;
    s.offsetX += e.clientX - s.lastX;
    s.offsetY += e.clientY - s.lastY;
    s.lastX = e.clientX; s.lastY = e.clientY;
    redraw();
  }

  function onMouseUp() { stateRef.current.dragging = false; }

  function onCanvasClick(e: React.MouseEvent) {
    if (!onObjectClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { scale, offsetX, offsetY, bounds, objects: objs } = stateRef.current;
    if (!bounds) return;

    // screen → world
    const wx = (px - offsetX) / scale + bounds.minX;
    const wy = bounds.maxY - (py - offsetY) / scale;
    const HIT = 12 / scale;

    let best: DrawingObject | null = null;
    let bestDist = Infinity;
    for (const obj of objs) {
      const { x, y, w, h } = obj.boundingBox;
      if (wx < x - HIT || wx > x + w + HIT || wy < y - HIT || wy > y + h + HIT) continue;
      const d = Math.hypot(wx - (x + w / 2), wy - (y + h / 2));
      if (d < bestDist) { bestDist = d; best = obj; }
    }
    if (best) onObjectClick(best);
  }

  return (
    <div className="relative flex flex-col h-full bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800 bg-zinc-950 text-xs text-zinc-400 shrink-0 flex-wrap">
        <span className="font-mono text-zinc-500">DWG</span>
        <span className="text-zinc-600">{objects.length.toLocaleString()} objects</span>
        <div className="flex gap-2 flex-wrap">
          {(["beam","column","wall","door","window","polyline"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: TYPE_COLOR[t] }} />
              <span className="text-zinc-600">{t}</span>
            </span>
          ))}
        </div>
        <button
          onClick={fitView}
          className="px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-400 ml-auto"
        >
          Fit
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-crosshair"
        style={{ display: "block" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onCanvasClick}
      />
    </div>
  );
}
