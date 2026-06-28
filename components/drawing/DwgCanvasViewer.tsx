"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawingObject } from "@/lib/types";

interface Props {
  objects: DrawingObject[];
  selectedObjectId?: string;
  onObjectClick?: (obj: DrawingObject) => void;
}

// Semantic color by object type
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
  axis:      "#2d3748",
  dimension: "#4a4a5a",
  leader:    "#4a4a5a",
  text:      "#64748b",
  symbol:    "#52525b",
  block:     "#52525b",
  polyline:  "#94a3b8",
  hatch:     "#2a2a32",
  viewport:  "#1e1e26",
  unknown:   "#3f3f46",
};

// ACI (AutoCAD Color Index) → hex — indices 1–9 are standard; 256=ByLayer→fallback white
const ACI: Record<number, string> = {
  1: "#ff4444", 2: "#ffff00", 3: "#00ff41",
  4: "#00ffff", 5: "#4466ff", 6: "#ff44ff",
  7: "#e8e8e8", 8: "#808080", 9: "#c0c0c0",
};

// DWG lineweight values (1/100 mm) → canvas px at 1:1 scale
// -1/0 = ByLayer (use default); we treat as medium
function lwToPx(lw: number): number {
  if (lw <= 0) return 0.8;
  return Math.max(0.4, lw / 25); // 25mm → 1px roughly
}

// Types whose single-point geometry is just an insertion — skip dot rendering
const SKIP_DOT = new Set(["text", "dimension", "leader", "block", "hatch", "viewport", "axis"]);

// Draw order groups — lower index renders first (back)
const LAYER_ORDER: Record<string, number> = {
  hatch: 0, slab: 1, viewport: 1,
  wall: 2, beam: 3, column: 3, footing: 3, pile: 3, stair: 4,
  door: 5, window: 5, opening: 5, polyline: 5,
  axis: 6, unknown: 6, symbol: 7, block: 7,
  dimension: 8, leader: 8,
  text: 9,
};

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

function computeBounds(objects: DrawingObject[]): Bounds | null {
  if (objects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const { x, y, w, h } = obj.boundingBox;
    if (!isFinite(x) || !isFinite(y)) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

type ColorMode = "semantic" | "cad";

export function DwgCanvasViewer({ objects, selectedObjectId, onObjectClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("semantic");

  const stateRef = useRef({
    objects,
    selectedObjectId,
    colorMode: "semantic" as ColorMode,
    bounds: null as Bounds | null,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  stateRef.current.objects = objects;
  stateRef.current.selectedObjectId = selectedObjectId;
  stateRef.current.colorMode = colorMode;

  // ── Draw ──────────────────────────────────────────────────────────────────
  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const { objects: objs, selectedObjectId: selId, colorMode: mode, bounds, offsetX, offsetY, scale } = stateRef.current;

    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, height);
    if (!bounds || objs.length === 0) return;

    // world → screen (Y-flip: DWG y-up, canvas y-down)
    const toSX = (x: number) => (x - bounds.minX) * scale + offsetX;
    const toSY = (y: number) => (bounds.maxY - y) * scale + offsetY;

    // Sort by draw order (stable sort — same order preserves original)
    const sorted = [...objs].sort((a, b) =>
      (LAYER_ORDER[a.type] ?? 5) - (LAYER_ORDER[b.type] ?? 5)
    );

    for (const obj of sorted) {
      const selected = !!selId && (obj.id === selId || obj.stableId === selId);
      const props = obj.properties ?? {};
      const pts = obj.geometry;
      if (!pts?.length) continue;

      // Color
      let color: string;
      if (selected) {
        color = "#facc15";
      } else if (mode === "cad") {
        const ci = Number(props.colorIndex ?? 256);
        color = ACI[ci] ?? "#888";
      } else {
        color = TYPE_COLOR[obj.type] ?? "#52525b";
      }

      // Line width
      const lw = Number(props.lineweight ?? -1);
      const baseWidth = selected ? 2 : lwToPx(lw);

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = baseWidth;
      ctx.setLineDash([]);

      if (pts.length >= 2) {
        // ── Multi-point: polyline / hatch boundary / dimension line ──
        ctx.beginPath();
        ctx.moveTo(toSX(pts[0][0]), toSY(pts[0][1]));
        for (let i = 1; i < pts.length; i++) ctx.lineTo(toSX(pts[i][0]), toSY(pts[i][1]));
        ctx.stroke();

        // Text label when selected
        if (selected && props.text) {
          ctx.font = `${Math.max(9, 11)}px sans-serif`;
          ctx.fillStyle = "#facc15";
          const mid = Math.floor(pts.length / 2);
          ctx.fillText(String(props.text).slice(0, 60), toSX(pts[mid][0]) + 4, toSY(pts[mid][1]) - 4);
        }
      } else {
        // ── Single point ──
        const cx = toSX(pts[0][0]);
        const cy = toSY(pts[0][1]);
        const radius = typeof props.radius === "number" ? (props.radius as number) * scale : 0;

        if (radius > 0.3) {
          // Circle / Arc
          const sa = typeof props.startAngle === "number" ? -(props.startAngle as number) * Math.PI / 180 : 0;
          const ea = typeof props.endAngle   === "number" ? -(props.endAngle   as number) * Math.PI / 180 : Math.PI * 2;
          const isArc = typeof props.startAngle === "number";
          ctx.beginPath();
          ctx.arc(cx, cy, radius, sa, ea, isArc);
          ctx.stroke();
        } else if (obj.type === "text" || obj.type === "dimension") {
          // Render text content
          const rawText = String(props.text ?? "");
          if (rawText) {
            const th = Number(props.textHeight ?? 0);
            const rot = Number(props.rotation ?? 0);
            const px = Math.max(7, th > 0 ? th * scale : 9);
            ctx.font = `${px}px sans-serif`;
            ctx.fillStyle = selected ? "#facc15" : color;
            if (rot !== 0) {
              ctx.save();
              ctx.translate(cx, cy);
              ctx.rotate(-rot * Math.PI / 180);
              ctx.fillText(rawText.slice(0, 80), 0, 0);
              ctx.restore();
            } else {
              ctx.fillText(rawText.slice(0, 80), cx, cy);
            }
          }
        } else if (!SKIP_DOT.has(obj.type) || selected) {
          // Crosshair dot for geometric single-point entities
          const sz = Math.max(1, 1.5 * scale);
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

  useEffect(() => { fitView(); }, [objects]);         // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { redraw(); }, [selectedObjectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { redraw(); }, [colorMode]);        // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => fitView());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mouse ─────────────────────────────────────────────────────────────────
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
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
    s.offsetX += e.clientX - s.lastX; s.offsetY += e.clientY - s.lastY;
    s.lastX = e.clientX; s.lastY = e.clientY;
    redraw();
  }

  function onMouseUp() { stateRef.current.dragging = false; }

  function onCanvasClick(e: React.MouseEvent) {
    if (!onObjectClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const { scale, offsetX, offsetY, bounds, objects: objs } = stateRef.current;
    if (!bounds) return;
    const wx = (px - offsetX) / scale + bounds.minX;
    const wy = bounds.maxY - (py - offsetY) / scale;
    const HIT = 12 / scale;

    let best: DrawingObject | null = null, bestDist = Infinity;
    for (const obj of objs) {
      const { x, y, w, h } = obj.boundingBox;
      if (wx < x - HIT || wx > x + w + HIT || wy < y - HIT || wy > y + h + HIT) continue;
      const d = Math.hypot(wx - (x + w / 2), wy - (y + h / 2));
      if (d < bestDist) { bestDist = d; best = obj; }
    }
    if (best) onObjectClick(best);
  }

  const typeStats: Record<string, number> = {};
  for (const o of objects) typeStats[o.type] = (typeStats[o.type] ?? 0) + 1;
  const topTypes = Object.entries(typeStats).sort((a,b) => b[1]-a[1]).slice(0, 6);

  return (
    <div className="relative flex flex-col h-full bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800 bg-zinc-950 text-xs text-zinc-400 shrink-0 flex-wrap">
        <span className="font-mono text-zinc-500">DWG</span>
        <span className="text-zinc-600">{objects.length.toLocaleString()} objects</span>

        {/* Dynamic legend from actual data */}
        <div className="flex gap-2 flex-wrap">
          {topTypes.map(([t, n]) => (
            <span key={t} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: TYPE_COLOR[t] ?? "#52525b" }} />
              <span className="text-zinc-600">{t} <span className="text-zinc-700">({n})</span></span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Color mode toggle */}
          <button
            onClick={() => setColorMode(m => m === "semantic" ? "cad" : "semantic")}
            className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
            title="Toggle semantic / CAD original color"
          >
            {colorMode === "semantic" ? "Semantic" : "CAD Color"}
          </button>
          <button onClick={fitView} className="px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-400">
            Fit
          </button>
        </div>
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
