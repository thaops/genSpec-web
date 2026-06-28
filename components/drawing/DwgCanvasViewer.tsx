"use client";

import { useEffect, useRef, useCallback } from "react";
import type { DrawingObject } from "@/lib/types";

interface Props {
  objects: DrawingObject[];
  selectedObjectId?: string;
  onObjectClick?: (obj: DrawingObject) => void;
}

// Color by object type
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

function getColor(obj: DrawingObject, selected: boolean): string {
  if (selected) return "#facc15";
  return TYPE_COLOR[obj.type] ?? "#52525b";
}

interface WorldBounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

function computeBounds(objects: DrawingObject[]): WorldBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const { x, y, w, h } = obj.boundingBox;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  return { minX, minY, maxX, maxY };
}

// State stored in ref to avoid re-renders on pan/zoom
interface ViewState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function DwgCanvasViewer({ objects, selectedObjectId, onObjectClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ offsetX: 0, offsetY: 0, scale: 1 });
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });
  const boundsRef = useRef<WorldBounds>({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });

  // world → canvas
  const wx = useCallback((x: number) => (x - boundsRef.current.minX) * viewRef.current.scale + viewRef.current.offsetX, []);
  const wy = useCallback((y: number) => {
    const b = boundsRef.current;
    // flip Y: DWG Y grows up, canvas Y grows down
    return (b.maxY - y) * viewRef.current.scale + viewRef.current.offsetY;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;

    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, height);

    const s = viewRef.current.scale;

    for (const obj of objects) {
      const selected = obj.id === selectedObjectId || obj.stableId === selectedObjectId;
      ctx.strokeStyle = getColor(obj, selected);
      ctx.lineWidth = selected ? 2 : 0.8;
      ctx.fillStyle = getColor(obj, selected);

      const pts = obj.geometry;
      const props = obj.properties ?? {};

      if (pts.length >= 2) {
        // Line / polyline
        ctx.beginPath();
        ctx.moveTo(wx(pts[0][0]), wy(pts[0][1]));
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(wx(pts[i][0]), wy(pts[i][1]));
        }
        ctx.stroke();
      } else if (pts.length === 1) {
        const cx = wx(pts[0][0]);
        const cy = wy(pts[0][1]);
        const r = typeof props.radius === "number" ? props.radius * s : 0;

        if (r > 0.5) {
          // Circle / arc
          const startAngle = typeof props.startAngle === "number" ? -props.startAngle * Math.PI / 180 : 0;
          const endAngle   = typeof props.endAngle   === "number" ? -props.endAngle   * Math.PI / 180 : Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, startAngle, endAngle,
            typeof props.startAngle === "number" ? true : false);
          ctx.stroke();
        } else {
          // Point / text / block — small cross
          const sz = Math.max(1.5, 3 * s);
          ctx.beginPath();
          ctx.moveTo(cx - sz, cy); ctx.lineTo(cx + sz, cy);
          ctx.moveTo(cx, cy - sz); ctx.lineTo(cx, cy + sz);
          ctx.stroke();
        }
      }
    }
  }, [objects, selectedObjectId, wx, wy]);

  // Fit to canvas on mount / objects change
  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || objects.length === 0) return;
    const b = computeBounds(objects);
    boundsRef.current = b;
    const W = canvas.width, H = canvas.height;
    const ww = b.maxX - b.minX || 1000;
    const wh = b.maxY - b.minY || 1000;
    const scale = Math.min(W / ww, H / wh) * 0.9;
    viewRef.current = {
      scale,
      offsetX: (W - ww * scale) / 2,
      offsetY: (H - wh * scale) / 2,
    };
    draw();
  }, [objects, draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      fitView();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [fitView]);

  // Redraw on selection change
  useEffect(() => { draw(); }, [selectedObjectId, draw]);

  // Mouse wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = viewRef.current;
    viewRef.current = {
      scale:   v.scale * factor,
      offsetX: mx - (mx - v.offsetX) * factor,
      offsetY: my - (my - v.offsetY) * factor,
    };
    draw();
  }, [draw]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    viewRef.current.offsetX += dx;
    viewRef.current.offsetY += dy;
    draw();
  }, [draw]);

  const onMouseUp = useCallback(() => { dragRef.current.active = false; }, []);

  // Click to select object
  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    if (!onObjectClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const v = viewRef.current;
    const b = boundsRef.current;
    // canvas → world
    const wx = (cx - v.offsetX) / v.scale + b.minX;
    const wy = b.maxY - (cy - v.offsetY) / v.scale;

    const HIT = 8 / v.scale;
    // Find closest object (check boundingBox first for performance)
    let best: DrawingObject | null = null;
    let bestDist = Infinity;
    for (const obj of objects) {
      const { x, y, w, h } = obj.boundingBox;
      if (wx < x - HIT || wx > x + w + HIT || wy < y - HIT || wy > y + h + HIT) continue;
      const cx2 = x + w / 2, cy2 = y + h / 2;
      const d = Math.hypot(wx - cx2, wy - cy2);
      if (d < bestDist) { bestDist = d; best = obj; }
    }
    if (best) onObjectClick(best);
  }, [objects, onObjectClick]);

  return (
    <div className="relative flex flex-col h-full bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800 bg-zinc-950 text-xs text-zinc-400 shrink-0">
        <span className="font-mono text-zinc-500">DWG</span>
        <span className="text-zinc-600">{objects.length.toLocaleString()} objects</span>
        <div className="flex gap-2 ml-auto">
          {(["beam","column","wall","door","window","polyline"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: TYPE_COLOR[t] }} />
              <span className="text-zinc-600">{t}</span>
            </span>
          ))}
        </div>
        <button
          onClick={fitView}
          className="px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-400 ml-2"
        >
          Fit
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-crosshair"
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
