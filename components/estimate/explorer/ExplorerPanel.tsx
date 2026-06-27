"use client";

import { useState } from "react";
import type { Drawing, Estimate, Sheet } from "@/lib/types";
import {
  FileText, Ruler, ClipboardList, BarChart3, Brain, History,
  Pencil, Trash2, Image,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

type NavIcon = React.ComponentType<{ className?: string }>;

const NAV_ITEMS: { id: WorkspaceView; label: string; Icon: NavIcon }[] = [
  { id: "workbook",  label: "Workbook",       Icon: FileText      },
  { id: "drawing",   label: "Drawings",        Icon: Ruler         },
  { id: "specs",     label: "Specifications",  Icon: ClipboardList },
  { id: "report",    label: "Reports",         Icon: BarChart3     },
  { id: "insights",  label: "AI Insights",     Icon: Brain         },
  { id: "history",   label: "History",         Icon: History       },
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
    <div className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/30 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Explorer
        </span>
        <span className="max-w-[100px] truncate text-[10px] text-zinc-600">{estimate.name}</span>
      </div>

      {/* Nav sections */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <div key={item.id}>
            <button
              onClick={() => onViewModeChange(item.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                viewMode === item.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300",
              )}
            >
              <item.Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
              {item.id === "drawing" && drawings.length > 0 && (
                <span className="ml-auto font-mono text-[10px] text-zinc-600">
                  {drawings.length}
                </span>
              )}
              {item.id === "workbook" && sheetsList.length > 0 && (
                <span className="ml-auto font-mono text-[10px] text-zinc-600">
                  {sheetsList.length}
                </span>
              )}
            </button>

            {/* Workbook sub-items */}
            {item.id === "workbook" && viewMode === "workbook" && (
              <div className="space-y-0.5 px-2 pb-2">
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
                  className="w-full rounded-md px-2.5 py-1 text-left text-xs text-zinc-600 transition-colors hover:bg-zinc-800/30 hover:text-zinc-400"
                >
                  + New Sheet
                </button>
              </div>
            )}

            {/* Drawings sub-items */}
            {item.id === "drawing" && viewMode === "drawing" && (
              <div className="space-y-0.5 px-2 pb-2">
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
      className={cn(
        "group flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-zinc-800 font-medium text-zinc-100"
          : "cursor-pointer text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200",
      )}
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
          className="w-full rounded border border-accent-500 bg-zinc-950 px-1.5 py-0.5 text-xs text-zinc-100 outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="truncate">{sheet.name}</span>
          </span>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onRenameStart(); }}
              className="rounded p-1 text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded p-1 text-zinc-500 transition-colors hover:text-rose-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

type DrawingIconComp = React.ComponentType<{ className?: string }>;

const DRAWING_TYPE_ICON: Record<string, DrawingIconComp> = {
  pdf:   FileText,
  dxf:   Ruler,
  dwg:   Ruler,
  image: Image,
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
  const Icon = DRAWING_TYPE_ICON[drawing.type] ?? FileText;
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-zinc-800 font-medium text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200",
      )}
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="truncate">{drawing.name}</span>
      </span>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="font-mono text-[9px] uppercase text-zinc-600">{drawing.type}</span>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="ml-1 rounded p-0.5 text-zinc-500 transition-colors hover:text-rose-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
