"use client";

import { useEffect, useState } from "react";
import type { Drawing, Estimate, Sheet } from "@/lib/types";
import {
  FileText, Ruler, Brain,
  Pencil, Trash2, Image, ChevronRight, Plus,
  PanelLeftClose, PanelLeftOpen,
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
  /** Thu Explorer thành thanh mảnh — bật khi ⚡ bóc để tập trung workbook+drawing+chat. */
  collapsed?: boolean;
  onToggleCollapse?: (next: boolean) => void;
}

type NavIcon = React.ComponentType<{ className?: string }>;

const NAV_ITEMS: { id: WorkspaceView; label: string; Icon: NavIcon }[] = [
  { id: "workbook",  label: "Workbook",    Icon: FileText },
  { id: "drawing",   label: "Drawings",    Icon: Ruler    },
  { id: "insights",  label: "AI Insights", Icon: Brain    },
];

const EXPANDABLE_SECTIONS = new Set<WorkspaceView>(["workbook", "drawing"]);

/* Shared row skin — VS Code-style compact tree row */
const rowBase =
  "group relative flex h-7 w-full cursor-pointer select-none items-center gap-1.5 rounded px-2 text-[13px] transition-colors";
const rowIdle = "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200";
const rowActive = "bg-accent-500/10 font-medium text-zinc-100";

/* 2px accent bar on the left edge of an active row */
function ActiveBar() {
  return (
    <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent-600 dark:bg-accent-400" />
  );
}

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
  collapsed = false,
  onToggleCollapse,
}: ExplorerPanelProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [openSections, setOpenSections] = useState<Set<WorkspaceView>>(
    () => new Set<WorkspaceView>(["workbook", "drawing"])
  );
  const sheetsList = estimate.sheets ?? [];

  // Auto-open section when navigating to it
  useEffect(() => {
    if (EXPANDABLE_SECTIONS.has(viewMode)) {
      setOpenSections((prev) => new Set([...prev, viewMode]));
    }
  }, [viewMode]);

  function toggleSection(id: WorkspaceView, e: React.MouseEvent) {
    e.stopPropagation();
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function commitRename(id: string) {
    if (renameText.trim()) onRenameSheet(id, renameText.trim());
    setRenamingId(null);
    setRenameText("");
  }

  // Thu gọn thành thanh mảnh: chỉ icon nav + nút mở lại — nhường chỗ cho
  // workbook/drawing/chat khi đang bóc.
  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-900/30 py-2 min-h-0">
        <button
          onClick={() => onToggleCollapse?.(false)}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Mở Explorer"
          aria-label="Mở Explorer"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <div className="my-1 h-px w-5 bg-zinc-800" />
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => { onViewModeChange(item.id); onToggleCollapse?.(false); }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              viewMode === item.id
                ? "bg-accent-500/10 text-accent-400"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
            )}
            title={item.label}
          >
            <item.Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/30 min-h-0">
      {/* Header — workspace name, one truncated line */}
      <div className="flex items-start justify-between border-b border-zinc-800/70 px-3 pb-2 pt-2.5">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">
            Explorer
          </div>
          <div
            className="mt-0.5 truncate text-[13px] font-semibold text-zinc-100"
            title={estimate.name}
          >
            {estimate.name}
          </div>
        </div>
        {onToggleCollapse && (
          <button
            onClick={() => onToggleCollapse(true)}
            className="ml-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            title="Thu gọn Explorer"
            aria-label="Thu gọn Explorer"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Nav sections */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const hasChildren = EXPANDABLE_SECTIONS.has(item.id);
          const isOpen = openSections.has(item.id);
          const isActive = viewMode === item.id;
          const count = item.id === "drawing" ? drawings.length
            : item.id === "workbook" ? sheetsList.length : 0;

          /* Leaf nav (AI Insights) — same row language as tree items */
          if (!hasChildren) {
            return (
              <div
                key={item.id}
                className={cn(rowBase, isActive ? rowActive : rowIdle)}
                onClick={() => onViewModeChange(item.id)}
              >
                {isActive && <ActiveBar />}
                <item.Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "text-accent-600 dark:text-accent-400" : "text-zinc-500",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </div>
            );
          }

          return (
            <div key={item.id}>
              {/* Section header */}
              <div
                className={cn(
                  "group/section flex h-6 w-full cursor-pointer select-none items-center gap-1 rounded px-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                  isActive
                    ? "text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
                onClick={() => onViewModeChange(item.id)}
              >
                <button
                  onClick={(e) => toggleSection(item.id, e)}
                  className="rounded p-0.5 text-zinc-600 transition-colors hover:text-zinc-300"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 transition-transform duration-150",
                      isOpen && "rotate-90",
                    )}
                  />
                </button>
                <item.Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "text-accent-600 dark:text-accent-400" : "text-zinc-500",
                  )}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {count > 0 && (
                  <span className="rounded-full bg-zinc-800/80 px-1.5 py-px font-mono text-[10px] font-normal normal-case tracking-normal text-zinc-500">
                    {count}
                  </span>
                )}
              </div>

              {/* Children — indented, with 1px vertical guide */}
              {isOpen && (
                <div className="ml-[13px] mt-0.5 space-y-px border-l border-zinc-800/70 pl-1.5">
                  {item.id === "workbook" && (
                    <>
                      {sheetsList.map((sheet) => (
                        <SheetItem
                          key={sheet.id}
                          sheet={sheet}
                          active={viewMode === "workbook" && activeSheetId === sheet.id}
                          renaming={renamingId === sheet.id}
                          renameText={renameText}
                          onSelect={() => { onSheetSelect(sheet.id); onViewModeChange("workbook"); }}
                          onRenameStart={() => { setRenamingId(sheet.id); setRenameText(sheet.name); }}
                          onRenameChange={setRenameText}
                          onRenameCommit={() => commitRename(sheet.id)}
                          onRenameCancel={() => setRenamingId(null)}
                          onDelete={() => {
                            if (window.confirm(`Xóa sheet '${sheet.name}'? Dữ liệu trong sheet sẽ mất.`)) {
                              onDeleteSheet(sheet.id);
                            }
                          }}
                        />
                      ))}
                      {/* Ghost row — new sheet */}
                      <button
                        onClick={onAddSheet}
                        className="flex h-7 w-full items-center gap-1.5 rounded px-2 text-left text-[13px] text-zinc-600 transition-colors hover:bg-zinc-800/40 hover:text-zinc-300"
                      >
                        <Plus className="h-3 w-3 shrink-0" />
                        <span>New Sheet</span>
                      </button>
                    </>
                  )}

                  {item.id === "drawing" && (
                    <>
                      {drawings.length === 0 && (
                        <div className="flex h-7 items-center px-2 text-xs text-zinc-600">
                          Chưa có bản vẽ
                        </div>
                      )}
                      {drawings.map((drawing) => (
                        <DrawingItem
                          key={drawing.id}
                          drawing={drawing}
                          active={viewMode === "drawing" && activeDrawingId === drawing.id}
                          onSelect={() => { onDrawingSelect(drawing.id); onViewModeChange("drawing"); }}
                          onDelete={
                            onDeleteDrawing
                              ? () => {
                                  if (window.confirm(`Xóa bản vẽ '${drawing.name}'? Objects và scene sẽ mất.`)) {
                                    onDeleteDrawing(drawing.id);
                                  }
                                }
                              : undefined
                          }
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
  if (renaming) {
    return (
      <div className="flex h-7 items-center px-1">
        <input
          autoFocus
          value={renameText}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameCommit();
            if (e.key === "Escape") onRenameCancel();
          }}
          className="h-6 w-full rounded border border-accent-500 bg-zinc-950 px-1.5 text-[13px] text-zinc-100 outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(rowBase, active ? rowActive : rowIdle)}
      onClick={onSelect}
      title={sheet.name}
    >
      {active && <ActiveBar />}
      <FileText
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          active ? "text-accent-600 dark:text-accent-400" : "text-zinc-500",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{sheet.name}</span>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onRenameStart(); }}
          className="rounded p-1 text-zinc-500 transition-colors hover:text-zinc-200"
          aria-label="Rename sheet"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="rounded p-1 text-zinc-500 transition-colors hover:text-rose-400"
          aria-label="Delete sheet"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
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
      className={cn(rowBase, active ? rowActive : rowIdle)}
      onClick={onSelect}
      title={drawing.name}
    >
      {active && <ActiveBar />}
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          active ? "text-accent-600 dark:text-accent-400" : "text-zinc-500",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{drawing.name}</span>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="font-mono text-[9px] uppercase text-zinc-600">{drawing.type}</span>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-1 text-zinc-500 transition-colors hover:text-rose-400"
            aria-label="Delete drawing"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
