"use client";

import { useEffect, useState } from "react";
import type { Drawing, DrawingObject } from "@/lib/types";
import { api } from "@/lib/api";
import { PdfViewer } from "./PdfViewer";
import { DxfViewer } from "./DxfViewer";
import { DrawingUpload } from "./DrawingUpload";
import { ObjectInspector } from "./ObjectInspector";
import { DrawingToolbar, type DrawingTool } from "./DrawingToolbar";
import { Spinner } from "@/components/ui/Button";
import { addJob, updateJob } from "@/components/ui/JobCenter";

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
}: DrawingWorkspaceProps) {
  const [objects, setObjects] = useState<DrawingObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<DrawingObject | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingTool>("pointer");
  const [viewport, setViewport] = useState({ page: 1, scale: 1.2, scrollX: 0, scrollY: 0 });

  const activeDrawing = drawings.find((d) => d.id === activeDrawingId);

  // Load objects when drawing changes
  useEffect(() => {
    if (!activeDrawingId) { setObjects([]); return; }
    setLoadingObjects(true);
    api.getDrawing(estimateId, activeDrawingId)
      .then((d) => setObjects(d.objects ?? []))
      .catch(() => setObjects([]))
      .finally(() => setLoadingObjects(false));
  }, [estimateId, activeDrawingId]);

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
      setObjects(res.objects);
      updateJob(job.id, { status: "done", progress: 100, message: `Tìm thấy ${res.objects.length} đối tượng` });
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
          <p className="text-4xl">📐</p>
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

  const isPdf = activeDrawing.type === "pdf";
  const isDxfOrDwg = activeDrawing.type === "dxf" || activeDrawing.type === "dwg";
  const isImage = activeDrawing.type === "image";

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
              {detecting ? <Spinner className="h-3 w-3" /> : "✨"}
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
              url={activeDrawing.url}
              activeTool={activeTool}
              objectHighlights={objects}
              onObjectSelect={handleObjectSelect}
              onViewportChange={(info) => setViewport(info)}
            />
          )}
          {isDxfOrDwg && (
            <DxfViewer
              url={activeDrawing.url}
              highlightObjectIds={objects.map((o) => o.id)}
            />
          )}
          {isImage && (
            <div className="flex items-center justify-center h-full bg-zinc-900/50 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeDrawing.url} alt={activeDrawing.name} className="max-h-full max-w-full object-contain" />
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
