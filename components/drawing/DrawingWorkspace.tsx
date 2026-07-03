"use client";

import { useEffect, useRef, useState } from "react";
import type { Drawing, DrawingObject } from "@/lib/types";
import { api, API_URL } from "@/lib/api";
import { PdfViewer } from "./PdfViewer";
import { DxfViewer } from "./DxfViewer";
import { DwgCanvasViewer } from "./DwgCanvasViewer";
import { DrawingUpload } from "./DrawingUpload";
import { ObjectInspector } from "./ObjectInspector";
import { DrawingToolbar, type DrawingTool } from "./DrawingToolbar";
import { Spinner } from "@/components/ui/Button";
import { addJob, updateJob } from "@/components/ui/JobCenter";
import { AlertTriangle, Ruler, Sparkles } from "lucide-react";

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
}: DrawingWorkspaceProps) {
  const [objects, setObjects] = useState<DrawingObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<DrawingObject | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingTool>("pointer");
  const [viewport, setViewport] = useState({ page: 1, scale: 1.2, scrollX: 0, scrollY: 0 });
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

  async function handleDetect() {
    if (!activeDrawingId) return;
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
    } catch {
      updateJob(job.id, { status: "failed", message: "Phân tích thất bại" });
    } finally {
      setDetecting(false);
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
    setActiveTool(tool);
    if (tool === "ai") handleDetect();
  }

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

  // Always serve files through API proxy — Cloudinary raw URLs return 401 (CDN ACL)
  const proxyUrl = `${API_URL}/estimates/${estimateId}/drawings/${activeDrawing.id}/file`;

  const isPdf  = isReady && activeDrawing.type === "pdf";
  // DXF viewer only handles ASCII DXF — DWG binary will crash dxf-viewer
  const isDxf  = isReady && activeDrawing.type === "dxf";
  const dxfUrl = isDxf ? proxyUrl : undefined;
  const isDwg  = isReady && activeDrawing.type === "dwg";
  const isImage = isReady && activeDrawing.type === "image";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Vertical toolbar */}
      <DrawingToolbar activeTool={activeTool} onToolChange={handleToolChange} vertical />

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

      {/* Object Inspector panel */}
      {inspectorOpen && (
        <div className="w-56 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
          <ObjectInspector
            object={selectedObject}
            onClose={() => setInspectorOpen(false)}
            onGenerateTakeoff={handleGenerateTakeoff}
          />
        </div>
      )}
    </div>
  );
}
