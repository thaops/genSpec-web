"use client";

import { useEffect, useRef, useState } from "react";
import type { Action, Drawing, DrawingCalibration, DrawingFocusRequest, DrawingObject, DrawingScene, LayerRule } from "@/lib/types";
import { api, API_URL } from "@/lib/api";
import { renderSceneThumbnail } from "@/lib/drawing/sceneThumbnail";
import { PdfViewer } from "./PdfViewer";
import { DxfViewer } from "./DxfViewer";
import { DwgCanvasViewer } from "./DwgCanvasViewer";
import { DrawingCanvas, type ScopeRect } from "./DrawingCanvas";
import { DrawingUpload } from "./DrawingUpload";
import { ObjectInspector } from "./ObjectInspector";
import { ReviewQueue, type ReviewStates, type ReviewStatus } from "./ReviewQueue";
import { RevisionPanel } from "./RevisionPanel";
import { RebarPanel } from "./RebarPanel";
import { BuildingPanel } from "./BuildingPanel";
import { DrawingToolbar, type DrawingTool } from "./DrawingToolbar";
import { Spinner } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { addJob, updateJob } from "@/components/ui/JobCenter";
import { buildFullTakeoffAction } from "@/lib/actions/AgentActions";
import { summarizeObjects } from "@/lib/drawing/objectMeasure";
import type { TakeoffEngineAssumptions } from "@/lib/api";
import {
  TakeoffAssumptionsPopover,
  loadTakeoffAssumptions,
  DEFAULT_TAKEOFF_ASSUMPTIONS,
} from "./TakeoffAssumptions";
import { AlertTriangle, ChevronDown, RotateCw, Ruler, Settings2, Sparkles, Zap } from "lucide-react";
import { isStuck, parseElapsedMs, parseStatusLabel } from "@/lib/drawing/parseProgress";

// Quy đổi đơn vị bản vẽ ($INSUNITS) → mét
const INSUNITS_TO_METERS: Record<string, number> = {
  mm: 0.001,
  m: 1,
  inch: 0.0254,
};

function DrawingProcessingState({
  drawing,
  onRetry,
  retrying,
}: {
  drawing: Drawing;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const status = drawing.parseStatus ?? "pending";
  const isFailed = status === "failed";
  // Đếm elapsed để hiển thị (Ns) và phát hiện kẹt — tick mỗi giây.
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (isFailed) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isFailed]);

  const elapsedMs = parseElapsedMs(drawing, now);
  const seconds = Math.floor(elapsedMs / 1000);
  const stuck = !isFailed && !dismissed && isStuck(elapsedMs);

  const RetryButton = () =>
    onRetry ? (
      <button
        onClick={onRetry}
        disabled={retrying}
        className="flex items-center gap-1.5 rounded bg-accent-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
      >
        {retrying ? <Spinner className="h-3 w-3" /> : <RotateCw className="h-3 w-3" />}
        Thử lại
      </button>
    ) : null;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
      {isFailed ? (
        <>
          <AlertTriangle className="h-6 w-6 text-rose-400" />
          <p className="text-sm text-rose-400">Xử lý thất bại</p>
          {drawing.parseError && (
            <p className="text-xs text-zinc-600 max-w-xs text-center">{drawing.parseError}</p>
          )}
          <RetryButton />
        </>
      ) : stuck ? (
        <>
          <AlertTriangle className="h-6 w-6 text-amber-400" />
          <p className="text-sm text-amber-300">Xử lý lâu hơn thường lệ ({seconds}s)</p>
          <p className="text-xs text-zinc-600 max-w-xs text-center">
            Bản vẽ có thể bị kẹt. Thử lại hoặc để xử lý nền và xem sau.
          </p>
          <div className="flex items-center gap-2">
            <RetryButton />
            <button
              onClick={() => setDismissed(true)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Xử lý nền, xem sau
            </button>
          </div>
        </>
      ) : (
        <>
          <Spinner className="h-6 w-6" />
          <p className="text-sm">{parseStatusLabel(status)} ({seconds}s)</p>
          <p className="text-xs text-zinc-600">Trang sẽ tự cập nhật khi xong</p>
        </>
      )}
    </div>
  );
}

export interface EngineTakeoffPayload {
  drawingId: string;
  unitsPerDrawingUnit: number;
  assumptions: TakeoffEngineAssumptions;
  rejectedObjectIds: string[];
  /** Vùng bóc user kéo chọn (world coords) — BE chỉ đo đối tượng có tâm trong vùng */
  region?: ScopeRect;
  /** QS xác nhận vòng tròn ambiguous là cột tròn (từ cluster picker) → BE đo πr²×H. */
  confirmRoundColumns?: boolean;
  /** Nhãn vùng ("Cụm 1"…) từ cluster picker → cột "Khu vực" trong sheet. */
  regionLabel?: string;
  /** Legacy LLM prompt — page falls back to runTask(fallbackPrompt) on engine error */
  fallbackPrompt: string;
}

/** Tâm bbox của object có nằm trong vùng bóc không (world coords, Y-up). */
function objectInScope(obj: DrawingObject, rect: ScopeRect): boolean {
  const { x, y, w, h } = obj.boundingBox;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
}

export interface DrawingViewportInfo {
  drawingId: string;
  page: number;
  scale: number;
  scrollX: number;
  scrollY: number;
  activeTool: DrawingTool;
  selectedObjectId?: string;
  selectedObjectType?: string;
  layer?: string;
}

interface DrawingWorkspaceProps {
  estimateId: string;
  location?: string; // tỉnh dự án — để định giá MEP theo tên
  onAddToBoq?: (actions: Action[]) => void; // đẩy rebar/MEP thành dòng dự toán
  activeDrawingId?: string;
  onDrawingSelect?: (drawingId: string) => void;
  onObjectSelect?: (obj: DrawingObject) => void;
  // Generate Takeoff: Action-first flow, not chat
  onGenerateTakeoff?: (obj: DrawingObject, drawingId: string) => void;
  drawings: Drawing[];
  onDrawingsChange?: (drawings: Drawing[]) => void;
  onViewportChange?: (info: DrawingViewportInfo) => void;
  // Called once when a drawing first loads objects (auto-detection complete)
  onObjectsLoaded?: (objects: DrawingObject[]) => void;
  // "⚡ Bóc toàn bộ" (legacy LLM path): workspace builds the structured
  // prompt, page sends it. Kept as the FALLBACK when the engine errors.
  onFullTakeoff?: (prompt: string) => void;
  // "⚡ Bóc toàn bộ" (engine path): deterministic geometry takeoff on the BE.
  // When provided, it takes precedence over onFullTakeoff; fallbackPrompt is
  // the legacy LLM prompt the page replays if the engine call fails.
  onEngineTakeoff?: (payload: EngineTakeoffPayload) => void;
  // "⚡ Bóc toàn bộ dự án": chạy engine tuần tự cho TỪNG bản vẽ (mỗi bản theo
  // bộ môn của nó), tất cả proposal áp vào cùng sheet Khối lượng. Chỉ hiện khi
  // có ≥2 bản vẽ ready. Idempotent theo drawingId+rowKey nên gộp không đè.
  onProjectTakeoff?: () => void;
  // Agent task in-flight (page-level) → disable takeoff triggers
  takeoffBusy?: boolean;
  // Traceability: drawing → BOQ jump requested from the Object Inspector
  onJumpToBoq?: (obj: DrawingObject) => void;
  // Traceability: BOQ → drawing focus request (token parsed from workbook row)
  externalFocus?: DrawingFocusRequest | null;
  // Revision compare: forward the delta summary to the copilot
  onAskAI?: (summaryText: string) => void;
}

export function DrawingWorkspace({
  estimateId,
  location,
  onAddToBoq,
  activeDrawingId,
  onDrawingSelect,
  onObjectSelect,
  onGenerateTakeoff,
  drawings,
  onDrawingsChange,
  onViewportChange,
  onObjectsLoaded,
  onFullTakeoff,
  onEngineTakeoff,
  onProjectTakeoff,
  takeoffBusy = false,
  onJumpToBoq,
  externalFocus,
  onAskAI,
}: DrawingWorkspaceProps) {
  const toast = useToast();
  const [objects, setObjects] = useState<DrawingObject[]>([]);
  const [layerRules, setLayerRules] = useState<LayerRule[]>([]);
  const [selectedObject, setSelectedObject] = useState<DrawingObject | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  // P4 — 1 dock phải duy nhất: Review / Revision / Inspector loại trừ lẫn nhau
  // (mở cái này tự đóng cái kia → không còn panel chồng nhau). Giữ API 3 setter cũ.
  const [rightPanel, setRightPanel] = useState<"none" | "review" | "revision" | "inspector" | "rebar" | "building">("none");
  const inspectorOpen = rightPanel === "inspector";
  const reviewOpen = rightPanel === "review";
  const revisionOpen = rightPanel === "revision";
  const makePanelSetter = (key: "review" | "revision" | "inspector") =>
    (v: boolean | ((prev: boolean) => boolean)) => {
      const cur = rightPanel === key;
      const next = typeof v === "function" ? (v as (p: boolean) => boolean)(cur) : v;
      setRightPanel(next ? key : "none");
    };
  const setInspectorOpen = makePanelSetter("inspector");
  const setReviewOpen = makePanelSetter("review");
  const setRevisionOpen = makePanelSetter("revision");
  // Tab khởi tạo cho BuildingPanel (mở thẳng Rà soát từ Inspector)
  const [buildingInitialTab, setBuildingInitialTab] = useState<"floors" | "mep" | "review" | "swap">("floors");
  const [activeTool, setActiveTool] = useState<DrawingTool>("pointer");
  const [viewport, setViewport] = useState({ page: 1, scale: 1.2, scrollX: 0, scrollY: 0 });
  // Unified vector scene (M1) — null while loading / after 404 fallback
  const [scene, setScene] = useState<DrawingScene | null>(null);
  const [sceneStatus, setSceneStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [calibration, setCalibration] = useState<DrawingCalibration | null>(null);
  // Review Queue: per-object approve/reject persisted per drawing
  const [reviewStates, setReviewStates] = useState<ReviewStates>({});
  // P3 gom nút: menu "Bóc ▾" (Detect + bóc dự án) và "Xem ▾" (Duyệt/So sánh/Inspector)
  const [takeoffMenuOpen, setTakeoffMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const takeoffMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [focusObjectId, setFocusObjectId] = useState<string | undefined>(undefined);
  // Full takeoff flow
  const [fullTakeoffRunning, setFullTakeoffRunning] = useState(false);
  const [calibrationPromptKey, setCalibrationPromptKey] = useState(0);
  // Engine takeoff: assumptions popover (first ⚡ per drawing, or via ⚙)
  const [assumpOpen, setAssumpOpen] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  // Đóng menu Bóc/Xem khi click ra ngoài
  useEffect(() => {
    if (!takeoffMenuOpen && !viewMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (takeoffMenuOpen && !takeoffMenuRef.current?.contains(e.target as Node)) setTakeoffMenuOpen(false);
      if (viewMenuOpen && !viewMenuRef.current?.contains(e.target as Node)) setViewMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [takeoffMenuOpen, viewMenuOpen]);
  // Vùng bóc (scope): rect world-coords per drawing, persisted localStorage
  const [scopeRect, setScopeRect] = useState<ScopeRect | null>(null);
  // Calibration gate dialog — holds the detected objects awaiting a decision
  // Track drawings already announced to avoid duplicate notifications
  const announcedDrawings = useRef<Set<string>>(new Set());
  // Drawings đã gen thumbnail trong phiên này — tránh POST lại mỗi lần mở.
  const thumbedDrawings = useRef<Set<string>>(new Set());

  const activeDrawing = drawings.find((d) => d.id === activeDrawingId);

  // Poll trạng thái parse do page xử lý tập trung (poll TẤT CẢ bản vẽ chưa
  // ready). Workspace chỉ đọc activeDrawing từ prop → không poll trùng ở đây.
  const [retrying, setRetrying] = useState(false);
  async function handleRetryParse() {
    if (!activeDrawingId || retrying) return;
    setRetrying(true);
    try {
      const updated = await api.reparseDrawing(estimateId, activeDrawingId);
      onDrawingsChange?.(drawings.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
    } catch {
      toast.error("Không thử lại được", "Vui lòng thử lại sau ít phút.");
    } finally {
      setRetrying(false);
    }
  }

  // Load objects when drawing becomes ready (first select OR after parsing completes)
  useEffect(() => {
    // Reset per-drawing state so a processing/failed drawing never shows the
    // previous drawing's objects or selection.
    setObjects([]);
    setSelectedObject(null);
    if (!activeDrawingId) return;
    if (activeDrawing?.parseStatus && activeDrawing.parseStatus !== 'ready') return;
    setLoadingObjects(true);
    api.getDrawing(estimateId, activeDrawingId)
      .then((d) => {
        const objs = d.objects ?? [];
        setObjects(objs);
        // Fire once per drawing when AI detection results first arrive
        if (objs.length > 0 && !announcedDrawings.current.has(activeDrawingId)) {
          announcedDrawings.current.add(activeDrawingId);
          onObjectsLoaded?.(objs);
        }
      })
      .catch(() => setObjects([]))
      .finally(() => setLoadingObjects(false));
  }, [estimateId, activeDrawingId, activeDrawing?.parseStatus]);

  // Load unified vector scene for dxf/dwg (M1). 404 / error → legacy fallback.
  useEffect(() => {
    setScene(null);
    setLayerPanelOpen(false);
    const drawing = drawings.find((d) => d.id === activeDrawingId);
    const isVector = drawing && (drawing.type === "dxf" || drawing.type === "dwg");
    const ready = !drawing?.parseStatus || drawing?.parseStatus === "ready";
    if (!activeDrawingId || !isVector || !ready) {
      setSceneStatus("idle");
      return;
    }
    let cancelled = false;
    setSceneStatus("loading");
    api.getDrawingScene(estimateId, activeDrawingId)
      .then((s) => {
        if (cancelled) return;
        setScene(s);
        setSceneStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setSceneStatus("fallback");
      });
    return () => { cancelled = true; };
  }, [estimateId, activeDrawingId, activeDrawing?.parseStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sinh thumbnail từ scene (1 lần/bản vẽ) khi bản vẽ chưa có → thay placeholder
  // chữ cái ở card home. Chạy nền, lỗi bỏ qua (không chặn UI).
  useEffect(() => {
    if (sceneStatus !== "ready" || !scene || !activeDrawingId) return;
    if (activeDrawing?.thumbnail || thumbedDrawings.current.has(activeDrawingId)) return;
    thumbedDrawings.current.add(activeDrawingId);
    const dataUrl = renderSceneThumbnail(scene);
    if (!dataUrl) return;
    // 1 lần/phiên: lỗi (mạng/ảnh quá lớn) thì thôi, tránh spam POST 400.
    api.saveDrawingThumbnail(estimateId, activeDrawingId, dataUrl).catch(() => {});
  }, [sceneStatus, scene, activeDrawingId, activeDrawing?.thumbnail, estimateId]);

  // Per-drawing calibration persisted in localStorage.
  // Discard stale auto entries with factor 1 ("đơn vị bản vẽ") saved by the old
  // confirm-gate — they override the INSUNITS heuristic and produce numbers
  // that are off by orders of magnitude (119 km of walls…). Manual 2-point
  // calibrations are always kept.
  useEffect(() => {
    if (!activeDrawingId) return;
    try {
      const raw = localStorage.getItem(`genspec_drawing_cal_${activeDrawingId}`);
      const cal = raw ? (JSON.parse(raw) as DrawingCalibration) : null;
      // Any persisted AUTO calibration is legacy (old confirm-gate) — auto is
      // meant to be recomputed from the scene each load, never stored.
      if (cal?.auto) {
        localStorage.removeItem(`genspec_drawing_cal_${activeDrawingId}`);
        setCalibration(null);
      } else {
        setCalibration(cal);
      }
    } catch {
      setCalibration(null);
    }
  }, [activeDrawingId]);

  // $INSUNITS auto-scale với plausibility check: header DXF/DWG hay khai sai
  // đơn vị (bản vẽ VN vẽ mm nhưng $INSUNITS=inch) — chọn đơn vị cho ra kích
  // thước công trình hợp lý (2m–5km); không hợp lý → thử mm rồi m.
  // Auto calibration KHÔNG persist; hiệu chỉnh tay luôn ghi đè.
  useEffect(() => {
    if (!scene) return;
    const w = (scene.bbox?.maxX ?? 0) - (scene.bbox?.minX ?? 0);
    const h = (scene.bbox?.maxY ?? 0) - (scene.bbox?.minY ?? 0);
    const span = Math.max(w, h) || 0;
    const plausible = (f: number) => span * f >= 2 && span * f <= 5000;
    const declared = scene.units !== "unknown" ? INSUNITS_TO_METERS[scene.units] : undefined;
    let factor = declared;
    let inferred = false;
    if (span > 0 && (factor == null || !plausible(factor))) {
      const guess = [0.001, 1, 0.0254].find((f) => plausible(f));
      if (guess != null) {
        factor = guess;
        inferred = true;
      }
    }
    if (factor == null) return;
    setCalibration((prev) =>
      prev ?? { unitsPerDrawingUnit: factor!, unitLabel: "m", auto: true }
    );
    if (inferred && declared != null && factor !== declared) {
      const name = factor === 0.001 ? "mm" : factor === 1 ? "m" : "inch";
      toast.error(
        "Đơn vị bản vẽ nghi khai sai",
        `Header ghi "${scene.units}" nhưng kích thước không hợp lý — đang dùng ${name}. Hiệu chỉnh 2 điểm nếu số đo lệch.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Per-drawing scope rect (vùng bóc) persisted in localStorage
  useEffect(() => {
    if (!activeDrawingId) { setScopeRect(null); return; }
    try {
      const raw = localStorage.getItem(`genspec_takeoff_scope_${activeDrawingId}`);
      setScopeRect(raw ? (JSON.parse(raw) as ScopeRect) : null);
    } catch {
      setScopeRect(null);
    }
  }, [activeDrawingId]);

  function handleScopeChange(rect: ScopeRect | null) {
    setScopeRect(rect);
    if (!activeDrawingId) return;
    try {
      if (rect) localStorage.setItem(`genspec_takeoff_scope_${activeDrawingId}`, JSON.stringify(rect));
      else localStorage.removeItem(`genspec_takeoff_scope_${activeDrawingId}`);
    } catch { /* quota */ }
  }

  // Per-drawing review states persisted in localStorage
  useEffect(() => {
    setReviewOpen(false);
    setAssumpOpen(false);
    setFocusObjectId(undefined);
    if (!activeDrawingId) { setReviewStates({}); return; }
    try {
      const raw = localStorage.getItem(`genspec_obj_review_${activeDrawingId}`);
      setReviewStates(raw ? (JSON.parse(raw) as ReviewStates) : {});
    } catch {
      setReviewStates({});
    }
  }, [activeDrawingId]);

  // BOQ → drawing: resolve the external focus request once objects are loaded.
  // Matches [obj:<id>] by id/stableId, [nhóm:<type>] by first object of that type.
  const handledFocusNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!externalFocus || loadingObjects) return;
    if (handledFocusNonce.current === externalFocus.nonce) return;
    handledFocusNonce.current = externalFocus.nonce;
    const obj = externalFocus.objectId
      ? objects.find((o) => o.id === externalFocus.objectId || o.stableId === externalFocus.objectId)
      : externalFocus.groupType
        ? objects.find((o) => o.type === externalFocus.groupType)
        : undefined;
    if (!obj) {
      toast.error(
        "Không tìm thấy đối tượng trên bản vẽ",
        "Đối tượng có thể đã bị xoá hoặc thuộc bản vẽ khác."
      );
      return;
    }
    setSelectedObject(obj);
    setFocusObjectId(obj.id);
    setInspectorOpen(true);
    onObjectSelect?.(obj);
  }, [externalFocus, loadingObjects, objects]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleReviewStateChange(objectId: string, status: ReviewStatus) {
    setReviewStates((prev) => {
      const next = { ...prev, [objectId]: status };
      if (activeDrawingId) {
        try {
          localStorage.setItem(`genspec_obj_review_${activeDrawingId}`, JSON.stringify(next));
        } catch { /* quota */ }
      }
      return next;
    });
  }

  function handleCalibrated(cal: DrawingCalibration) {
    setCalibration(cal);
    if (activeDrawingId) {
      try {
        localStorage.setItem(`genspec_drawing_cal_${activeDrawingId}`, JSON.stringify(cal));
      } catch { /* quota */ }
    }
  }

  // Notify parent when viewport changes
  useEffect(() => {
    if (!activeDrawingId) return;
    onViewportChange?.({
      drawingId: activeDrawingId,
      ...viewport,
      activeTool,
      selectedObjectId: selectedObject?.id,
      selectedObjectType: selectedObject?.type,
      layer: selectedObject?.layer,
    });
  }, [activeDrawingId, viewport, activeTool, selectedObject]);

  function handleObjectSelect(obj: DrawingObject) {
    setSelectedObject(obj);
    setInspectorOpen(true);
    onObjectSelect?.(obj);
  }

  // Load per-project layer overrides once per estimate
  useEffect(() => {
    if (!estimateId) return;
    api.getLayerRules(estimateId).then(setLayerRules).catch(() => setLayerRules([]));
  }, [estimateId]);

  // Save layer overrides then re-detect so every entity on mapped layers is reclassified
  async function handleApplyLayerRules(rules: LayerRule[]) {
    if (!estimateId) return;
    const saved = await api.saveLayerRules(estimateId, rules);
    setLayerRules(saved);
    await handleDetect();
    toast.success(`Đã áp dụng ${saved.length} quy tắc layer`);
  }

  // Tier 3 — send residual ambiguous/unknown objects to the LLM, refresh on return
  async function handleAiResolve() {
    if (!activeDrawingId) return;
    const job = addJob({ id: crypto.randomUUID(), type: "ai_detect", status: "processing", progress: 0, message: "AI đang giải đối tượng mơ hồ..." });
    try {
      const res = await api.aiResolveObjects(estimateId, activeDrawingId);
      if (res.objects) setObjects(res.objects);
      updateJob(job.id, { status: "done", progress: 100, message: res.message ?? `AI chốt ${res.resolved} đối tượng` });
      toast.success(res.message ?? `AI chốt ${res.resolved}/${res.considered ?? 0} đối tượng`);
    } catch {
      updateJob(job.id, { status: "failed", message: "AI resolve thất bại" });
    }
  }

  // Tier 4 — persist a manual type correction; update the object in place
  async function handleCorrectType(obj: DrawingObject, type: string) {
    if (!activeDrawingId) return;
    try {
      const res = await api.correctObjectType(estimateId, activeDrawingId, obj.stableId, type);
      setObjects((prev) => prev.map((o) => (o.stableId === obj.stableId ? res.object : o)));
      setSelectedObject(res.object);
      toast.success(res.promoted ? `Đã sửa & tạo quy tắc layer "${obj.layer}"` : "Đã sửa loại (bền qua re-detect)");
    } catch {
      toast.error("Sửa loại thất bại");
    }
  }

  async function handleDetect(): Promise<DrawingObject[]> {
    if (!activeDrawingId) return [];
    setDetecting(true);
    const job = addJob({ id: crypto.randomUUID(), type: "ai_detect", status: "processing", progress: 0, message: "Đang phân tích bản vẽ..." });
    try {
      const res = await api.detectDrawingObjects(estimateId, activeDrawingId);
      let objs = res.objects ?? [];
      if (!res.objects) {
        // Defensive: older BE response without objects — re-fetch the drawing
        const d = await api.getDrawing(estimateId, activeDrawingId);
        objs = d.objects ?? [];
      }
      setObjects(objs);
      updateJob(job.id, { status: "done", progress: 100, message: `Tìm thấy ${objs.length} đối tượng` });
      return objs;
    } catch {
      updateJob(job.id, { status: "failed", message: "Phân tích thất bại" });
      return [];
    } finally {
      setDetecting(false);
    }
  }

  // c + d. Measure the approved objects → hand the structured prompt to the page
  function proceedFullTakeoff(objs: DrawingObject[]) {
    if (!activeDrawingId) return;
    // Only objects not rejected in the Review Queue count
    const included = objs.filter((o) => reviewStates[o.id] !== "rejected");
    if (included.length === 0) return;
    const summary = summarizeObjects(included, calibration);
    // Zoom the canvas to the content being measured so the user SEES the scope
    setFitSignal((k) => k + 1);
    // Structured prompt → page (ensures "Khối lượng" sheet + sends)
    onFullTakeoff?.(buildFullTakeoffAction(included, activeDrawingId, calibration, summary));
  }

  // a. Ensure objects — run detection when nothing has been detected yet
  async function ensureObjects(): Promise<DrawingObject[]> {
    if (objects.length > 0) return objects;
    return handleDetect();
  }

  // b. No blocking gate — ⚡ is one click. Auto/raw scale just gets a
  // non-blocking hint; manual calibration (2 clicks on a known dim) is
  // always available from the toolbar.
  function toastScaleHint() {
    if (!calibration || calibration.auto) {
      toast.success(
        "Đang bóc với tỉ lệ tự nhận",
        calibration
          ? `1 đơn vị bản vẽ = ${calibration.unitsPerDrawingUnit} m. Hiệu chỉnh 2 điểm nếu số đo lệch.`
          : "Chưa có tỉ lệ — số liệu theo đơn vị bản vẽ."
      );
    }
  }

  // Engine path: detect if needed → measure scope → deterministic BE call.
  // The legacy LLM prompt rides along as fallbackPrompt (engine error → page
  // replays the old runTask pipeline).
  async function runEngineTakeoff(assumptions: TakeoffEngineAssumptions) {
    if (!activeDrawingId || fullTakeoffRunning || detecting || takeoffBusy) return;
    setFullTakeoffRunning(true);
    try {
      const objs = await ensureObjects();
      if (objs.length === 0) return;
      // Engine measures in real meters — a silent factor=1 would be off by
      // orders of magnitude. No usable scale → block and open calibration.
      if (!calibration) {
        toast.error(
          "Chưa có tỉ lệ bản vẽ",
          "Không nhận được đơn vị từ file. Hiệu chỉnh 2 điểm trên một đoạn đã biết kích thước rồi bóc lại."
        );
        setCalibrationPromptKey((k) => k + 1);
        return;
      }
      toastScaleHint();
      let included = objs.filter((o) => reviewStates[o.id] !== "rejected");
      if (included.length === 0) return;
      const rejectedObjectIds = objs
        .filter((o) => reviewStates[o.id] === "rejected")
        .map((o) => o.id);
      // Vùng bóc: summary/fallback prompt FE cũng chỉ đo objects trong vùng
      // (đồng bộ với filter tâm-bbox phía BE)
      if (scopeRect) {
        const inScope = included.filter((o) => objectInScope(o, scopeRect));
        if (inScope.length === 0) {
          toast.error(
            "Vùng bóc không chứa đối tượng nào",
            "Kéo chọn lại vùng bao quanh phần bản vẽ cần bóc, hoặc xoá vùng để bóc toàn bộ."
          );
          return;
        }
        included = inScope;
      }
      const summary = summarizeObjects(included, calibration);
      // Zoom the canvas to the content being measured so the user SEES the scope
      setFitSignal((k) => k + 1);
      onEngineTakeoff?.({
        drawingId: activeDrawingId,
        unitsPerDrawingUnit: calibration.unitsPerDrawingUnit,
        assumptions,
        rejectedObjectIds,
        region: scopeRect ?? undefined,
        fallbackPrompt: buildFullTakeoffAction(included, activeDrawingId, calibration, summary, assumptions),
      });
    } finally {
      setFullTakeoffRunning(false);
    }
  }

  // "⚡ Bóc toàn bộ": engine path when the page wires onEngineTakeoff,
  // otherwise the legacy LLM path (detect if needed → measure → prompt).
  async function handleFullTakeoff() {
    if (!activeDrawingId || fullTakeoffRunning || detecting || takeoffBusy) return;

    if (onEngineTakeoff) {
      // Fully automatic: run with saved assumptions or sensible defaults —
      // never interrupt the click. Tuning lives behind the ⚙ button.
      const saved = loadTakeoffAssumptions(activeDrawingId);
      await runEngineTakeoff(saved ?? DEFAULT_TAKEOFF_ASSUMPTIONS);
      return;
    }

    // Legacy LLM path (no engine handler wired)
    setFullTakeoffRunning(true);
    try {
      const objs = await ensureObjects();
      if (objs.length === 0) return;
      toastScaleHint();
      proceedFullTakeoff(objs);
    } finally {
      setFullTakeoffRunning(false);
    }
  }

  function handleUploaded(drawing: Drawing) {
    const next = [...drawings, drawing];
    onDrawingsChange?.(next);
    onDrawingSelect?.(drawing.id);
  }

  function handleGenerateTakeoff(obj: DrawingObject) {
    if (!activeDrawingId) return;
    onGenerateTakeoff?.(obj, activeDrawingId);
  }

  // Handle tool selection side effects
  function handleToolChange(tool: DrawingTool) {
    if (tool === "layer") {
      // Layer is a toggle for the panel, not a modal tool
      setLayerPanelOpen((v) => !v);
      return;
    }
    setActiveTool(tool);
    if (tool === "ai") handleDetect();
  }

  // Keyboard shortcuts for scene-canvas tools: M measure, A area, L layer panel
  useEffect(() => {
    if (sceneStatus !== "ready" || !scene) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      // Review Queue owns its keys (A/X/E/arrows) while focused
      if (el?.closest?.("[data-review-queue]")) return;
      const k = e.key.toLowerCase();
      if (k === "m") setActiveTool("measure");
      else if (k === "a") setActiveTool("area");
      else if (k === "s") setActiveTool("scope");
      else if (k === "l") setLayerPanelOpen((v) => !v);
      else if (k === "v") setActiveTool("pointer");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sceneStatus, scene]);

  // Empty state
  if (drawings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="text-center space-y-2">
          <Ruler className="h-10 w-10 text-zinc-600" />
          <p className="text-sm text-zinc-300 font-medium">Chưa có bản vẽ</p>
          <p className="text-xs text-zinc-500">Tải lên bản vẽ PDF, DXF hoặc DWG để bắt đầu</p>
        </div>
        <div className="w-full max-w-md">
          <DrawingUpload estimateId={estimateId} onUploaded={handleUploaded} />
        </div>
      </div>
    );
  }

  if (!activeDrawing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <p className="text-zinc-500 text-sm">Chọn bản vẽ từ Explorer để xem</p>
        <div className="w-full max-w-md">
          <DrawingUpload estimateId={estimateId} onUploaded={handleUploaded} />
        </div>
      </div>
    );
  }

  const isReady   = !activeDrawing.parseStatus || activeDrawing.parseStatus === "ready";
  const isProcessing = !isReady;
  const pendingReviewCount = objects.filter((o) => !reviewStates[o.id]).length;

  // Always serve files through API proxy — Cloudinary raw URLs return 401 (CDN ACL)
  const proxyUrl = `${API_URL}/estimates/${estimateId}/drawings/${activeDrawing.id}/file`;

  const isPdf  = isReady && activeDrawing.type === "pdf";
  const isVector = isReady && (activeDrawing.type === "dxf" || activeDrawing.type === "dwg");
  // Unified scene canvas takes over dxf/dwg when the scene endpoint responds
  const sceneActive  = isVector && sceneStatus === "ready" && scene != null;
  const sceneLoading = isVector && sceneStatus === "loading";
  // Legacy fallback (scene endpoint 404 / error)
  // DXF viewer only handles ASCII DXF — DWG binary will crash dxf-viewer
  const isDxf  = isVector && sceneStatus === "fallback" && activeDrawing.type === "dxf";
  const dxfUrl = isDxf ? proxyUrl : undefined;
  const isDwg  = isVector && sceneStatus === "fallback" && activeDrawing.type === "dwg";
  const isImage = isReady && activeDrawing.type === "image";

  const capabilities: DrawingTool[] = sceneActive
    ? ["pointer", "measure", "area", "scope", "layer", "ai"]
    : ["pointer", "ai"];

  return (
    <div className="relative flex h-full overflow-hidden">

      {/* Vertical toolbar */}
      <DrawingToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        capabilities={capabilities}
        vertical
      />

      {/* Main viewer */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* File info bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-950/80 text-xs shrink-0">
          <span className="text-zinc-300 font-medium truncate max-w-[200px]">{activeDrawing.name}</span>
          <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{activeDrawing.type}</span>
          {loadingObjects && <Spinner className="h-3 w-3 text-zinc-600" />}
          {objects.length > 0 && <span className="text-zinc-600">{objects.length} objects</span>}
          {scopeRect && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-800/60 text-blue-300 text-[10px]">
              🔲 Vùng bóc đã chọn
              <button
                onClick={() => handleScopeChange(null)}
                className="text-blue-400 hover:text-blue-200 underline underline-offset-2"
                title="Xoá vùng bóc — bóc toàn bộ bản vẽ"
              >
                Xoá
              </button>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {(() => {
              const readyCount = drawings.filter((d) => !d.parseStatus || d.parseStatus === "ready").length;
              const projPending = drawings.length - readyCount;
              const canProject = onProjectTakeoff && drawings.length >= 2;
              const compareDisabled = drawings.filter((d) => d.id !== activeDrawingId && (!d.parseStatus || d.parseStatus === "ready")).length === 0;
              const viewActive = reviewOpen || revisionOpen || inspectorOpen;
              return (
                <>
                  {/* ── PRIMARY: Bóc (1 nút chính + menu tùy chọn) ── */}
                  <div ref={takeoffMenuRef} className="relative flex items-center gap-0.5">
                    <button
                      onClick={handleFullTakeoff}
                      disabled={!isReady || fullTakeoffRunning || detecting || takeoffBusy}
                      title={scopeRect
                        ? "Bóc khối lượng các đối tượng trong vùng đã chọn"
                        : "Bóc khối lượng toàn bộ bản vẽ"}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-l bg-accent-600 hover:bg-accent-500 text-white disabled:opacity-50 text-[11px] font-medium transition-colors"
                    >
                      {fullTakeoffRunning || takeoffBusy ? <Spinner className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                      <span>{takeoffBusy ? "Đang bóc…" : scopeRect ? "Bóc trong vùng" : "Bóc toàn bộ"}</span>
                    </button>
                    <button
                      onClick={() => setTakeoffMenuOpen((v) => !v)}
                      title="Tùy chọn bóc"
                      className="flex items-center px-1 py-1 rounded-r bg-accent-600 hover:bg-accent-500 text-white transition-colors"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {takeoffMenuOpen && (
                      <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl text-[12px]">
                        <button
                          onClick={() => { setTakeoffMenuOpen(false); handleDetect(); }}
                          disabled={detecting}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-zinc-400" /> Chỉ nhận diện (Detect)
                        </button>
                        {canProject && (
                          <button
                            onClick={() => { setTakeoffMenuOpen(false); onProjectTakeoff!(); }}
                            disabled={projPending > 0 || fullTakeoffRunning || detecting || takeoffBusy}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                          >
                            <Zap className="h-3.5 w-3.5 text-accent-400" />
                            {projPending > 0 ? `Bóc dự án (đợi ${projPending})` : "Bóc toàn bộ dự án"}
                          </button>
                        )}
                        {onEngineTakeoff && (
                          <button
                            onClick={() => { setTakeoffMenuOpen(false); setAssumpOpen(true); }}
                            disabled={!isReady}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                          >
                            <Settings2 className="h-3.5 w-3.5 text-zinc-400" /> Giả định bóc (cao tầng, tường…)
                          </button>
                        )}
                        <div className="my-1 border-t border-zinc-800" />
                        <button
                          onClick={() => { setTakeoffMenuOpen(false); setRightPanel("rebar"); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
                        >
                          <Zap className="h-3.5 w-3.5 text-amber-400" /> Bóc thép (bản KC)
                        </button>
                      </div>
                    )}
                    {assumpOpen && activeDrawingId && (
                      <TakeoffAssumptionsPopover
                        drawingId={activeDrawingId}
                        onRun={(a) => { setAssumpOpen(false); void runEngineTakeoff(a); }}
                        onClose={() => setAssumpOpen(false)}
                      />
                    )}
                  </div>

                  {/* ── Xem (gom Duyệt / So sánh / Inspector) ── */}
                  <div ref={viewMenuRef} className="relative">
                    <button
                      onClick={() => setViewMenuOpen((v) => !v)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
                        viewActive ? "bg-blue-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      }`}
                    >
                      Xem
                      {pendingReviewCount > 0 && (
                        <span className="rounded-full bg-amber-500/80 px-1 text-[9px] font-semibold text-black">{pendingReviewCount}</span>
                      )}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {viewMenuOpen && (
                      <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl text-[12px]">
                        <button
                          onClick={() => { setViewMenuOpen(false); setReviewOpen((v) => !v); }}
                          disabled={objects.length === 0}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          <span>Duyệt đối tượng</span>
                          {pendingReviewCount > 0 && <span className="text-amber-400">{pendingReviewCount} chưa xem</span>}
                        </button>
                        <button
                          onClick={() => { setViewMenuOpen(false); setRevisionOpen((v) => !v); }}
                          disabled={compareDisabled}
                          className="flex w-full items-center px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          So sánh bản vẽ
                        </button>
                        <button
                          onClick={() => { setViewMenuOpen(false); setInspectorOpen(!inspectorOpen); }}
                          className="flex w-full items-center px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
                        >
                          Inspector đối tượng
                        </button>
                        <div className="my-1 border-t border-zinc-800" />
                        <button
                          onClick={() => { setViewMenuOpen(false); setRightPanel("building"); }}
                          className="flex w-full items-center px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
                        >
                          Công trình (tầng · MEP · rà soát)
                        </button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isPdf && (
            <PdfViewer
              url={proxyUrl}
              activeTool={activeTool}
              objectHighlights={objects}
              onObjectSelect={handleObjectSelect}
              onViewportChange={(info) => setViewport(info)}
            />
          )}
          {sceneActive && (
            <DrawingCanvas
              scene={scene!}
              objects={objects}
              selectedObjectId={selectedObject?.id}
              activeTool={activeTool}
              calibration={calibration}
              onCalibrated={handleCalibrated}
              onObjectClick={handleObjectSelect}
              layerPanelOpen={layerPanelOpen}
              onLayerPanelClose={() => setLayerPanelOpen(false)}
              focusObjectId={focusObjectId}
              reviewStates={reviewStates}
              calibrationPromptKey={calibrationPromptKey}
              fitSignal={fitSignal}
              scopeRect={scopeRect}
              onScopeChange={handleScopeChange}
            />
          )}
          {sceneLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
              <Spinner className="h-6 w-6" />
              <p className="text-sm">Đang tải bản vẽ vector...</p>
            </div>
          )}
          {isDxf && (
            <DxfViewer
              url={dxfUrl!}
              highlightObjectIds={objects.map((o) => o.id)}
            />
          )}
          {isDwg && (
            <DwgCanvasViewer
              objects={objects}
              selectedObjectId={selectedObject?.id}
              onObjectClick={handleObjectSelect}
            />
          )}
          {isProcessing && (
            <DrawingProcessingState drawing={activeDrawing} onRetry={handleRetryParse} retrying={retrying} />
          )}
          {isImage && (
            <div className="flex items-center justify-center h-full bg-zinc-900/50 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyUrl} alt={activeDrawing.name} className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
      </div>

      {/* Review Queue panel */}
      {reviewOpen && (
        <div className="w-64 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
          <ReviewQueue
            objects={objects}
            calibration={calibration}
            states={reviewStates}
            onStateChange={handleReviewStateChange}
            onSelect={(obj) => {
              setSelectedObject(obj);
              setFocusObjectId(obj.id);
              onObjectSelect?.(obj);
            }}
            onInspect={(obj) => {
              setSelectedObject(obj);
              setFocusObjectId(obj.id);
              setInspectorOpen(true);
            }}
            onClose={() => setReviewOpen(false)}
            layerRules={layerRules}
            onApplyLayerRules={handleApplyLayerRules}
            onAiResolve={handleAiResolve}
          />
        </div>
      )}

      {/* Revision compare panel */}
      {revisionOpen && activeDrawing && (
        <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
          <RevisionPanel
            estimateId={estimateId}
            drawings={drawings}
            activeDrawingId={activeDrawing.id}
            calibration={calibration}
            onClose={() => setRevisionOpen(false)}
            onFocusObject={(objectId, drawingId) => {
              // Only objects on the currently open drawing can be focused;
              // "removed" items live on the old drawing — skip those.
              if (drawingId !== activeDrawing.id) return;
              const obj = objects.find((o) => o.id === objectId);
              if (obj) {
                setSelectedObject(obj);
                setFocusObjectId(obj.id);
                onObjectSelect?.(obj);
              }
            }}
            onAskAI={onAskAI}
          />
        </div>
      )}

      {/* Object Inspector panel */}
      {inspectorOpen && (
        <div className="w-56 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
          <ObjectInspector
            object={selectedObject}
            onClose={() => setInspectorOpen(false)}
            onGenerateTakeoff={handleGenerateTakeoff}
            takeoffBusy={takeoffBusy}
            onJumpToBoq={onJumpToBoq}
            onCorrectType={handleCorrectType}
            onReviewFindings={() => { setBuildingInitialTab("review"); setRightPanel("building"); }}
          />
        </div>
      )}

      {/* Rebar panel (bóc thép) */}
      {rightPanel === "rebar" && activeDrawingId && (
        <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900">
          <RebarPanel
            estimateId={estimateId}
            drawingId={activeDrawingId}
            onAddToBoq={onAddToBoq}
            onClose={() => setRightPanel("none")}
          />
        </div>
      )}

      {/* Building panel (tầng · MEP · rà soát) */}
      {rightPanel === "building" && activeDrawingId && (
        <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900">
          <BuildingPanel
            estimateId={estimateId}
            drawingId={activeDrawingId}
            location={location}
            initialTab={buildingInitialTab}
            onAddToBoq={onAddToBoq}
            onClose={() => setRightPanel("none")}
          />
        </div>
      )}
    </div>
  );
}
