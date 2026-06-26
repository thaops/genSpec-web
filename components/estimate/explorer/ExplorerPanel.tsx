"use client";

import { useState } from "react";
import type { Drawing, Estimate, Sheet } from "@/lib/types";

export type WorkspaceView = "workbook" | "insights" | "drawing" | "specs" | "report" | "history";

interface ExplorerPanelProps {
  estimate: Estimate;
  viewMode: WorkspaceView;
  onViewModeChange: (mode: WorkspaceView) => void;
  activeSheetId: string;
  onSheetSelect: (id: string) => void;
  onAddSheet: () => void;
  onDeleteSheet: (id: string) => void;
  onRenameSheet: (id: string, name: string) => void;
  drawings: Drawing[];
  activeDrawingId?: string;
  onDrawingSelect: (id: string) => void;
  onDeleteDrawing?: (id: string) => void;
}

const NAV_ITEMS: { id: WorkspaceView; label: string; icon: string }[] = [
  { id: "workbook", label: "Workbook", icon: "📄" },
  { id: "drawing", label: "Drawings", icon: "📐" },
  { id: "specs", label: "Specifications", icon: "📋" },
  { id: "report", label: "Reports", icon: "📊" },
  { id: "insights", label: "AI Insights", icon: "🧠" },
  { id: "history", label: "History", icon: "🕐" },
];

export function ExplorerPanel({
  estimate,
  viewMode,
  onViewModeChange,
  activeSheetId,
  onSheetSelect,
  onAddSheet,
  onDeleteSheet,
  onRenameSheet,
  drawings,
  activeDrawingId,
  onDrawingSelect,
  onDeleteDrawing,
}: ExplorerPanelProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const sheetsList = estimate.sheets ?? [];

  function commitRename(id: string) {
    if (renameText.trim()) onRenameSheet(id, renameText.trim());
    setRenamingId(null);
    setRenameText("");
  }

  return (
    <div className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-900/30 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Explorer
        </span>
        <span className="text-[10px] text-zinc-600 truncate max-w-[100px]">{estimate.name}</span>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {NAV_ITEMS.map((item) => (
          <div key={item.id}>
            {/* Section header */}
            <button
              onClick={() => onViewModeChange(item.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === item.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "drawing" && drawings.length > 0 && (
                <span className="ml-auto text-[10px] text-zinc-600 font-mono">
                  {drawings.length}
                </span>
              )}
              {item.id === "workbook" && sheetsList.length > 0 && (
                <span className="ml-auto text-[10px] text-zinc-600 font-mono">
                  {sheetsList.length}
                </span>
              )}
            </button>

            {/* Workbook sub-items */}
            {item.id === "workbook" && viewMode === "workbook" && (
              <div className="px-2 pb-2 space-y-0.5">
                {sheetsList.map((sheet) => (
                  <SheetItem
                    key={sheet.id}
                    sheet={sheet}
                    active={activeSheetId === sheet.id}
                    renaming={renamingId === sheet.id}
                    renameText={renameText}
                    onSelect={() => onSheetSelect(sheet.id)}
                    onRenameStart={() => { setRenamingId(sheet.id); setRenameText(sheet.name); }}
                    onRenameChange={setRenameText}
                    onRenameCommit={() => commitRename(sheet.id)}
                    onRenameCancel={() => setRenamingId(null)}
                    onDelete={() => onDeleteSheet(sheet.id)}
                  />
                ))}
                <button
                  onClick={onAddSheet}
                  className="w-full text-left px-2.5 py-1 text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/30 rounded-md transition-colors"
                >
                  + New Sheet
                </button>
              </div>
            )}

            {/* Drawings sub-items */}
            {item.id === "drawing" && viewMode === "drawing" && (
              <div className="px-2 pb-2 space-y-0.5">
                {drawings.length === 0 && (
                  <div className="px-2 py-2 text-xs text-zinc-600">
                    Chưa có bản vẽ
                  </div>
                )}
                {drawings.map((drawing) => (
                  <DrawingItem
                    key={drawing.id}
                    drawing={drawing}
                    active={activeDrawingId === drawing.id}
                    onSelect={() => onDrawingSelect(drawing.id)}
                    onDelete={() => onDeleteDrawing?.(drawing.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SheetItem({
  sheet,
  active,
  renaming,
  renameText,
  onSelect,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onDelete,
}: {
  sheet: Sheet;
  active: boolean;
  renaming: boolean;
  renameText: string;
  onSelect: () => void;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? "bg-zinc-800 text-zinc-100 font-medium"
          : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 cursor-pointer"
      }`}
      onClick={() => { if (!renaming) onSelect(); }}
    >
      {renaming ? (
        <input
          autoFocus
          value={renameText}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameCommit();
            if (e.key === "Escape") onRenameCancel();
          }}
          className="w-full bg-zinc-950 border border-accent-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="truncate flex items-center gap-1.5">
            <span>📄</span>
            <span className="truncate">{sheet.name}</span>
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onRenameStart(); }}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 px-1"
            >
              ✏️
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-[11px] text-zinc-500 hover:text-rose-400 px-1"
            >
              🗑️
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const DRAWING_TYPE_ICONS: Record<string, string> = {
  pdf: "📄",
  dxf: "📐",
  dwg: "📐",
  image: "🖼️",
};

function DrawingItem({
  drawing,
  active,
  onSelect,
  onDelete,
}: {
  drawing: Drawing;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const icon = DRAWING_TYPE_ICONS[drawing.type] ?? "📄";
  return (
    <div
      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
        active
          ? "bg-zinc-800 text-zinc-100 font-medium"
          : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
      }`}
      onClick={onSelect}
    >
      <span className="truncate flex items-center gap-1.5">
        <span>{icon}</span>
        <span className="truncate">{drawing.name}</span>
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] text-zinc-600 uppercase font-mono">{drawing.type}</span>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-[11px] text-zinc-500 hover:text-rose-400 px-1 ml-1"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}
