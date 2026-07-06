"use client";

import { useEffect, useRef, useState } from "react";
import type { Drawing, Estimate, Sheet } from "@/lib/types";
import {
  FileText, Ruler, Brain,
  Pencil, Trash2, Image, ChevronRight, ChevronDown, Plus, Check,
  PanelLeftClose, PanelLeftOpen, RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import { addJob, updateJob } from "@/components/ui/JobCenter";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Button";
import { isParsing } from "@/lib/drawing/parseProgress";

const ACCEPTED_DRAWINGS = ".pdf,.dxf,.dwg,.jpg,.jpeg,.png";

// Bộ môn bản vẽ — mirror của genspec-api/src/drawing/discipline.ts
const DISCIPLINES: { code: string; label: string }[] = [
  { code: "KT", label: "Kiến trúc" },
  { code: "KC", label: "Kết cấu" },
  { code: "DIEN", label: "Điện" },
  { code: "NUOC", label: "Nước" },
  { code: "KHAC", label: "Khác" },
];
const DISCIPLINE_LABEL: Record<string, string> = Object.fromEntries(
  DISCIPLINES.map((d) => [d.code, d.label])
);
function normDiscipline(d?: string): string {
  return d && DISCIPLINE_LABEL[d] ? d : "KHAC";
}

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
  /** Đồng bộ danh sách drawings lên page (append khi upload, đổi bộ môn). */
  onDrawingsChange?: (drawings: Drawing[]) => void;
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
  onDrawingsChange,
  collapsed = false,
  onToggleCollapse,
}: ExplorerPanelProps) {
  const toast = useToast();
  const drawingInputRef = useRef<HTMLInputElement>(null);
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

  // Upload nhiều bản vẽ từ Explorer — mỗi file 1 job, append vào list khi xong.
  // Bản vẽ về ở trạng thái pending; DrawingWorkspace tự poll status khi được chọn.
  async function uploadOne(file: File): Promise<Drawing | null> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const job = addJob({
      id: crypto.randomUUID(),
      type: ext === "dwg" ? "dwg_convert" : ext === "pdf" ? "pdf_parse" : "dxf_parse",
      status: "processing",
      progress: 5,
      message: `Đang tải ${file.name}`,
      estimateId: estimate.id,
    });
    try {
      const drawing = await api.uploadDrawing(estimate.id, file);
      updateJob(job.id, { status: "done", progress: 100, message: `${file.name} đã tải lên` });
      return drawing;
    } catch (e) {
      updateJob(job.id, { status: "failed", message: (e as ApiError).message });
      toast.error("Upload thất bại", file.name);
      return null;
    }
  }

  async function handleAddDrawings(files: File[]) {
    if (files.length === 0) return;
    if (files.length > 1) toast.info(`Đang xử lý ${files.length} bản vẽ`);
    let acc = drawings;
    let lastId: string | undefined;
    for (const file of files) {
      const drawing = await uploadOne(file);
      if (drawing) {
        acc = [...acc, drawing];
        lastId = drawing.id;
        onDrawingsChange?.(acc);
      }
    }
    // Tự chọn bản vẽ mới nhất để user thấy ngay tiến trình xử lý.
    if (lastId) onDrawingSelect(lastId);
  }

  // Bóc lại bản vẽ bị kẹt/lỗi parse (nút "Thử lại" inline).
  function reparseDrawing(drawingId: string) {
    onDrawingsChange?.(
      drawings.map((d) => (d.id === drawingId ? { ...d, parseStatus: "parsing", parseError: undefined } : d))
    );
    api.reparseDrawing(estimate.id, drawingId)
      .then((updated) => onDrawingsChange?.(drawings.map((d) => (d.id === drawingId ? { ...d, ...updated } : d))))
      .catch(() => toast.error("Không thử lại được"));
  }

  function setDrawingDiscipline(drawingId: string, discipline: string) {
    // Optimistic — cập nhật local ngay, rollback nếu server lỗi.
    const prev = drawings;
    onDrawingsChange?.(drawings.map((d) => (d.id === drawingId ? { ...d, discipline } : d)));
    api.setDrawingDiscipline(estimate.id, drawingId, discipline).catch(() => {
      onDrawingsChange?.(prev);
      toast.error("Không đổi được bộ môn");
    });
  }

  // Nhóm drawings theo bộ môn, giữ thứ tự DISCIPLINES, chỉ nhóm có bản vẽ.
  const drawingGroups = DISCIPLINES
    .map((d) => ({
      ...d,
      items: drawings.filter((dr) => normDiscipline(dr.discipline) === d.code),
    }))
    .filter((g) => g.items.length > 0);

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
      <input
        ref={drawingInputRef}
        type="file"
        accept={ACCEPTED_DRAWINGS}
        multiple
        className="hidden"
        onChange={(e) => {
          handleAddDrawings(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
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
                      {/* Ghost row — thêm bản vẽ (upload nhiều file) */}
                      <button
                        onClick={() => drawingInputRef.current?.click()}
                        className="flex h-7 w-full items-center gap-1.5 rounded px-2 text-left text-[13px] text-zinc-600 transition-colors hover:bg-zinc-800/40 hover:text-zinc-300"
                      >
                        <Plus className="h-3 w-3 shrink-0" />
                        <span>Thêm bản vẽ</span>
                      </button>

                      {drawings.length === 0 && (
                        <div className="flex h-7 items-center px-2 text-xs text-zinc-600">
                          Chưa có bản vẽ
                        </div>
                      )}

                      {drawingGroups.map((group) => (
                        <div key={group.code} className="mt-1 first:mt-0">
                          {/* Sub-header bộ môn */}
                          <div className="flex h-5 items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                            <span className="truncate">{group.label}</span>
                            <span className="font-mono font-normal normal-case text-zinc-700">
                              {group.items.length}
                            </span>
                          </div>
                          {group.items.map((drawing) => (
                            <DrawingItem
                              key={drawing.id}
                              drawing={drawing}
                              active={viewMode === "drawing" && activeDrawingId === drawing.id}
                              onSelect={() => { onDrawingSelect(drawing.id); onViewModeChange("drawing"); }}
                              onSetDiscipline={(code) => setDrawingDiscipline(drawing.id, code)}
                              onReparse={() => reparseDrawing(drawing.id)}
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
                        </div>
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

/** Chấm trạng thái parse: vàng+spinner=đang xử lý, xanh=ready, đỏ=failed. */
function StatusDot({ status }: { status?: string }) {
  if (isParsing(status)) {
    return (
      <span className="shrink-0" title="Đang xử lý">
        <Spinner className="h-2.5 w-2.5 text-amber-400" />
      </span>
    );
  }
  if (status === "failed") {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" title="Xử lý thất bại" />;
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Sẵn sàng" />;
}

function DrawingItem({
  drawing,
  active,
  onSelect,
  onSetDiscipline,
  onDelete,
  onReparse,
}: {
  drawing: Drawing;
  active: boolean;
  onSelect: () => void;
  onSetDiscipline: (code: string) => void;
  onDelete?: () => void;
  onReparse?: () => void;
}) {
  const Icon = DRAWING_TYPE_ICON[drawing.type] ?? FileText;
  const [menuOpen, setMenuOpen] = useState(false);
  const current = normDiscipline(drawing.discipline);
  const isFailed = drawing.parseStatus === "failed";

  // Đóng menu khi click ra ngoài
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

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

      <StatusDot status={drawing.parseStatus} />

      {/* Badge bộ môn + dropdown đổi bộ môn */}
      <div className="relative shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="flex items-center gap-0.5 rounded bg-zinc-800/70 px-1 py-px font-mono text-[9px] uppercase text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
          title={`Bộ môn: ${DISCIPLINE_LABEL[current]}`}
          aria-label="Đổi bộ môn"
        >
          {current}
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-0.5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {DISCIPLINES.map((d) => (
              <button
                key={d.code}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSetDiscipline(d.code); }}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                <span className="w-3 shrink-0">
                  {d.code === current && <Check className="h-3 w-3 text-accent-400" />}
                </span>
                <span className="truncate">{d.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {isFailed && onReparse && (
          <button
            onClick={(e) => { e.stopPropagation(); onReparse(); }}
            className="rounded p-1 text-zinc-500 transition-colors hover:text-accent-400"
            aria-label="Thử lại"
            title="Thử lại xử lý bản vẽ"
          >
            <RotateCw className="h-3 w-3" />
          </button>
        )}
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
