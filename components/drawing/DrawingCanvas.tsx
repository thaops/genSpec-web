"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DrawingCalibration,
  DrawingObject,
  DrawingScene,
} from "@/lib/types";
import { useTheme } from "@/lib/theme";
import type { DrawingTool } from "./DrawingToolbar";
import { Layers, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Unified vector viewer for DXF/DWG scenes (contract: GET .../scene).
// CAD coords are Y-up; screen is Y-down — the world→screen transform flips Y.
// Perf: per-entity bounds precomputed into a flat Float64Array once per scene;
// the rAF render loop only runs when a dirty flag is set (camera / selection /
// visibility / tool overlay changed) and culls entities against the viewport.
// ─────────────────────────────────────────────────────────────────────────────

interface Camera {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface DrawingCanvasProps {
  scene: DrawingScene;
  objects?: DrawingObject[];
  selectedObjectId?: string;
  activeTool?: DrawingTool;
  // null → not calibrated yet: show CalibrationBar (skippable)
  calibration?: DrawingCalibration | null;
  onCalibrated?: (cal: DrawingCalibration) => void;
  onObjectClick?: (obj: DrawingObject) => void;
  layerPanelOpen?: boolean;
  onLayerPanelClose?: () => void;
  // Review Queue: pan/zoom camera to this object's bbox when it changes
  focusObjectId?: string;
  // Review states tint object overlays (approved = green faded, rejected = red hatched)
  reviewStates?: Record<string, "approved" | "rejected">;
  // Bump to re-open the CalibrationBar after the user previously skipped it
  calibrationPromptKey?: number;
}

const MIN_TEXT_PX = 4;
const CULL_PAD = 8;
const MINIMAP_W = 140;
const MINIMAP_H = 92;

// Per-entity precomputed data (built once per scene for 60k-entity perf)
interface SceneIndex {
  // bounds: [minX,minY,maxX,maxY] per entity
  bounds: Float64Array;
  // entity.color ?? layer.color (null → theme default at draw time)
  colors: (string | null)[];
}

function buildSceneIndex(scene: DrawingScene): SceneIndex {
  const n = scene.entities.length;
  const bounds = new Float64Array(n * 4);
  const colors: (string | null)[] = new Array(n);
  const layerColor = new Map<string, string | null>();
  for (const l of scene.layers) layerColor.set(l.name, l.color ?? null);

  for (let i = 0; i < n; i++) {
    const e = scene.entities[i];
    colors[i] = e.color ?? layerColor.get(e.layer) ?? null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    switch (e.t) {
      case "line": {
        minX = Math.min(e.p[0], e.p[2]); maxX = Math.max(e.p[0], e.p[2]);
        minY = Math.min(e.p[1], e.p[3]); maxY = Math.max(e.p[1], e.p[3]);
        break;
      }
      case "pline": {
        for (let j = 0; j + 1 < e.pts.length; j += 2) {
          const x = e.pts[j], y = e.pts[j + 1];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        break;
      }
      case "arc":
      case "circle": {
        minX = e.cx - e.r; maxX = e.cx + e.r;
        minY = e.cy - e.r; maxY = e.cy + e.r;
        break;
      }
      case "text": {
        // Approximate: height h, width h * len * 0.7
        const w = e.h * Math.max(1, e.s.length) * 0.7;
        minX = e.x; maxX = e.x + w;
        minY = e.y; maxY = e.y + e.h;
        break;
      }
    }
    if (!isFinite(minX)) { minX = minY = maxX = maxY = 0; }
    const o = i * 4;
    bounds[o] = minX; bounds[o + 1] = minY; bounds[o + 2] = maxX; bounds[o + 3] = maxY;
  }
  return { bounds, colors };
}

function shoelaceArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function formatNum(v: number): string {
  if (v >= 1000) return v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  return v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

// ─── Calibration bar ─────────────────────────────────────────────────────────

interface CalibrationBarProps {
  pointCount: number; // 0 | 1 | 2 clicked points
  drawingDistance: number | null;
  onConfirm: (realMeters: number) => void;
  onSkip: () => void;
  onReset: () => void;
}

export function CalibrationBar({ pointCount, drawingDistance, onConfirm, onSkip, onReset }: CalibrationBarProps) {
  const [value, setValue] = useState("");
  const parsed = parseFloat(value.replace(",", "."));
  const valid = isFinite(parsed) && parsed > 0 && drawingDistance != null && drawingDistance > 0;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-900/95 border border-zinc-700 shadow-xl text-xs text-zinc-300">
      {pointCount < 2 ? (
        <span>
          Hiệu chỉnh tỉ lệ: click 2 điểm trên một đoạn có kích thước đã biết
          {pointCount === 1 && <span className="text-blue-400"> — điểm thứ 2...</span>}
        </span>
      ) : (
        <>
          <span className="text-zinc-400">Chiều dài thật (m):</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && valid) onConfirm(parsed); }}
            className="w-20 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-100 outline-none focus:border-blue-500"
            placeholder="3.6"
          />
          <button
            disabled={!valid}
            onClick={() => onConfirm(parsed)}
            className="px-2 py-0.5 rounded bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-500"
          >
            OK
          </button>
          <button onClick={onReset} className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">
            Chọn lại
          </button>
        </>
      )}
      <button onClick={onSkip} className="px-2 py-0.5 rounded text-zinc-500 hover:text-zinc-300">
        Bỏ qua
      </button>
    </div>
  );
}

// ─── Main canvas ─────────────────────────────────────────────────────────────

export function DrawingCanvas({
  scene,
  objects = [],
  selectedObjectId,
  activeTool = "pointer",
  calibration,
  onCalibrated,
  onObjectClick,
  layerPanelOpen = false,
  onLayerPanelClose,
  focusObjectId,
  reviewStates,
  calibrationPromptKey,
}: DrawingCanvasProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [hoverObject, setHoverObject] = useState<DrawingObject | null>(null);
  // Calibration point capture (world coords)
  const [calPts, setCalPts] = useState<{ x: number; y: number }[]>([]);
  const [calSkipped, setCalSkipped] = useState(false);
  // Auto-scale ($INSUNITS): user bấm "Hiệu chỉnh" → mở flow 2 điểm dù đã có calibration auto
  const [manualPick, setManualPick] = useState(false);
  const [autoBarDismissed, setAutoBarDismissed] = useState(false);

  const index = useMemo(() => buildSceneIndex(scene), [scene]);

  const calibrating = (calibration == null && !calSkipped) || manualPick;

  // Mutable interaction state (never triggers React renders)
  const st = useRef({
    cam: { scale: 1, offsetX: 0, offsetY: 0 } as Camera,
    dragging: false,
    dragMoved: 0,
    lastX: 0,
    lastY: 0,
    dirty: true,
    raf: 0,
    // measure / area tool: committed world points + live cursor position
    toolPts: [] as { x: number; y: number }[],
    toolHover: null as { x: number; y: number } | null,
    toolDone: false,
  });

  // Latest props/state for the render closure
  const view = useRef({
    scene, index, objects, selectedObjectId, activeTool, calibration,
    hiddenLayers, theme, calPts, hoverObject, calibrating, reviewStates,
  });
  view.current = {
    scene, index, objects, selectedObjectId, activeTool, calibration,
    hiddenLayers, theme, calPts, hoverObject, calibrating, reviewStates,
  };

  // ── Transform helpers ──────────────────────────────────────────────────────
  const w2sX = (x: number) => x * st.current.cam.scale + st.current.cam.offsetX;
  const w2sY = (y: number) => -y * st.current.cam.scale + st.current.cam.offsetY;
  const s2wX = (px: number) => (px - st.current.cam.offsetX) / st.current.cam.scale;
  const s2wY = (py: number) => (st.current.cam.offsetY - py) / st.current.cam.scale;

  const scheduleRender = useCallback(() => {
    st.current.dirty = true;
    if (st.current.raf) return;
    st.current.raf = requestAnimationFrame(() => {
      st.current.raf = 0;
      if (st.current.dirty) {
        st.current.dirty = false;
        draw();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const { bbox } = view.current.scene;
    const ww = bbox.maxX - bbox.minX || 1;
    const wh = bbox.maxY - bbox.minY || 1;
    // 5% padding
    const scale = Math.min(W / ww, H / wh) / 1.05;
    const cam = st.current.cam;
    cam.scale = scale;
    cam.offsetX = (W - ww * scale) / 2 - bbox.minX * scale;
    cam.offsetY = (H - wh * scale) / 2 + bbox.maxY * scale;
    scheduleRender();
  }, [scheduleRender]);

  // ── Rendering ──────────────────────────────────────────────────────────────
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const v = view.current;
    const dark = v.theme === "dark";
    const bg = dark ? "#09090b" : "#ffffff"; // zinc-950 / white
    const defaultStroke = dark ? "#d4d4d8" : "#3f3f46"; // zinc-300 / zinc-700
    const accent = "#3b82f6";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const { scale, offsetX, offsetY } = st.current.cam;
    const ents = v.scene.entities;
    const bounds = v.index.bounds;
    const colors = v.index.colors;
    const hidden = v.hiddenLayers;

    // Viewport in world coords (Y-up)
    const vMinX = (0 - CULL_PAD - offsetX) / scale;
    const vMaxX = (W + CULL_PAD - offsetX) / scale;
    const vMinY = (offsetY - H - CULL_PAD) / scale;
    const vMaxY = (offsetY + CULL_PAD) / scale;

    ctx.lineWidth = 1;
    ctx.lineJoin = "round";

    // 1 — entities
    let lastColor = "";
    for (let i = 0; i < ents.length; i++) {
      const o = i * 4;
      // Cull against viewport
      if (bounds[o + 2] < vMinX || bounds[o] > vMaxX ||
          bounds[o + 3] < vMinY || bounds[o + 1] > vMaxY) continue;

      const e = ents[i];
      if (hidden.size > 0 && hidden.has(e.layer)) continue;

      const color = colors[i] ?? defaultStroke;
      if (color !== lastColor) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        lastColor = color;
      }

      switch (e.t) {
        case "line": {
          ctx.beginPath();
          ctx.moveTo(e.p[0] * scale + offsetX, -e.p[1] * scale + offsetY);
          ctx.lineTo(e.p[2] * scale + offsetX, -e.p[3] * scale + offsetY);
          ctx.stroke();
          break;
        }
        case "pline": {
          const pts = e.pts;
          if (pts.length < 4) break;
          ctx.beginPath();
          ctx.moveTo(pts[0] * scale + offsetX, -pts[1] * scale + offsetY);
          for (let j = 2; j + 1 < pts.length; j += 2) {
            ctx.lineTo(pts[j] * scale + offsetX, -pts[j + 1] * scale + offsetY);
          }
          if (e.closed) ctx.closePath();
          ctx.stroke();
          break;
        }
        case "circle": {
          ctx.beginPath();
          ctx.arc(e.cx * scale + offsetX, -e.cy * scale + offsetY, e.r * scale, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "arc": {
          // Scene angles are in DEGREES (DXF group 50/51). World CCW arc
          // a0→a1 becomes screen angle θ = -a (Y flip), traversed
          // anticlockwise in canvas terms.
          const DEG = Math.PI / 180;
          ctx.beginPath();
          ctx.arc(e.cx * scale + offsetX, -e.cy * scale + offsetY, e.r * scale, -e.a0 * DEG, -e.a1 * DEG, true);
          ctx.stroke();
          break;
        }
        case "text": {
          const hPx = e.h * scale;
          if (hPx <= MIN_TEXT_PX) break; // cull tiny text
          ctx.font = `${hPx}px sans-serif`;
          const tx = e.x * scale + offsetX;
          const ty = -e.y * scale + offsetY;
          if (e.rot) {
            ctx.save();
            ctx.translate(tx, ty);
            ctx.rotate((-e.rot * Math.PI) / 180); // rot is degrees CCW in CAD space
            ctx.fillText(e.s, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(e.s, tx, ty);
          }
          break;
        }
      }
    }

    // 2 — object overlays (detection results)
    for (const obj of v.objects) {
      const { x, y, w, h } = obj.boundingBox;
      const rx = x * scale + offsetX;
      const ry = -(y + h) * scale + offsetY;
      const rw = w * scale, rh = h * scale;
      if (rx + rw < 0 || rx > W || ry + rh < 0 || ry > H) continue;
      const isSel = !!v.selectedObjectId &&
        (obj.id === v.selectedObjectId || obj.stableId === v.selectedObjectId);
      const isHover = v.hoverObject != null && obj.id === v.hoverObject.id;
      const review = v.reviewStates?.[obj.id];
      if (isSel) {
        ctx.fillStyle = "rgba(59,130,246,0.10)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(rx, ry, rw, rh);
      } else if (review === "approved") {
        // Approved: faded green outline
        ctx.strokeStyle = "rgba(34,197,94,0.30)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(rx, ry, rw, rh);
      } else if (review === "rejected") {
        // Rejected: light red box + diagonal strike-through
        ctx.strokeStyle = "rgba(244,63,94,0.45)";
        ctx.fillStyle = "rgba(244,63,94,0.06)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + rw, ry + rh);
        ctx.moveTo(rx + rw, ry);
        ctx.lineTo(rx, ry + rh);
        ctx.stroke();
      } else {
        ctx.strokeStyle = isHover ? accent : dark ? "rgba(96,165,250,0.35)" : "rgba(37,99,235,0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
      }
    }
    ctx.lineWidth = 1;
    lastColor = "";

    // 3 — measure / area / calibration overlays
    drawToolOverlay(ctx, dark);

    drawMinimap(W, H, dark);
  }

  function drawToolOverlay(ctx: CanvasRenderingContext2D, dark: boolean) {
    const v = view.current;
    const s = st.current;
    const cal = v.calibration;
    const factor = cal?.unitsPerDrawingUnit ?? 1;
    const unit = cal?.unitLabel ?? "đv";
    const warn = cal == null;

    // Calibration picking
    if (v.calibrating && v.calPts.length > 0) {
      ctx.strokeStyle = "#f59e0b";
      ctx.fillStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const p0 = v.calPts[0];
      ctx.arc(w2sX(p0.x), w2sY(p0.y), 3, 0, Math.PI * 2);
      ctx.fill();
      if (v.calPts.length === 2) {
        const p1 = v.calPts[1];
        ctx.beginPath();
        ctx.arc(w2sX(p1.x), w2sY(p1.y), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w2sX(p0.x), w2sY(p0.y));
        ctx.lineTo(w2sX(p1.x), w2sY(p1.y));
        ctx.stroke();
      } else if (s.toolHover) {
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(w2sX(p0.x), w2sY(p0.y));
        ctx.lineTo(w2sX(s.toolHover.x), w2sY(s.toolHover.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      return;
    }

    const tool = v.activeTool;
    if ((tool !== "measure" && tool !== "area") || s.toolPts.length === 0) return;

    const pts = s.toolPts;
    const live = !s.toolDone && s.toolHover ? [...pts, s.toolHover] : pts;

    ctx.strokeStyle = "#22c55e";
    ctx.fillStyle = "#22c55e";
    ctx.lineWidth = 1.5;

    // Path
    ctx.beginPath();
    ctx.moveTo(w2sX(live[0].x), w2sY(live[0].y));
    for (let i = 1; i < live.length; i++) ctx.lineTo(w2sX(live[i].x), w2sY(live[i].y));
    if (tool === "area" && live.length > 2) ctx.closePath();
    ctx.stroke();
    if (tool === "area" && live.length > 2) {
      ctx.fillStyle = "rgba(34,197,94,0.12)";
      ctx.fill();
      ctx.fillStyle = "#22c55e";
    }
    // Vertices
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(w2sX(p.x), w2sY(p.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label: total length (measure) or area (area) near last point
    let label = "";
    if (tool === "measure") {
      let total = 0;
      for (let i = 1; i < live.length; i++) {
        total += Math.hypot(live[i].x - live[i - 1].x, live[i].y - live[i - 1].y);
      }
      const seg = live.length >= 2
        ? Math.hypot(live[live.length - 1].x - live[live.length - 2].x,
                     live[live.length - 1].y - live[live.length - 2].y)
        : 0;
      label = `${formatNum(seg * factor)} ${unit}  ·  Σ ${formatNum(total * factor)} ${unit}`;
    } else {
      const area = live.length > 2 ? shoelaceArea(live) : 0;
      label = `${formatNum(area * factor * factor)} ${unit}²`;
    }
    if (warn) label += "  (chưa hiệu chỉnh)";
    // Tỉ lệ tự nhận ($INSUNITS): không cảnh báo amber — chỉ ghi chú xám nhỏ
    const suffix = !warn && cal?.auto ? "  (tự nhận)" : "";

    const anchor = live[live.length - 1];
    const lx = w2sX(anchor.x) + 10;
    const ly = w2sY(anchor.y) - 10;
    ctx.font = "11px sans-serif";
    const tw = ctx.measureText(label).width;
    const sw = suffix ? ctx.measureText(suffix).width : 0;
    ctx.fillStyle = dark ? "rgba(9,9,11,0.85)" : "rgba(255,255,255,0.9)";
    ctx.fillRect(lx - 4, ly - 12, tw + sw + 8, 16);
    ctx.fillStyle = warn ? "#f59e0b" : "#22c55e";
    ctx.fillText(label, lx, ly);
    if (suffix) {
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#71717a"; // zinc-500
      ctx.fillText(suffix, lx + tw, ly);
      ctx.font = "11px sans-serif";
    }
  }

  function drawMinimap(viewW: number, viewH: number, dark: boolean) {
    const mm = minimapRef.current;
    if (!mm) return;
    const ctx = mm.getContext("2d");
    if (!ctx) return;
    const { bbox } = view.current.scene;
    const ww = bbox.maxX - bbox.minX || 1;
    const wh = bbox.maxY - bbox.minY || 1;
    const s = Math.min(MINIMAP_W / ww, MINIMAP_H / wh) * 0.9;
    const ox = (MINIMAP_W - ww * s) / 2;
    const oy = (MINIMAP_H - wh * s) / 2;

    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
    ctx.fillStyle = dark ? "#18181b" : "#f4f4f5";
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);
    ctx.strokeStyle = dark ? "#3f3f46" : "#a1a1aa";
    ctx.strokeRect(ox, oy, ww * s, wh * s);

    // Viewport rect: world extent currently visible
    const cam = st.current.cam;
    const wx0 = (0 - cam.offsetX) / cam.scale;
    const wx1 = (viewW - cam.offsetX) / cam.scale;
    const wy1 = cam.offsetY / cam.scale;           // top (max world Y)
    const wy0 = (cam.offsetY - viewH) / cam.scale; // bottom
    const rx = ox + (wx0 - bbox.minX) * s;
    const ry = oy + (bbox.maxY - wy1) * s;
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, (wx1 - wx0) * s, (wy1 - wy0) * s);
    ctx.lineWidth = 1;
  }

  function onMinimapClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const { bbox } = view.current.scene;
    const ww = bbox.maxX - bbox.minX || 1;
    const wh = bbox.maxY - bbox.minY || 1;
    const s = Math.min(MINIMAP_W / ww, MINIMAP_H / wh) * 0.9;
    const ox = (MINIMAP_W - ww * s) / 2;
    const oy = (MINIMAP_H - wh * s) / 2;
    // Click point → world coords → center viewport there
    const wx = bbox.minX + (e.clientX - rect.left - ox) / s;
    const wy = bbox.maxY - (e.clientY - rect.top - oy) / s;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cam = st.current.cam;
    cam.offsetX = canvas.clientWidth / 2 - wx * cam.scale;
    cam.offsetY = canvas.clientHeight / 2 + wy * cam.scale;
    scheduleRender();
  }

  // ── Object hit-test (bbox contains point, smallest wins) ──────────────────
  function pickObject(wx: number, wy: number): DrawingObject | null {
    let best: DrawingObject | null = null;
    let bestArea = Infinity;
    for (const obj of view.current.objects) {
      const { x, y, w, h } = obj.boundingBox;
      if (wx < x || wx > x + w || wy < y || wy > y + h) continue;
      const area = Math.max(w, 1e-9) * Math.max(h, 1e-9);
      if (area < bestArea) { bestArea = area; best = obj; }
    }
    return best;
  }

  // ── Interactions ───────────────────────────────────────────────────────────
  function canvasPoint(e: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  function zoomAt(px: number, py: number, factor: number) {
    const cam = st.current.cam;
    const next = Math.min(Math.max(cam.scale * factor, 1e-9), 1e9);
    const f = next / cam.scale;
    cam.offsetX = px - (px - cam.offsetX) * f;
    cam.offsetY = py - (py - cam.offsetY) * f;
    cam.scale = next;
    scheduleRender();
  }

  // Native wheel listener — React onWheel is passive, preventDefault won't work
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { px, py } = canvasPoint(e);
      zoomAt(px, py, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    st.current.dragging = true;
    st.current.dragMoved = 0;
    st.current.lastX = e.clientX;
    st.current.lastY = e.clientY;
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = st.current;
    const { px, py } = canvasPoint(e);
    if (s.dragging) {
      const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY;
      s.dragMoved += Math.abs(dx) + Math.abs(dy);
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      if (s.dragMoved > 3) {
        s.cam.offsetX += dx;
        s.cam.offsetY += dy;
        scheduleRender();
        return;
      }
    }
    const v = view.current;
    // Live segment preview for measure/area/calibration
    if (v.calibrating || v.activeTool === "measure" || v.activeTool === "area") {
      s.toolHover = { x: s2wX(px), y: s2wY(py) };
      if (s.toolPts.length > 0 || v.calPts.length > 0) scheduleRender();
      return;
    }
    // Hover cursor over objects (pointer tool)
    if (v.activeTool === "pointer" && v.objects.length > 0) {
      const hit = pickObject(s2wX(px), s2wY(py));
      if (hit?.id !== v.hoverObject?.id) setHoverObject(hit);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = st.current;
    const wasDrag = s.dragging && s.dragMoved > 5;
    s.dragging = false;
    if (wasDrag || e.button !== 0) return;

    // It's a click
    const { px, py } = canvasPoint(e);
    const wx = s2wX(px), wy = s2wY(py);
    const v = view.current;

    if (v.calibrating) {
      if (v.calPts.length < 2) setCalPts([...v.calPts, { x: wx, y: wy }]);
      scheduleRender();
      return;
    }
    if (v.activeTool === "measure" || v.activeTool === "area") {
      if (s.toolDone) { s.toolPts = []; s.toolDone = false; }
      s.toolPts.push({ x: wx, y: wy });
      scheduleRender();
      return;
    }
    // Pointer: object selection
    const hit = pickObject(wx, wy);
    if (hit) onObjectClick?.(hit);
  }

  function onDoubleClick() {
    const s = st.current;
    const v = view.current;
    if ((v.activeTool === "measure" || v.activeTool === "area") && s.toolPts.length > 0) {
      // Double-click ends the current measurement (freeze it on screen).
      // pointerup already added the point twice; drop the duplicate.
      if (s.toolPts.length >= 2) s.toolPts.pop();
      s.toolDone = true;
      scheduleRender();
      return;
    }
    fitView();
  }

  // Keyboard: F fit · +/- zoom · Escape ends measure/area/calibration
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (e.key === "f" || e.key === "F") { e.preventDefault(); fitView(); }
      else if (e.key === "+" || e.key === "=") {
        zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.25);
      } else if (e.key === "-" || e.key === "_") {
        zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / 1.25);
      } else if (e.key === "Escape") {
        st.current.toolPts = [];
        st.current.toolDone = false;
        setCalPts([]);
        scheduleRender();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset tool points when switching tools
  useEffect(() => {
    st.current.toolPts = [];
    st.current.toolDone = false;
    st.current.toolHover = null;
    scheduleRender();
  }, [activeTool, scheduleRender]);

  // Initial fit + refit on new scene
  useEffect(() => {
    fitView();
    setCalPts([]);
    setCalSkipped(false);
    setManualPick(false);
    setAutoBarDismissed(false);
    setHiddenLayers(new Set());
  }, [scene, fitView]);

  // Repaint on visual state changes
  useEffect(() => { scheduleRender(); },
    [selectedObjectId, hiddenLayers, theme, objects, hoverObject, calPts, reviewStates, scheduleRender]);

  // Review Queue focus: pan/zoom camera to the object's bbox (fit + padding)
  useEffect(() => {
    if (!focusObjectId) return;
    const canvas = canvasRef.current;
    const obj = view.current.objects.find(
      (o) => o.id === focusObjectId || o.stableId === focusObjectId
    );
    if (!canvas || !obj) return;
    const { x, y, w, h } = obj.boundingBox;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const ww = w || 1, wh = h || 1;
    // Fit bbox at ~35% of viewport so surrounding context stays visible
    const scale = Math.min(W / ww, H / wh) * 0.35;
    const cam = st.current.cam;
    cam.scale = Math.min(Math.max(scale, 1e-9), 1e9);
    cam.offsetX = W / 2 - (x + ww / 2) * cam.scale;
    cam.offsetY = H / 2 + (y + wh / 2) * cam.scale;
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusObjectId]);

  // Re-open the calibration wizard on demand (e.g. full takeoff needs a scale)
  useEffect(() => {
    if (!calibrationPromptKey) return;
    setCalSkipped(false);
    setCalPts([]);
  }, [calibrationPromptKey]);

  // Resize → repaint (canvas pixel size synced inside draw())
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => scheduleRender());
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheduleRender]);

  // Cleanup pending rAF
  useEffect(() => () => { if (st.current.raf) cancelAnimationFrame(st.current.raf); }, []);

  // ── Layer panel handlers ───────────────────────────────────────────────────
  function toggleLayer(name: string, altKey: boolean) {
    setHiddenLayers((prev) => {
      if (altKey) {
        // "chỉ hiện layer này" — hide all others
        return new Set(scene.layers.filter((l) => l.name !== name).map((l) => l.name));
      }
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleCalConfirm(realMeters: number) {
    if (calPts.length < 2) return;
    const d = Math.hypot(calPts[1].x - calPts[0].x, calPts[1].y - calPts[0].y);
    if (d <= 0) return;
    setCalPts([]);
    setManualPick(false);
    onCalibrated?.({ unitsPerDrawingUnit: realMeters / d, unitLabel: "m" });
  }

  const drawingDist = calPts.length === 2
    ? Math.hypot(calPts[1].x - calPts[0].x, calPts[1].y - calPts[0].y)
    : null;

  const cursor = calibrating || activeTool === "measure" || activeTool === "area"
    ? "cursor-crosshair"
    : hoverObject
      ? "cursor-pointer"
      : "cursor-grab";

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full touch-none ${cursor}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { st.current.dragging = false; }}
        onDoubleClick={onDoubleClick}
      />

      {/* Calibration wizard */}
      {calibrating && (
        <CalibrationBar
          pointCount={calPts.length}
          drawingDistance={drawingDist}
          onConfirm={handleCalConfirm}
          onSkip={() => { setCalSkipped(true); setManualPick(false); setCalPts([]); }}
          onReset={() => setCalPts([])}
        />
      )}

      {/* Auto-scale banner ($INSUNITS) — hiện khi tỉ lệ tự nhận từ đơn vị bản vẽ */}
      {!calibrating && calibration?.auto && !autoBarDismissed && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-900/95 border border-zinc-700 shadow-xl text-xs text-zinc-300">
          <span>
            Tỉ lệ tự nhận từ bản vẽ ({scene.units}) — đo thử một đoạn để xác nhận, hoặc hiệu
            chỉnh 2 điểm
          </span>
          <button
            onClick={() => { setManualPick(true); setCalPts([]); }}
            className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500"
          >
            Hiệu chỉnh
          </button>
          <button
            onClick={() => setAutoBarDismissed(true)}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label="Đóng"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Truncated scene warning */}
      {scene.truncated && (
        <div className="absolute top-2 left-2 z-20 px-2 py-1 rounded bg-amber-900/70 border border-amber-700/50 text-amber-200 text-[10px]">
          Bản vẽ lớn — chỉ hiển thị một phần entities
        </div>
      )}

      {/* Hint bar */}
      <div className="absolute bottom-2 left-2 z-10 text-[9px] text-zinc-500 select-none pointer-events-none">
        Lăn chuột = Zoom · Kéo = Pan · DblClick / F = Fit
      </div>

      {/* Layer panel */}
      {layerPanelOpen && (
        <div className="absolute top-2 right-2 z-20 w-52 max-h-[70%] flex flex-col rounded-md border border-zinc-700 bg-zinc-900/95 shadow-xl text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-zinc-800 text-zinc-300">
            <Layers className="h-3 w-3" />
            <span className="font-medium">Layers ({scene.layers.length})</span>
            <button onClick={onLayerPanelClose} className="ml-auto text-zinc-500 hover:text-zinc-300">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="overflow-y-auto py-1">
            {scene.layers.map((l) => (
              <label
                key={l.name}
                title="Alt+click: chỉ hiện layer này"
                className="flex items-center gap-2 px-2.5 py-1 hover:bg-zinc-800/60 cursor-pointer"
                onClick={(e) => { e.preventDefault(); toggleLayer(l.name, e.altKey); }}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={!hiddenLayers.has(l.name)}
                  className="h-3 w-3 accent-blue-600 pointer-events-none"
                />
                {l.color && (
                  <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: l.color }} />
                )}
                <span className="text-zinc-300 truncate flex-1">{l.name}</span>
                <span className="text-zinc-600 font-mono text-[9px]">{l.entityCount}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Minimap */}
      <div
        className="absolute bottom-3 right-3 z-10 rounded border border-zinc-700/60 overflow-hidden shadow-xl"
        style={{ width: MINIMAP_W, height: MINIMAP_H }}
        title="Minimap — Click để điều hướng"
      >
        <canvas
          ref={minimapRef}
          width={MINIMAP_W}
          height={MINIMAP_H}
          onClick={onMinimapClick}
          className="cursor-crosshair block"
        />
      </div>
    </div>
  );
}
