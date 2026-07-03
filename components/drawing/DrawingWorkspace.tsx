"use client";

import { useEffect, useRef, useState } from "react";
import type { Drawing, DrawingCalibration, DrawingFocusRequest, DrawingObject, DrawingScene } from "@/lib/types";
import { api, API_URL } from "@/lib/api";
import { PdfViewer } from "./PdfViewer";
import { DxfViewer } from "./DxfViewer";
import { DwgCanvasViewer } from "./DwgCanvasViewer";
import { DrawingCanvas } from "./DrawingCanvas";
import { DrawingUpload } from "./DrawingUpload";
import { ObjectInspector } from "./ObjectInspector";
import { ReviewQueue, type ReviewStates, type ReviewStatus } from "./ReviewQueue";
import { RevisionPanel } from "./RevisionPanel";
import { DrawingToolbar, type DrawingTool } from "./DrawingToolbar";
import { Spinner } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { addJob, updateJob } from "@/components/ui/JobCenter";
import { buildFullTakeoffAction } from "@/lib/actions/AgentActions";
import { summarizeObjects } from "@/lib/drawing/objectMeasure";
import { AlertTriangle, Ruler, Sparkles, Zap } from "lucide-react";

const PARSE_STATUS_LABELS: Record<string, string> = {
  queued:     "Đang xếp hàng xử lý...",
  converting: "Đang chuyển đổi DWG → DXF...",
  parsing:    "Đang đọc bản vẽ...",
  detecting:  "Đang phân tích đối tượng...",
  indexing:   "Đang tạo search index...",
  graph:      "Đang xây dựng relationship graph...",
  failed:     "Xử lý thất bại",
};

function DrawingProcessingState({ drawing }: { drawing: Drawing }) {
  const status = drawing.parseStatus ?? "queued";
  const isFailed = status === "failed";
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
      {isFailed ? (
        <>
          <AlertTriangle className="h-6 w-6 text-amber-400" />
          <p className="text-sm text-rose-400">Xử lý thất bại</p>
          {drawing.parseError && (
            <p className="text-xs text-zinc-600 max-w-xs text-center">{drawing.parseError}</p>
          )}
        </>
      ) : (
        <>
          <Spinner className="h-6 w-6" />
          <p className="text-sm">{PARSE_STATUS_LABELS[status] ?? "Đang xử lý..."}</p>
          <p className="text-xs text-zinc-600">Trang sẽ tự refresh khi xong</p>
        </>
      )}
    </div>
  );
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
  // "⚡ Bóc toàn bộ": workspace builds the structured prompt, page sends it
  onFullTakeoff?: (prompt: string) => void;
  // Traceability: drawing → BOQ jump requested from the Object Inspector
  onJumpToBoq?: (obj: DrawingObject) => void;
  // Traceability: BOQ → drawing focus request (token parsed from workbook row)
  externalFocus?: DrawingFocusRequest | null;
  // Revision compare: forward the delta summary to the copilot
  onAskAI?: (summaryText: string) => void;
}

export function DrawingWorkspace({
  estimateId,
  activeDrawingId,
  onDrawingSelect,
  onObjectSelect,
  onGenerateTakeoff,
  drawings,
  onDrawingsChange,
  onViewportChange,
  onObjectsLoaded,
  onFullTakeoff,
  onJumpToBoq,
  externalFocus,
  onAskAI,
}: DrawingWorkspaceProps) {
  const toast = useToast();
  const [objects, setObjects] = useState<DrawingObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<DrawingObject | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingTool>("pointer");
  const [viewport, setViewport] = useState({ page: 1, scale: 1.2, scrollX: 0, scrollY: 0 });
  // Unified vector scene (M1) — null while loading / after 404 fallback
  const [scene, setScene] = useState<DrawingScene | null>(null);
  const [sceneStatus, setSceneStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [calibration, setCalibration] = useState<DrawingCalibration | null>(null);
  // Review Queue: per-object approve/reject persisted per drawing
  const [reviewStates, setReviewStates] = useState<ReviewStates>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [focusObjectId, setFocusObjectId] = useState<string | undefined>(undefined);
  // Full takeoff flow
  const [fullTakeoffRunning, setFullTakeoffRunning] = useState(false);
  const [calibrationPromptKey, setCalibrationPromptKey] = useState(0);
  // Track drawings already announced to avoid duplicate notifications
  const announcedDrawings = useRef<Set<string>>(new Set());

  const activeDrawing = drawings.find((d) => d.id === activeDrawingId);

  // Poll drawing status when not ready
  useEffect(() => {
    if (!activeDrawing?.id || activeDrawing.parseStatus === "ready" || activeDrawing.parseStatus === "failed") return;
    const interval = setInterval(async () => {
      try {
        const updated = await api.getDrawing(estimateId, activeDrawing.id);
        if (updated.parseStatus !== activeDrawing.parseStatus) {
          onDrawingsChange?.(drawings.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [estimateId, activeDrawing?.id, activeDrawing?.parseStatus]);

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

  // Per-drawing calibration persisted in localStorage
  useEffect(() => {
    if (!activeDrawingId) return;
    try {
      const raw = localStorage.getItem(`genspec_drawing_cal_${activeDrawingId}`);
      setCalibration(raw ? (JSON.parse(raw) as DrawingCalibration) : null);
    } catch {
      setCalibration(null);
    }
  }, [activeDrawingId]);

  // Per-drawing review states persisted in localStorage
  useEffect(() => {
    setReviewOpen(false);
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

  // "⚡ Bóc toàn bộ": detect if needed → calibration gate → measure → prompt
  async function handleFullTakeoff() {
    if (!activeDrawingId || fullTakeoffRunning || detecting) return;
    setFullTakeoffRunning(true);
    try {
      // a. Ensure objects — run detection when nothing has been detected yet
      let objs = objects;
      if (objs.length === 0) objs = await handleDetect();
      if (objs.length === 0) return;

      // b. Calibration gate — warn once, allow proceeding in drawing units
      if (!calibration) {
        const proceed = window.confirm(
          "Bản vẽ chưa hiệu chỉnh tỉ lệ — số liệu bóc sẽ theo ĐƠN VỊ BẢN VẼ, không phải mét.\n\n" +
          "OK: tiếp tục (bỏ qua)\nCancel: hiệu chỉnh trước (click 2 điểm trên đoạn đã biết kích thước)"
        );
        if (!proceed) {
          setCalibrationPromptKey((k) => k + 1); // re-open CalibrationBar in canvas
          return;
        }
      }

      // c. Only objects not rejected in the Review Queue count
      const included = objs.filter((o) => reviewStates[o.id] !== "rejected");
      if (included.length === 0) return;
      const summary = summarizeObjects(included, calibration);

      // d + e. Structured prompt → page (ensures "Khối lượng" sheet + sends)
      onFullTakeoff?.(buildFullTakeoffAction(included, activeDrawingId, calibration, summary));
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
    ? ["pointer", "measure", "area", "layer", "search", "ai"]
    : ["pointer", "search", "ai"];

  return (
    <div className="flex h-full overflow-hidden">
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
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50 text-[11px] transition-colors"
            >
              {detecting ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              <span>Detect</span>
            </button>
            <button
              onClick={handleFullTakeoff}
              disabled={!isReady || fullTakeoffRunning || detecting}
              title="Bóc khối lượng toàn bộ bản vẽ vào sheet 'Khối lượng'"
              className="flex items-center gap-1 px-2 py-1 rounded bg-accent-600 hover:bg-accent-500 text-white disabled:opacity-50 text-[11px] transition-colors"
            >
              {fullTakeoffRunning ? <Spinner className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
              <span>Bóc toàn bộ</span>
            </button>
            <button
              onClick={() => setReviewOpen((v) => !v)}
              disabled={objects.length === 0}
              className={`px-2 py-1 rounded text-[11px] transition-colors disabled:opacity-50 ${
                reviewOpen ? "bg-blue-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              Duyệt{pendingReviewCount > 0 ? ` (${pendingReviewCount} chưa xem)` : ""}
            </button>
            <button
              onClick={() => setRevisionOpen((v) => !v)}
              disabled={drawings.filter((d) => d.id !== activeDrawingId && (!d.parseStatus || d.parseStatus === "ready")).length === 0}
              title="So sánh với bản vẽ khác — định lượng thay đổi"
              className={`px-2 py-1 rounded text-[11px] transition-colors disabled:opacity-50 ${
                revisionOpen ? "bg-blue-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              So sánh
            </button>
            <button
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className={`px-2 py-1 rounded text-[11px] transition-colors ${
                inspectorOpen ? "bg-blue-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              Inspector
            </button>
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
            <DrawingProcessingState drawing={activeDrawing} />
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
            onJumpToBoq={onJumpToBoq}
          />
        </div>
      )}
    </div>
  );
}
