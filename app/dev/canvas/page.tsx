"use client";

// Dev-only harness for eyeballing DrawingCanvas without a backend.
// npm run dev → http://localhost:3000/dev/canvas

import { useState } from "react";
import { notFound } from "next/navigation";
import { DrawingCanvas } from "@/components/drawing/DrawingCanvas";
import { DrawingToolbar, type DrawingTool } from "@/components/drawing/DrawingToolbar";
import { sampleScene, sampleObjects } from "@/components/drawing/__fixtures__/sample-scene";
import type { DrawingCalibration, DrawingObject } from "@/lib/types";

export default function DevCanvasPage() {
  const [activeTool, setActiveTool] = useState<DrawingTool>("pointer");
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [selected, setSelected] = useState<DrawingObject | null>(null);
  const [calibration, setCalibration] = useState<DrawingCalibration | null>(null);

  if (process.env.NODE_ENV === "production") notFound();

  function handleToolChange(tool: DrawingTool) {
    if (tool === "layer") { setLayerPanelOpen((v) => !v); return; }
    setActiveTool(tool);
  }

  return (
    <div className="flex h-screen bg-zinc-950">
      <DrawingToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        capabilities={["pointer", "measure", "area", "layer"]}
        vertical
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-3 py-1.5 border-b border-zinc-800 text-xs text-zinc-400 flex items-center gap-3">
          <span className="font-medium text-zinc-200">DrawingCanvas dev fixture</span>
          <span>{sampleScene.entities.length} entities</span>
          {selected && <span className="text-blue-400">selected: {selected.type} ({selected.id})</span>}
          {calibration && (
            <span className="text-emerald-400">
              cal: {calibration.unitsPerDrawingUnit.toExponential(3)} {calibration.unitLabel}/đv
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <DrawingCanvas
            scene={sampleScene}
            objects={sampleObjects}
            selectedObjectId={selected?.id}
            activeTool={activeTool}
            calibration={calibration}
            onCalibrated={setCalibration}
            onObjectClick={setSelected}
            layerPanelOpen={layerPanelOpen}
            onLayerPanelClose={() => setLayerPanelOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
