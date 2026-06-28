"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawingObject } from "@/lib/types";

interface Props {
  objects: DrawingObject[];
  selectedObjectId?: string;
  onObjectClick?: (obj: DrawingObject) => void;
}

// Semantic color (dark theme)
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
  axis:      "#1e3040",
  dimension: "#3a3a55",
  leader:    "#3a3a55",
  text:      "#4a5a6a",
  symbol:    "#4a4a5a",
  block:     "#4a4a5a",
  hatch:     "#1a1a22",
  unknown:   "#38383f",
};

// ACI color index → hex (standard 1–9)
const ACI: Record<number, string> = {
  1: "#ff4444", 2: "#ffff44", 3: "#44ee44",
  4: "#44ffff", 5: "#4466ff", 6: "#ff44ff",
  7: "#cccccc", 8: "#808080", 9: "#aaaaaa",
};

// Semantic linewidth (px at design scale) — ByLayer means we fall back to this
const TYPE_LW: Record<string, number> = {
  wall: 2.0, footing: 2.0, pile: 2.0,
  beam: 1.5, column: 1.5, slab: 1.5,
  stair: 1.2, door: 1.0, window: 1.0, opening: 1.0,
  symbol: 0.7, block: 0.7, unknown: 0.7,
  axis: 0.5, dimension: 0.5, leader: 0.5,
  hatch: 0.4, text: 0.4,
};

// Draw order — back to front
const DRAW_ORDER: Record<string, number> = {
  hatch: 0, slab: 1, viewport: 1,
  wall: 2, footing: 2,
  beam: 3, column: 3, pile: 3, stair: 3,
  door: 4, window: 4, opening: 4,
  unknown: 5, block: 5, symbol: 5,
  axis: 6,
  dimension: 7, leader: 7,
  text: 8,
};

// Linetype name → canvas dash pattern [dash, gap] in world-unit fraction
// We'll convert to screen px at render time
const LINETYPE_DASH: Record<string, number[]> = {
  HIDDEN:  [6, 4],
  DASHED:  [6, 4],
  CENTER:  [12, 3, 2, 3],
  DASH:    [6, 4],
  DOT:     [1, 4],
  PHANTOM: [12, 3, 2, 3, 2, 3],
};

const MIN_TEXT_PX = 6;

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

function computeBounds(objects: DrawingObject[]): Bounds | null {
  // Collect all finite corner coordinates, reject degenerate entities
  const xs: number[] = [], ys: number[] = [];
  for (const { boundingBox: { x, y, w, h } } of objects) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) continue;
    if (w > 1e7 || h > 1e7) continue;
    xs.push(x, x + Math.max(w, 0));
    ys.push(y, y + Math.max(h, 0));
  }
  if (xs.length < 2) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  // 1%–99% percentile eliminates stray INSERT/DIMENSION outliers
  // that would otherwise make fit-view zoom out to empty space
  const lo  = Math.max(0, Math.floor(xs.length * 0.01));
  const hi  = Math.min(xs.length - 1, Math.ceil(xs.length * 0.99) - 1);
  const loY = Math.max(0, Math.floor(ys.length * 0.01));
  const hiY = Math.min(ys.length - 1, Math.ceil(ys.length * 0.99) - 1);
  return { minX: xs[lo], maxX: xs[hi], minY: ys[loY], maxY: ys[hiY] };
}

type ColorMode = "semantic" | "cad";

export function DwgCanvasViewer({ objects, selectedObjectId, onObjectClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("semantic");

  const stateRef = useRef({
    objects, selectedObjectId, colorMode: "semantic" as ColorMode,
    bounds: null as Bounds | null,
    offsetX: 0, offsetY: 0, scale: 1,
    dragging: false, lastX: 0, lastY: 0,
  });
  stateRef.current.objects = objects;
  stateRef.current.selectedObjectId = selectedObjectId;
  stateRef.current.colorMode = colorMode;

  // ── Render ────────────────────────────────────────────────────────────────
  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const { objects: objs, selectedObjectId: selId, colorMode: mode,
            bounds, offsetX: ox, offsetY: oy, scale } = stateRef.current;

    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, W, H);
    if (!bounds || !objs.length) return;

    const sx = (x: number) => (x - bounds.minX) * scale + ox;
    const sy = (y: number) => (bounds.maxY - y) * scale + oy;

    // Sort by draw order (stable)
    const sorted = [...objs].sort((a, b) =>
      (DRAW_ORDER[a.type] ?? 5) - (DRAW_ORDER[b.type] ?? 5)
    );

    for (const obj of sorted) {
      const pts = obj.geometry;
      if (!pts?.length) continue;

      // Viewport culling
      const bb = obj.boundingBox;
      const bL = sx(bb.x), bR = sx(bb.x + Math.max(bb.w, 1));
      const bT = sy(bb.y + Math.max(bb.h, 1)), bB = sy(bb.y);
      if (bR < -20 || bL > W + 20 || bB < -20 || bT > H + 20) continue;

      const selected = !!selId && (obj.id === selId || obj.stableId === selId);
      const props = obj.properties ?? {};

      // ── Color ─────────────────────────────────────────────────────────
      let baseColor: string;
      if (selected) {
        baseColor = "#facc15";
      } else if (mode === "cad") {
        const ci = Number(props.colorIndex ?? 256);
        baseColor = ACI[ci] ?? "#aaa";
      } else {
        baseColor = TYPE_COLOR[obj.type] ?? "#444";
      }

      // ── Linewidth ─────────────────────────────────────────────────────
      // lineweight 29 = ByLayer (all entities in this file) → use semantic weight
      ctx.lineWidth = selected ? 2 : (TYPE_LW[obj.type] ?? 0.7);

      // ── Linetype dashes ───────────────────────────────────────────────
      const lt = String(props.lineType ?? "").toUpperCase();
      const dashPattern = LINETYPE_DASH[lt];
      if (dashPattern && scale > 0.0001) {
        const px = dashPattern.map(v => v * Math.max(1, scale * 500));
        ctx.setLineDash(px);
      } else {
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = baseColor;
      ctx.fillStyle = baseColor;

      // ── Multi-point (polyline / hatch boundary / dimension lines) ─────
      if (pts.length >= 2) {
        if (obj.type === "hatch") {
          // Fill hatch boundary with transparent overlay, stroke boundary outline
          ctx.beginPath();
          ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]));
          for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i][0]), sy(pts[i][1]));
          ctx.closePath();
          const alpha = selected ? 0.25 : 0.12;
          ctx.fillStyle = mode === "cad"
            ? `rgba(180,180,100,${alpha})`
            : `rgba(100,100,160,${alpha})`;
          ctx.fill();
          ctx.setLineDash([]);
          ctx.lineWidth = 0.4;
          ctx.strokeStyle = selected ? "#facc15" : "#2a2a40";
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]));
          for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i][0]), sy(pts[i][1]));
          ctx.stroke();
        }
        continue;
      }

      // ── Single-point ──────────────────────────────────────────────────
      ctx.setLineDash([]);
      const cx = sx(pts[0][0]), cy = sy(pts[0][1]);
      const radius = typeof props.radius === "number" ? (props.radius as number) * scale : 0;

      if (radius > 0.3) {
        const sa = typeof props.startAngle === "number" ? -(props.startAngle as number) * Math.PI / 180 : 0;
        const ea = typeof props.endAngle   === "number" ? -(props.endAngle   as number) * Math.PI / 180 : Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, sa, ea, typeof props.startAngle === "number");
        ctx.stroke();
        continue;
      }

      if (obj.type === "text" || obj.type === "dimension") {
        const rawText = props.text != null ? String(props.text) : "";
        if (!rawText.trim()) continue;
        const th = Number(props.textHeight ?? 0);
        const textPx = th > 0 ? th * scale : 0;
        if (textPx > 0 && textPx < MIN_TEXT_PX) continue;
        if (textPx === 0 && scale < 0.0005) continue;
        const fontSize = Math.max(MIN_TEXT_PX, textPx || 9);
        const rot = Number(props.rotation ?? 0);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = selected ? "#facc15" : (mode === "cad" ? baseColor : "#64748b");
        if (rot !== 0) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-rot * Math.PI / 180);
          ctx.fillText(rawText.slice(0, 80), 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(rawText.slice(0, 80), cx, cy);
        }
        continue;
      }

      // Skip insertion-point-only types unless selected
      if (!selected && (obj.type === "block" || obj.type === "hatch" ||
          obj.type === "viewport" || obj.type === "axis")) continue;

      const sz = Math.max(1, 1.5 * scale);
      ctx.beginPath();
      ctx.moveTo(cx - sz, cy); ctx.lineTo(cx + sz, cy);
      ctx.moveTo(cx, cy - sz); ctx.lineTo(cx, cy + sz);
      ctx.stroke();
    }

    // ── Selection highlight dashed box ────────────────────────────────────
    if (selId) {
      const sel = objs.find(o => o.id === selId || o.stableId === selId);
      if (sel) {
        const { x, y, w, h } = sel.boundingBox;
        const pad = Math.max(4 / scale, 0);
        const rx = sx(x - pad), ry = sy(y + h + pad);
        const rw = (w + pad * 2) * scale, rh = (h + pad * 2) * scale;
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
      }
    }
  }

  // ── Fit view ──────────────────────────────────────────────────────────────
  function fitView() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.offsetWidth > 0) { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; }
    const b = computeBounds(stateRef.current.objects);
    if (!b) { redraw(); return; }
    stateRef.current.bounds = b;
    const W = canvas.width, H = canvas.height;
    const ww = b.maxX - b.minX || 1, wh = b.maxY - b.minY || 1;
    const scale = Math.min(W / ww, H / wh) * 0.9;
    stateRef.current.scale   = scale;
    stateRef.current.offsetX = (W - ww * scale) / 2;
    stateRef.current.offsetY = (H - wh * scale) / 2;
    redraw();
  }

  useEffect(() => { fitView(); }, [objects]);          // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { redraw(); }, [selectedObjectId]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { redraw(); }, [colorMode]);         // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => fitView());
    ro.observe(c);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const s = stateRef.current;
    s.scale *= f;
    s.offsetX = mx - (mx - s.offsetX) * f;
    s.offsetY = my - (my - s.offsetY) * f;
    redraw();
  }

  function onMouseDown(e: React.MouseEvent) {
    stateRef.current.dragging = true;
    stateRef.current.lastX = e.clientX;
    stateRef.current.lastY = e.clientY;
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

  const [showDebug, setShowDebug] = useState(false);

  const typeCounts: Record<string, number> = {};
  for (const o of objects) typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1;
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);

  // Debug: top 15 entities by distance from median center
  const debugInfo = (() => {
    const b = stateRef.current.bounds;
    if (!b || !objects.length) return null;
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const outliers = [...objects]
      .map(o => {
        const ox = o.boundingBox.x + o.boundingBox.w / 2;
        const oy = o.boundingBox.y + o.boundingBox.h / 2;
        return { o, d: Math.hypot(ox - cx, oy - cy), ox, oy };
      })
      .sort((a, b) => b.d - a.d)
      .slice(0, 15);
    return { b, outliers };
  })();

  return (
    <div className="relative flex flex-col h-full bg-zinc-900">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-950 text-xs shrink-0 flex-wrap">
        <span className="font-mono text-zinc-500 shrink-0">DWG</span>
        <span className="text-zinc-600 shrink-0">{objects.length.toLocaleString()}</span>
        <div className="flex gap-2 flex-wrap flex-1 min-w-0">
          {topTypes.map(([t, n]) => (
            <span key={t} className="flex items-center gap-1 shrink-0">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: TYPE_COLOR[t] ?? "#52525b" }} />
              <span className="text-zinc-600">{t}</span>
              <span className="text-zinc-700 font-mono text-[9px]">{n}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            onClick={() => setColorMode(m => m === "semantic" ? "cad" : "semantic")}
            className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
          >
            {colorMode === "semantic" ? "Semantic" : "CAD"}
          </button>
          <button onClick={() => setShowDebug(v => !v)} className={`px-2 py-0.5 rounded text-[10px] ${showDebug ? "bg-amber-800 text-amber-200" : "bg-zinc-800 text-zinc-500"}`}>DBG</button>
          <button onClick={fitView} className="px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-400">Fit</button>
        </div>
      </div>

      {/* Debug overlay — top outlier entities by distance from drawing center */}
      {showDebug && debugInfo && (
        <div className="absolute top-10 right-2 z-20 bg-zinc-950/95 border border-amber-800/40 rounded p-2 text-[10px] font-mono max-w-xs max-h-80 overflow-y-auto shadow-xl">
          <div className="text-amber-400 font-semibold mb-1">
            Bounds [{Math.round(debugInfo.b.minX)},{Math.round(debugInfo.b.minY)}] → [{Math.round(debugInfo.b.maxX)},{Math.round(debugInfo.b.maxY)}]
            &nbsp;({Math.round(debugInfo.b.maxX - debugInfo.b.minX)} × {Math.round(debugInfo.b.maxY - debugInfo.b.minY)})
          </div>
          <div className="text-zinc-500 mb-1.5">Top 15 outliers (by dist from center):</div>
          {debugInfo.outliers.map(({ o, d, ox, oy }, i) => (
            <div key={o.id ?? i} className="border-t border-zinc-800 py-0.5 text-zinc-400">
              <span className="text-zinc-500">{i + 1}.</span>{" "}
              <span className="text-amber-300">{o.properties?.rawType as string ?? o.rawType ?? o.type}</span>{" "}
              <span className="text-zinc-500">{o.layer}</span>{" "}
              <span className="text-rose-400">x={Math.round(ox)} y={Math.round(oy)}</span>{" "}
              <span className="text-zinc-600">d={Math.round(d)}</span>
              {o.properties?.handle ? <span className="text-zinc-600"> #{o.properties.handle}</span> : null}
            </div>
          ))}
        </div>
      )}

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
