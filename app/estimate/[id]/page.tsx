"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Action, AgentTaskState, AppliedActionsRecord, BoqTraceToken, Drawing, DrawingFocusRequest, DrawingObject, Estimate, ReviewFinding, Sheet } from "@/lib/types";
import { api, ApiError, exportTHDT, runTakeoffEngine, triggerDownload } from "@/lib/api";
import { addJob, updateJob } from "@/components/ui/JobCenter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { useT } from "@/lib/i18n/I18nProvider";
import { useToast } from "@/components/ui/Toast";
import { Button, Spinner } from "@/components/ui/Button";
import { EditorTopBar } from "@/components/estimate/EditorTopBar";
import {
  AgentConsole,
  readCopilotCollapsed,
} from "@/components/estimate/AgentConsole";
import type { AgentHandle } from "@/components/estimate/AgentConsole";
import WorkbookEditor, { type WorkbookDriver } from "@/components/estimate/WorkbookEditor";
import {
  CellExplainPopover,
  cellKeyOf,
  type AiCellEdit,
} from "@/components/estimate/CellExplainPopover";
import { InsightsDashboard } from "@/components/estimate/InsightsDashboard";
import { AgentTaskPill } from "@/components/estimate/AgentTaskPill";
import { takePendingPrompt } from "@/lib/pendingPrompt";
import { contextEngine } from "@/lib/context/ContextEngine";
import { buildGenerateTakeoffAction } from "@/lib/actions/AgentActions";
import { ExplorerPanel } from "@/components/estimate/explorer/ExplorerPanel";
import type { WorkspaceView } from "@/components/estimate/explorer/ExplorerPanel";
import { DrawingWorkspace } from "@/components/drawing/DrawingWorkspace";
import type { DrawingViewportInfo, EngineTakeoffPayload } from "@/components/drawing/DrawingWorkspace";
import { DEFAULT_TAKEOFF_ASSUMPTIONS, loadTakeoffAssumptions } from "@/components/drawing/TakeoffAssumptions";
import { SplitView } from "@/components/drawing/SplitView";
import { PARSE_POLL_MS, isParsing } from "@/lib/drawing/parseProgress";
import { AlertTriangle, BarChart3, X } from "lucide-react";
import type { DrawingObjectType } from "@/lib/types";

const OBJECT_TYPE_VI: Partial<Record<DrawingObjectType, string>> = {
  beam: "Dầm", column: "Cột", wall: "Tường", slab: "Sàn",
  door: "Cửa", window: "Cửa sổ", stair: "Cầu thang",
  footing: "Móng", pile: "Cọc", roof: "Mái",
};

// ---------- BOQ ↔ drawing traceability (M3-A) ----------
// The AI writes structured tokens into the "Ghi chú" column of takeoff rows:
//   [obj:<drawingObjectId>] (per-object) | [nhóm:<type>] (full-takeoff group)
const OBJ_TOKEN_RE = /\[obj:([^\]\s]+)\]/i;
const GROUP_TOKEN_RE = /\[nh[óo]m:([^\]\s]+)\]/i;
const QTY_SHEET_NAME = "Khối lượng";

/** Concatenated text of one cellData row (Univer format: row → col → {v}). */
function rowText(cols: Record<string, any> | undefined): string {
  if (!cols) return "";
  return Object.values(cols).map((c: any) => String(c?.v ?? "")).join(" | ");
}

function parseTraceToken(text: string): BoqTraceToken | null {
  const obj = OBJ_TOKEN_RE.exec(text);
  if (obj) return { objectId: obj[1] };
  const grp = GROUP_TOKEN_RE.exec(text);
  if (grp) return { groupType: grp[1].toLowerCase() };
  return null;
}

function findQuantitySheet(sheets: Sheet[]): Sheet | undefined {
  return (
    sheets.find((s) => s.name === QTY_SHEET_NAME) ??
    sheets.find((s) => s.name.toLowerCase().includes(QTY_SHEET_NAME.toLowerCase()))
  );
}

export default function EstimateEditorPage() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [repricing, setRepricing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  // P7 Focus mode: ẩn cả 2 cột (Explorer + Agent) → workspace full-width.
  const [focusMode, setFocusMode] = useState(false);
  function toggleFocus() {
    setFocusMode((on) => {
      const next = !on;
      setExplorerCollapsed(next);
      setCollapsed(next);
      return next;
    });
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "\\" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      setFocusMode((on) => {
        const next = !on;
        setExplorerCollapsed(next);
        setCollapsed(next);
        return next;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [renamingSheetId, setRenamingSheetId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [selectedRange, setSelectedRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | undefined>(undefined);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [viewMode, setViewMode] = useState<WorkspaceView>("workbook");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawingId, setActiveDrawingId] = useState<string | undefined>(undefined);
  const [selectedDrawingObject, setSelectedDrawingObject] = useState<DrawingObject | undefined>(undefined);
  const [drawingViewport, setDrawingViewport] = useState<DrawingViewportInfo | undefined>(undefined);
  const [splitMode, setSplitMode] = useState(false);
  // P2 responsive: split cạnh nhau chỉ hợp màn rộng ≥1440px. Laptop (<1440) dùng
  // tab Bản vẽ↔Bảng full-width thay vì ép 2 pane + agent chật.
  const canSplit = useMediaQuery("(min-width: 1440px)");
  // BOQ → drawing focus request (token parsed from the selected workbook row)
  const [drawingFocus, setDrawingFocus] = useState<DrawingFocusRequest | null>(null);
  const [agentWidth, setAgentWidth] = useState(380);
  // Floating pill mirroring the current silent agent task (⚡ takeoff, …)
  const [agentTask, setAgentTask] = useState<AgentTaskState | null>(null);
  const [workbookReinitKey, setWorkbookReinitKey] = useState(0);
  // Cells the AI just edited — key `${sheetId}:${CELL}` (uppercase A1)
  const [aiEdits, setAiEdits] = useState<Map<string, AiCellEdit>>(new Map());
  // Cell key the user closed the explain popover for (re-shows on reselect)
  const [explainDismissedKey, setExplainDismissedKey] = useState<string | null>(null);
  // P5 giảm nag: banner nhận diện sheet chỉ hiện 1 lần/sheet (dismiss hoặc xác nhận → tắt hẳn)
  const [dismissedSheetBanners, setDismissedSheetBanners] = useState<Set<string>>(new Set());
  const agentDrag = useRef({ active: false, startX: 0, startW: 0, curW: 0 });
  const copilotRef = useRef<AgentHandle>(null);
  const workbookDriverRef = useRef<WorkbookDriver | null>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    setCollapsed(readCopilotCollapsed());
    const stored = localStorage.getItem("genspec-agent-width");
    if (stored) setAgentWidth(parseInt(stored, 10));
  }, []);

  const onAgentResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    agentDrag.current = { active: true, startX: e.clientX, startW: agentWidth, curW: agentWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [agentWidth]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!agentDrag.current.active) return;
      const dx = agentDrag.current.startX - e.clientX;
      const w = Math.max(280, Math.min(640, agentDrag.current.startW + dx));
      agentDrag.current.curW = w;
      setAgentWidth(w);
    }
    function onUp() {
      if (!agentDrag.current.active) return;
      agentDrag.current.active = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("genspec-agent-width", String(agentDrag.current.curW));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    let alive = true;
    // Load estimate + drawings in parallel
    Promise.all([
      api.getEstimate(id),
      api.listDrawings(id).catch(() => [] as Drawing[]),
    ]).then(([fetched, fetchedDrawings]) => {
        if (!alive) return;
        const e = fetched;
        setEstimate(e);
        setDrawings(fetchedDrawings);
        if (fetchedDrawings.length > 0) {
          setActiveDrawingId(fetchedDrawings[0].id);
        }
        if (e.sheets && e.sheets.length > 0) {
          const stored = localStorage.getItem(`genspec_active_sheet_${id}`);
          const restored = stored && e.sheets.some((s) => s.id === stored) ? stored : e.sheets[0].id;
          setActiveSheetId(restored);
        } else {
          setActiveSheetId("");
        }
        if (
          (e.takeoff?.length ?? 0) === 0 &&
          (e.analyses?.length ?? 0) === 0 &&
          (e.materials?.length ?? 0) === 0
        ) {
          setCollapsed(false);
        }
      }).catch((e: ApiError) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  // Poll TẤT CẢ bản vẽ chưa ready (pending/converting/parsing) — không chỉ bản
  // đang mở. Giữ badge Explorer + nút "Bóc toàn bộ dự án" cập nhật đúng, và
  // tránh kẹt loading khi bản vẽ nền xong. Dừng khi không còn bản nào đang parse.
  const parsingSig = drawings.filter((d) => isParsing(d.parseStatus)).map((d) => d.id).join(",");
  useEffect(() => {
    if (!parsingSig) return;
    const ids = parsingSig.split(",");
    const interval = setInterval(async () => {
      const updates = await Promise.all(
        ids.map((did) => api.getDrawing(id, did).catch(() => null))
      );
      const byId = new Map(updates.filter(Boolean).map((u) => [u!.id, u!]));
      if (byId.size === 0) return;
      setDrawings((prev) =>
        prev.map((d) => {
          const u = byId.get(d.id);
          return u && u.parseStatus !== d.parseStatus ? { ...d, ...u } : d;
        })
      );
    }, PARSE_POLL_MS);
    return () => clearInterval(interval);
  }, [id, parsingSig]);

  // Init context engine when workspace loads
  useEffect(() => {
    if (estimate) contextEngine.init(estimate.id);
  }, [estimate?.id]);

  // Sync sheet / selection → context engine
  useEffect(() => { contextEngine.onSheetChange(activeSheetId); }, [activeSheetId]);

  // Remember active sheet per estimate
  useEffect(() => {
    if (activeSheetId) {
      try { localStorage.setItem(`genspec_active_sheet_${id}`, activeSheetId); } catch { /* ignore */ }
    }
  }, [activeSheetId, id]);
  useEffect(() => { if (selectedRange) contextEngine.onSelectionChange(selectedRange); }, [selectedRange]);

  useEffect(() => {
    if (!estimate || autoSentRef.current) return;
    const pending = takePendingPrompt(estimate.id);
    if (!pending) return;
    autoSentRef.current = true;
    setCollapsed(false);
    const timer = window.setTimeout(() => {
      copilotRef.current?.send(pending.message, pending.files);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [estimate]);

  const applyEstimate = (next: Estimate) => {
    setEstimate(next);
    if (next.sheets && next.sheets.length > 0 && !activeSheetId) {
      setActiveSheetId(next.sheets[0].id);
    }
    // Reinit WorkbookEditor so Univer reflects AI-edited cell data
    setWorkbookReinitKey((k) => k + 1);
  };

  // Estimate update after a live agent drive — Univer already shows the values,
  // so update state WITHOUT reinitializing the editor (no flicker).
  const syncEstimate = (next: Estimate) => {
    setEstimate(next);
  };

  // Agent navigates the workspace: switch to workbook view + target sheet
  const handleAgentNavigate = useCallback((sheetId: string) => {
    // In split mode the workbook pane is already visible — keep the drawing
    // side on screen so the user watches both the source and the live writes.
    setSplitMode((split) => {
      if (!split) setViewMode("workbook");
      return split;
    });
    setActiveSheetId((prev) => (prev === sheetId ? prev : sheetId));
  }, []);

  // Accumulate AI-edited cells from applied actions (max 500, newest wins)
  const MAX_AI_EDITS = 500;
  const handleActionsApplied = useCallback((record: AppliedActionsRecord) => {
    if (!record.patchId || record.cells.length === 0) return;
    setAiEdits((prev) => {
      const next = new Map(prev);
      for (const c of record.cells) {
        const key = `${c.sheetId}:${c.cell}`.toUpperCase();
        next.delete(key); // re-insert to refresh recency order
        next.set(key, {
          patchId: record.patchId!,
          sheetId: c.sheetId,
          cell: c.cell.toUpperCase(),
          oldValue: c.oldValue,
          newValue: c.newValue,
          message: record.message,
          sources: record.sources,
          appliedAt: record.appliedAt,
        });
      }
      while (next.size > MAX_AI_EDITS) {
        const oldest = next.keys().next().value;
        if (oldest === undefined) break;
        next.delete(oldest);
      }
      return next;
    });
  }, []);

  // Drop entries whose patch was rolled back (no longer in patchHistory)
  useEffect(() => {
    const ids = new Set((estimate?.patchHistory ?? []).map((p) => p.id));
    setAiEdits((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [key, entry] of prev) {
        if (!ids.has(entry.patchId)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [estimate?.patchHistory]);

  // Single selected cell that the AI edited → show explain popover
  const singleCellKey =
    activeSheetId &&
    selectedRange &&
    selectedRange.startRow === selectedRange.endRow &&
    selectedRange.startCol === selectedRange.endCol
      ? cellKeyOf(activeSheetId, selectedRange.startRow, selectedRange.startCol)
      : null;
  const explainEntry =
    viewMode === "workbook" && singleCellKey
      ? aiEdits.get(singleCellKey)
      : undefined;

  // Moving to another cell resets the manual dismiss
  useEffect(() => {
    setExplainDismissedKey(null);
  }, [singleCellKey]);

  async function apply(actions: Action[]): Promise<boolean> {
    if (!estimate) return false;
    try {
      const res = await api.applyActions(estimate.id, actions, "manual");
      
      const oldSheets = estimate.sheets ?? [];
      const newSheets = res.estimate.sheets ?? [];
      const oldSheetKeys = oldSheets.map((s) => `${s.id}:${s.name}`).join(",");
      const newSheetKeys = newSheets.map((s) => `${s.id}:${s.name}`).join(",");
      const hasStructuralChange = oldSheetKeys !== newSheetKeys;
      const hasFormatChange = actions.some((a) => a.type === "format_sheet");

      setEstimate(res.estimate);
      if (res.warnings?.length) {
        toast.error(t("copilot.failed"), res.warnings.join(", "));
      }

      if (hasStructuralChange || hasFormatChange) {
        setWorkbookReinitKey((k) => k + 1);
      }
      return true;
    } catch (err) {
      toast.error(t("copilot.failed"), (err as ApiError).message);
      return false;
    }
  }

  async function onExport() {
    if (!estimate || exporting) return;
    setExporting(true);
    try {
      const blob = await api.exportF1(estimate.id);
      const safe =
        (estimate.name || "estimate").replace(/[^\w\-]+/g, "_") || "estimate";
      triggerDownload(blob, `${safe}_F1.xlsx`);
    } catch (err) {
      toast.error(t("editor.exportFailed"), (err as ApiError).message);
    } finally {
      setExporting(false);
    }
  }

  async function onExportTHDT() {
    if (!estimate || exporting) return;
    setExporting(true);
    try {
      const blob = await exportTHDT(estimate.id);
      const safe =
        (estimate.name || "estimate").replace(/[^\w\-]+/g, "_") || "estimate";
      triggerDownload(blob, `${safe}_THDT.xlsx`);
    } catch (err) {
      toast.error(t("editor.exportFailed"), (err as ApiError).message);
    } finally {
      setExporting(false);
    }
  }

  async function onReprice() {
    if (!estimate || repricing) return;
    setRepricing(true);
    try {
      const plan = await api.reprice(estimate.id);
      if (!plan.actions.length) {
        toast.error("Áp giá tỉnh", plan.message);
        return;
      }
      const delta = plan.preview?.costDelta ?? 0;
      const deltaStr = `${delta >= 0 ? "+" : ""}${delta.toLocaleString("vi-VN")}đ`;
      const missing = plan.unmatched.length
        ? `\nCòn ${plan.unmatched.length} tài nguyên chưa khớp giá.`
        : "";
      const ok = window.confirm(
        `${plan.message}\nCập nhật ${plan.actions.length} dòng giá, tổng mức đổi ${deltaStr}.${missing}\n\nÁp dụng?`,
      );
      if (!ok) return;
      const applied = await apply(plan.actions);
      if (applied) toast.success("Đã áp giá tỉnh", plan.message);
    } catch (err) {
      toast.error("Áp giá tỉnh thất bại", (err as ApiError).message);
    } finally {
      setRepricing(false);
    }
  }

  async function onImportExcel(file: File) {
    if (!estimate || importing) return;
    if (!window.confirm(t("editor.importConfirm"))) return;
    setImporting(true);
    try {
      const next = await api.importExcel(estimate.id, file);
      applyEstimate(next);
    } catch (err) {
      toast.error(t("editor.importFailed"), (err as ApiError).message);
    } finally {
      setImporting(false);
    }
  }

  async function onRename(name: string) {
    setEstimate((prev) => (prev ? { ...prev, name } : prev));
    try {
      setEstimate(await api.renameEstimate(id, name));
    } catch {}
  }

  function handleAddSheet() {
    if (!estimate) return;
    const numSheets = estimate.sheets?.length ?? 0;
    const newSheet: Sheet = {
      id: `sheet-${Date.now()}`,
      name: `Sheet ${numSheets + 1}`,
      data: { cellData: {}, rowCount: 100, columnCount: 20 },
    };
    const nextSheets = [...(estimate.sheets ?? []), newSheet];
    apply([{ type: "set_sheets", sheets: nextSheets }]);
    setActiveSheetId(newSheet.id);
  }

  function handleDeleteSheet(sheetId: string) {
    if (!estimate) return;
    const nextSheets = (estimate.sheets ?? []).filter((s) => s.id !== sheetId);
    apply([{ type: "set_sheets", sheets: nextSheets }]);
    if (activeSheetId === sheetId) {
      if (nextSheets.length > 0) {
        setActiveSheetId(nextSheets[0].id);
      } else {
        setActiveSheetId("");
      }
    }
  }

  function handleRenameSheet(sheetId: string) {
    if (!estimate || !renameText.trim()) return;
    const nextSheets = (estimate.sheets ?? []).map((s) =>
      s.id === sheetId ? { ...s, name: renameText.trim() } : s
    );
    apply([{ type: "set_sheets", sheets: nextSheets }]);
    setRenamingSheetId(null);
    setRenameText("");
  }

  function handleSelectionChange(range: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }) {
    setSelectedRange(range);
  }

  async function handleDataChange(updatedSheets: Sheet[]) {
    setSaveState("saving");
    const ok = await apply([{ type: "set_sheets", sheets: updatedSheets }]);
    setSaveState(ok ? "saved" : "dirty");
    if (!ok) toast.error(t("editor.saveFailed"));
  }

  function handleConfirmSheetType(sheetId: string, sheetType: string) {
    if (!estimate) return;
    const nextSheets = (estimate.sheets ?? []).map((s) =>
      s.id === sheetId
        ? { ...s, metadata: { ...s.metadata, sheetType, confidence: 1.0 } }
        : s
    );
    apply([{ type: "set_sheets", sheets: nextSheets }]);
  }

  function handleFindings(newFindings: ReviewFinding[]) {
    setFindings(newFindings);
  }

  // Drawing → BOQ: locate the takeoff row traced to this object and focus it.
  // Match priority: [obj:<id>] token → [nhóm:<type>] token → Vietnamese type label.
  function handleJumpToBoq(obj: DrawingObject) {
    const sheet = findQuantitySheet(estimate?.sheets ?? []);
    if (!sheet) {
      toast.error("Chưa có sheet Khối lượng", "Chạy ⚡ Bóc toàn bộ hoặc Generate Takeoff trước.");
      return;
    }
    const cellData = (sheet.data?.cellData ?? {}) as Record<string, Record<string, any>>;
    let exactRow: number | null = null;
    let groupRow: number | null = null;
    let nameRow: number | null = null;
    const viLabel = OBJECT_TYPE_VI[obj.type]?.toLowerCase();
    for (const [rowStr, cols] of Object.entries(cellData)) {
      const text = rowText(cols);
      if (text.includes(`[obj:${obj.id}]`) || (obj.stableId && text.includes(`[obj:${obj.stableId}]`))) {
        exactRow = Number(rowStr);
        break;
      }
      if (groupRow == null && parseTraceToken(text)?.groupType === obj.type) groupRow = Number(rowStr);
      if (nameRow == null && viLabel && text.toLowerCase().includes(viLabel)) nameRow = Number(rowStr);
    }
    const row = exactRow ?? groupRow ?? nameRow;
    if (row == null) {
      toast.error("Chưa có dòng khối lượng cho đối tượng này");
      return;
    }
    // Keep split if already split (drawing stays visible); otherwise show workbook
    if (!splitMode) setViewMode("workbook");
    setActiveSheetId(sheet.id);
    focusWorkbookCell(sheet.id, row);
  }

  // Focus + flash a workbook cell, retrying while Univer mounts/initializes.
  function focusWorkbookCell(sheetId: string, row: number) {
    let attempts = 0;
    const tryFocus = () => {
      const d = workbookDriverRef.current;
      if (d?.focusCell(sheetId, row, 0)) {
        d.flashCell(sheetId, row, 0);
        return;
      }
      if (++attempts < 20) setTimeout(tryFocus, 200);
    };
    setTimeout(tryFocus, 100);
  }

  // BOQ → drawing: open split view and pan the canvas to the traced object
  function handleTraceToDrawing(token: BoqTraceToken) {
    if (drawings.length === 0) {
      toast.error("Chưa có bản vẽ để hiển thị");
      return;
    }
    const targetId = activeDrawingId ?? drawings[0].id;
    setActiveDrawingId(targetId);
    setViewMode("drawing");
    setSplitMode(true);
    setDrawingFocus({ objectId: token.objectId, groupType: token.groupType, nonce: Date.now() });
  }

  function handleDrawingObjectSelect(obj: DrawingObject) {
    setSelectedDrawingObject(obj);
    // If obj has a BOQ ref, highlight that row
    if (obj.boqRef && estimate?.sheets) {
      setViewMode("workbook");
    }
  }

  function handleGenerateTakeoff(obj: DrawingObject, drawingId: string) {
    // Context engine already knows current state; use Action Dispatcher
    const prompt = buildGenerateTakeoffAction(obj, drawingId, contextEngine.getContext());
    setViewMode("workbook");
    // Silent task — sidebar stays as-is; collapsed rail pulses while running
    const typeLabel = OBJECT_TYPE_VI[obj.type] ?? obj.type;
    const objLabel = obj.layer ? ` (${obj.layer})` : "";
    setTimeout(
      () =>
        copilotRef.current?.runTask({
          prompt,
          displayText: `📐 Bóc khối lượng: ${typeLabel}${objLabel}`,
          jobLabel: `Bóc khối lượng ${typeLabel}`,
        }),
      300
    );
  }

  // 3 sheet BOQ theo nhóm công tác QS (đồng bộ BOQ_SHEETS ở backend engine).
  // Tên phải khớp chính xác để engine route dòng đúng sheet.
  const BOQ_SHEET_NAMES = ["1. Kết cấu & bao che", "2. Hoàn thiện bề mặt", "3. Cửa & phụ kiện"];

  // Ensure the 3 BOQ sheets exist and make the first active (shared by both
  // ⚡ takeoff paths). Trả về id các sheet theo thứ tự để tour animation dùng.
  async function ensureQuantitySheet(): Promise<string[]> {
    if (!estimate) return [];
    const current = estimate.sheets ?? [];
    const ids: string[] = [];
    const toAdd: Sheet[] = [];
    BOQ_SHEET_NAMES.forEach((name, i) => {
      const existing = current.find((s) => s.name === name);
      if (existing) {
        ids.push(existing.id);
      } else {
        const s: Sheet = {
          id: `sheet-${Date.now()}-${i}`,
          name,
          // Freeze 2 dòng đầu (tiêu đề sheet + header cột) để luôn thấy khi cuộn.
          data: {
            cellData: {},
            rowCount: 100,
            columnCount: 20,
            freeze: { xSplit: 0, ySplit: 2, startRow: 2, startColumn: 0 },
          } as Sheet["data"],
        };
        toAdd.push(s);
        ids.push(s.id);
      }
    });
    if (toAdd.length > 0) {
      await apply([{ type: "set_sheets", sheets: [...current, ...toAdd] }]);
    }
    setActiveSheetId(ids[0]);
    return ids;
  }


  // "⚡ Bóc toàn bộ" — LEGACY LLM path. Kept intact as the fallback when the
  // deterministic engine errors (see handleEngineTakeoff catch).
  async function handleFullTakeoff(prompt: string) {
    if (!estimate) return;
    await ensureQuantitySheet();
    // Split: workbook on the left, drawing on the right.
    // Silent task — do NOT force the sidebar open; the collapsed rail pulses.
    setViewMode("drawing");
    setSplitMode(true);
    const drawingName = drawings.find((d) => d.id === activeDrawingId)?.name;
    setTimeout(
      () =>
        copilotRef.current?.runTask({
          prompt,
          displayText: `⚡ Bóc khối lượng toàn bộ bản vẽ${drawingName ? ` ${drawingName}` : ""}`,
          jobLabel: "Bóc khối lượng",
        }),
      300
    );
  }

  // "⚡ Bóc toàn bộ" — ENGINE path (deterministic, <2s, computed geometry).
  // No streaming: the BE returns a ready CopilotProposal that is injected into
  // the chat as a pending ProposalCard; the user applies it (or "oke làm đi").
  async function handleEngineTakeoff(payload: EngineTakeoffPayload) {
    if (!estimate) return;
    const sheetIds = await ensureQuantitySheet();
    setViewMode("drawing");
    setSplitMode(true);
    // Thu Explorer để tập trung không gian cho drawing + workbook + chat.
    setExplorerCollapsed(true);
    const drawingName = drawings.find((d) => d.id === payload.drawingId)?.name;
    const displayText = `⚡ Bóc khối lượng toàn bộ bản vẽ${drawingName ? ` ${drawingName}` : ""}`;
    const label = "Bóc khối lượng (máy tính)";
    setAgentTask({ label, step: "Đang đo hình học…", status: "running" });
    // Indicator trong chat NGAY khi bấm — engine là POST không stream nên nếu
    // không có cái này chat sẽ im lặng suốt lúc đo + tra giá web (~30-60s).
    const stopWorking = copilotRef.current?.beginWorking([
      `⚡ Đang đo hình học bản vẽ${drawingName ? ` ${drawingName}` : ""}…`,
      `Đang tra mã hiệu định mức cho từng công tác…`,
      `Đang tra đơn giá thị trường trên web (grounded)…`,
      `Đang tổng hợp & ghi bảng khối lượng…`,
    ]);
    // Engine is fast — the pill is the primary feedback; the JobCenter entry
    // exists for history only (done almost immediately).
    const job = addJob({
      id: `takeoff-engine-${Date.now()}`,
      type: "agent_task",
      status: "processing",
      progress: 30,
      message: label,
    });
    const start = Date.now();
    try {
      const proposal = await runTakeoffEngine(estimate.id, {
        drawingId: payload.drawingId,
        unitsPerDrawingUnit: payload.unitsPerDrawingUnit,
        assumptions: payload.assumptions,
        rejectedObjectIds: payload.rejectedObjectIds,
        region: payload.region,
        discipline: drawings.find((d) => d.id === payload.drawingId)?.discipline,
      });
      // injectProposal → applyProposal → driveActions: agent tự gõ text + tô màu
      // từng ô và tự chuyển sheet khi ghi sang sheet khác (cảm giác "đang làm").
      // KHÔNG chạy tour thủ công ở đây — nó sẽ giật active sheet khỏi chỗ agent
      // đang gõ, làm mất hiệu ứng.
      stopWorking?.(); // tắt indicator "đang bóc" ngay trước khi hiện proposal
      const proposalMsgId = copilotRef.current?.injectProposal(proposal, displayText);
      void sheetIds;
      updateJob(job.id, {
        status: "done",
        progress: 100,
        message: `Hoàn tất — ${proposal.actions.length} đề xuất thay đổi`,
        durationMs: Date.now() - start,
      });
      setAgentTask({
        label,
        step: proposal.actions.length > 0
          ? `${proposal.actions.length} đề xuất thay đổi`
          : "Hoàn tất",
        status: "done",
        proposalMsgId,
      });
    } catch (err) {
      stopWorking?.();
      const msg = (err as ApiError).message;
      updateJob(job.id, { status: "failed", message: msg, durationMs: Date.now() - start });
      setAgentTask({ label, step: msg, status: "error" });
      // Scale problems must NOT fall back to the LLM — it would compute from
      // the same wrong measurements and produce confident garbage.
      if (/tỉ lệ|ti le/i.test(msg)) {
        toast.error("Tỉ lệ bản vẽ chưa đúng", msg);
        return;
      }
      toast.error("Engine bóc khối lượng lỗi", `${msg} — chuyển sang AI bóc thay.`);
      // FALLBACK: replay the legacy LLM pipeline with the prompt the workspace
      // already built (runTask drives its own pill/JobCenter lifecycle).
      setTimeout(
        () =>
          copilotRef.current?.runTask({
            prompt: payload.fallbackPrompt,
            displayText,
            jobLabel: "Bóc khối lượng",
          }),
        300
      );
    }
  }

  // "⚡ Bóc toàn bộ dự án" — chạy engine tuần tự cho TỪNG bản vẽ ready (mỗi bản
  // theo bộ môn của nó), tất cả proposal áp thẳng vào cùng sheet Khối lượng.
  // Idempotent theo drawingId+rowKey nên gộp không đè, bóc lại 1 bộ môn chỉ thay
  // phần của nó. Không cần calibration ở FE — engine tự hiệu chỉnh factor (đọc
  // calibration đã lưu nếu có, mặc định 0.001 mm rồi tự suy lại nếu bất hợp lý).
  async function handleProjectTakeoff() {
    if (!estimate) return;
    const ready = drawings.filter((d) => !d.parseStatus || d.parseStatus === "ready");
    if (ready.length === 0) return;
    await ensureQuantitySheet();
    setViewMode("drawing");
    setSplitMode(true);
    setExplorerCollapsed(true);
    const label = "Bóc toàn bộ dự án";
    const stopWorking = copilotRef.current?.beginWorking([
      `⚡ Đang bóc toàn bộ dự án (${ready.length} bản vẽ)…`,
      `Đang đo hình học từng bản vẽ…`,
      `Đang tra mã định mức + đơn giá thị trường…`,
      `Đang tổng hợp bảng khối lượng…`,
    ]);
    const order = ["KT", "KC", "DIEN", "NUOC", "KHAC"];
    const discLabel: Record<string, string> = { KT: "KT", KC: "KC", DIEN: "Điện", NUOC: "Nước", KHAC: "Khác" };
    const sorted = [...ready].sort(
      (a, b) => order.indexOf(a.discipline ?? "KHAC") - order.indexOf(b.discipline ?? "KHAC")
    );
    const readCal = (id: string): number => {
      try {
        const raw = localStorage.getItem(`genspec_drawing_cal_${id}`);
        const f = raw ? (JSON.parse(raw) as { unitsPerDrawingUnit?: number }).unitsPerDrawingUnit : undefined;
        return typeof f === "number" && f > 0 ? f : 0.001;
      } catch {
        return 0.001;
      }
    };
    const start = Date.now();
    const job = addJob({
      id: `takeoff-project-${Date.now()}`,
      type: "agent_task",
      status: "processing",
      progress: 5,
      message: label,
    });
    setAgentTask({ label, step: "Bắt đầu bóc toàn bộ dự án…", status: "running" });
    let doneCount = 0;
    let totalActions = 0;
    const errors: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const dr = sorted[i];
      const dl = discLabel[dr.discipline ?? "KHAC"] ?? dr.discipline;
      setAgentTask({ label, step: `Đang bóc ${dl} — ${dr.name}… (${i + 1}/${sorted.length})`, status: "running" });
      updateJob(job.id, { progress: Math.round(((i + 0.5) / sorted.length) * 100), message: `${label}: ${dl}` });
      try {
        const proposal = await runTakeoffEngine(estimate.id, {
          drawingId: dr.id,
          unitsPerDrawingUnit: readCal(dr.id),
          assumptions: loadTakeoffAssumptions(dr.id) ?? DEFAULT_TAKEOFF_ASSUMPTIONS,
          discipline: dr.discipline,
        });
        const applied = await apply(proposal.actions);
        if (applied) {
          totalActions += proposal.actions.length;
          doneCount++;
        }
      } catch (err) {
        errors.push(`${dr.name}: ${(err as ApiError).message}`);
      }
    }
    stopWorking?.();
    const summary = `${doneCount}/${sorted.length} bản vẽ · ${totalActions} thay đổi${errors.length ? ` · ${errors.length} lỗi` : ""}`;
    updateJob(job.id, {
      status: errors.length && doneCount === 0 ? "failed" : "done",
      progress: 100,
      message: `Hoàn tất — ${summary}`,
      durationMs: Date.now() - start,
    });
    setAgentTask({ label, step: `Hoàn tất — ${summary}`, status: errors.length && doneCount === 0 ? "error" : "done" });
    if (errors.length) toast.error("Một số bản vẽ bóc lỗi", errors.join("; "));
    else toast.success("Đã bóc toàn bộ dự án", summary);
  }

  function handleObjectsLoaded(objects: DrawingObject[]) {
    if (!copilotRef.current) return;
    // Build per-type summary, top 4 types
    const counts = objects.reduce<Partial<Record<DrawingObjectType, number>>>((acc, o) => {
      acc[o.type] = (acc[o.type] ?? 0) + 1;
      return acc;
    }, {});
    const topTypes = (Object.entries(counts) as [DrawingObjectType, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([type, count]) => `${count} ${OBJECT_TYPE_VI[type] ?? type}`);
    const avgConf = Math.round(
      objects.reduce((s, o) => s + o.confidence, 0) / objects.length * 100
    );
    const text =
      `🔍 Phát hiện ${objects.length} đối tượng: ${topTypes.join(", ")}.\n` +
      `Độ tin cậy trung bình: ${avgConf}%.\n\n` +
      `Có muốn tạo Takeoff không?`;
    setCollapsed(false);
    copilotRef.current.injectMessage({ kind: "assistant", text });
  }

  async function handleDeleteDrawing(drawingId: string) {
    try {
      await api.deleteDrawing(id, drawingId);
      setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
      if (activeDrawingId === drawingId) {
        const remaining = drawings.filter((d) => d.id !== drawingId);
        setActiveDrawingId(remaining[0]?.id);
      }
    } catch { /* ignore */ }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-rose-300">{t("editor.loadFailed")}</p>
        <p className="mt-1 text-xs text-zinc-500">{error}</p>
        <Link href="/" className="mt-5 inline-block">
          <Button variant="secondary">{t("editor.backToDashboard")}</Button>
        </Link>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const sheetsList = estimate.sheets ?? [];

  // Workbook is visible in workbook mode AND as the left pane of split view
  const showWorkbookPane = viewMode === "workbook" || (viewMode === "drawing" && splitMode);
  const explainVisible = !!explainEntry && explainDismissedKey !== singleCellKey;
  // Trace chip: single selected cell whose row carries a [obj:]/[nhóm:] token
  const traceToken = (() => {
    if (!showWorkbookPane || !activeSheetId || !selectedRange) return null;
    if (selectedRange.startRow !== selectedRange.endRow || selectedRange.startCol !== selectedRange.endCol) return null;
    const sheet = sheetsList.find((s) => s.id === activeSheetId);
    return parseTraceToken(rowText(sheet?.data?.cellData?.[selectedRange.startRow]));
  })();

  const workbookContent = (
    <div className="min-w-0 flex-1 overflow-hidden relative bg-zinc-950 flex flex-col h-full">
      {viewMode === "insights" ? (
        <InsightsDashboard estimate={estimate} />
      ) : showWorkbookPane && activeSheetId ? (
        <>
          {(() => {
            const currentSheet = sheetsList.find((s) => s.id === activeSheetId);
            const sheetType = currentSheet?.metadata?.sheetType || "unknown";
            const confidence = currentSheet?.metadata?.confidence ?? 0;
            const showWarning = sheetType !== "unknown" && confidence > 0 && confidence < 0.9;
            // Chỉ hỏi 1 lần/sheet: đã dismiss hoặc đã xác nhận (confidence=1) → im.
            if (!showWarning || dismissedSheetBanners.has(activeSheetId)) return null;
            return (
              <div className="bg-zinc-900 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-300 shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>
                    Hệ thống nhận diện đây là <strong>{sheetType === "material" ? "Bảng Giá vật tư" : "Bảng BOQ"}</strong> (Độ tin cậy: {Math.round(confidence * 100)}%).
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleConfirmSheetType(activeSheetId, sheetType)}
                    className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
                  >
                    Xác nhận
                  </button>
                  <select
                    onChange={(e) => handleConfirmSheetType(activeSheetId, e.target.value)}
                    className="bg-zinc-950 border border-zinc-700 text-zinc-300 rounded px-1.5 py-0.5"
                    defaultValue=""
                  >
                    <option value="" disabled>Thay đổi</option>
                    <option value="boq">Bảng BOQ</option>
                    <option value="material">Bảng Giá vật tư</option>
                    <option value="unknown">Không xác định</option>
                  </select>
                  <button
                    onClick={() => setDismissedSheetBanners((prev) => new Set(prev).add(activeSheetId))}
                    title="Ẩn — không hỏi lại cho sheet này"
                    className="rounded p-1 text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}
          <div className="flex-1 min-h-0 relative">
            <WorkbookEditor
              // Remount HẲN khi reinitKey đổi (sau khi agent apply có format_sheet)
              // → Univer mount mới đọc lại style/màu như F5, không cần reload tay.
              // (reinit nội bộ đôi lúc không áp style deduped → remount chắc ăn.)
              key={`wb-${estimate.id}-${workbookReinitKey}`}
              workbookData={{
                id: estimate.id,
                userId: estimate.userId,
                name: estimate.name,
                sheets: sheetsList,
              }}
              activeSheetId={activeSheetId}
              onActiveSheetChange={setActiveSheetId}
              onSelectionChange={handleSelectionChange}
              onDataChange={handleDataChange}
              onSaveStateChange={setSaveState}
              findings={findings}
              reinitKey={workbookReinitKey}
              driverRef={workbookDriverRef}
            />
            {explainVisible && explainEntry && (
              <CellExplainPopover
                entry={explainEntry}
                onUndo={() => copilotRef.current?.undoPatch(explainEntry.patchId)}
                onClose={() => setExplainDismissedKey(singleCellKey)}
              />
            )}
            {traceToken && (
              <button
                type="button"
                onClick={() => handleTraceToDrawing(traceToken)}
                title="Mở bản vẽ và pan tới đối tượng liên quan dòng này"
                className="absolute top-3 z-30 flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/95 px-2.5 py-1 text-[11px] text-zinc-200 shadow-lg backdrop-blur transition-colors hover:border-blue-500 hover:text-blue-300"
                style={{ right: explainVisible ? "19.5rem" : "0.75rem" }}
              >
                📐 Xem trên bản vẽ
              </button>
            )}
          </div>
        </>
      ) : showWorkbookPane ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 space-y-3">
          <BarChart3 className="h-10 w-10 text-zinc-700" />
          <p className="text-sm">Create a new sheet or select an existing one to begin</p>
          <Button onClick={handleAddSheet}>Create First Sheet</Button>
        </div>
      ) : null}
    </div>
  );

  const drawingContent = (
    <DrawingWorkspace
      estimateId={estimate.id}
      activeDrawingId={activeDrawingId}
      onDrawingSelect={setActiveDrawingId}
      onObjectSelect={handleDrawingObjectSelect}
      onGenerateTakeoff={handleGenerateTakeoff}
      drawings={drawings}
      onDrawingsChange={setDrawings}
      onObjectsLoaded={handleObjectsLoaded}
      onFullTakeoff={handleFullTakeoff}
      onEngineTakeoff={handleEngineTakeoff}
      onProjectTakeoff={handleProjectTakeoff}
      takeoffBusy={agentTask?.status === "running"}
      onJumpToBoq={handleJumpToBoq}
      externalFocus={drawingFocus}
      onAskAI={(summaryText) => {
        // Silent task — sidebar stays as-is
        setTimeout(
          () =>
            copilotRef.current?.runTask({
              prompt: summaryText,
              displayText: "🔍 Phân tích thay đổi giữa 2 bản vẽ",
              jobLabel: "Phân tích revision",
            }),
          300
        );
      }}
      onViewportChange={(info) => {
        setDrawingViewport(info);
        setActiveDrawingId(info.drawingId);
        contextEngine.onViewportChange(info);
      }}
    />
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
      <EditorTopBar
        estimate={estimate}
        onRename={onRename}
        onExport={onExport}
        onExportTHDT={onExportTHDT}
        exporting={exporting}
        onImportExcel={onImportExcel}
        importing={importing}
        onReprice={onReprice}
        repricing={repricing}
        saveState={saveState}
        splitMode={splitMode}
        onSplitModeChange={setSplitMode}
        focusMode={focusMode}
        onToggleFocus={toggleFocus}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Explorer Sidebar */}
        <ExplorerPanel
          estimate={estimate}
          viewMode={viewMode}
          onViewModeChange={(mode) => {
            setViewMode(mode);
            if (mode === "workbook") setSplitMode(false);
          }}
          activeSheetId={activeSheetId}
          onSheetSelect={(id) => { setActiveSheetId(id); setViewMode("workbook"); }}
          onAddSheet={handleAddSheet}
          onDeleteSheet={handleDeleteSheet}
          onRenameSheet={(sheetId, name) => {
            const nextSheets = (estimate.sheets ?? []).map((s) =>
              s.id === sheetId ? { ...s, name } : s
            );
            apply([{ type: "set_sheets", sheets: nextSheets }]);
          }}
          drawings={drawings}
          activeDrawingId={activeDrawingId}
          onDrawingSelect={(dId) => { setActiveDrawingId(dId); setViewMode("drawing"); }}
          onDeleteDrawing={handleDeleteDrawing}
          onDrawingsChange={setDrawings}
          collapsed={explorerCollapsed}
          onToggleCollapse={setExplorerCollapsed}
        />

        {/* Main Area */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-zinc-950 flex flex-col">
          {agentTask && (
            <AgentTaskPill
              task={agentTask}
              onView={() => setCollapsed(false)}
              onDismiss={() => setAgentTask(null)}
            />
          )}
          {/* Tab Bản vẽ↔Bảng — chỉ hiện khi muốn xem cả 2 nhưng màn hẹp (<1440px).
              Full-width từng cái thay vì ép split 3 cột chật. */}
          {splitMode && !canSplit && viewMode !== "insights" && (
            <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 bg-zinc-900/60 px-2 py-1">
              <button
                type="button"
                onClick={() => setViewMode("drawing")}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  viewMode === "drawing" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Bản vẽ
              </button>
              <button
                type="button"
                onClick={() => setViewMode("workbook")}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  viewMode === "workbook" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Bảng dự toán
              </button>
              <span className="ml-2 text-[10px] text-zinc-600">Màn rộng hơn sẽ hiện cạnh nhau</span>
            </div>
          )}
          {viewMode === "drawing" && splitMode && canSplit ? (
            <SplitView
              left={workbookContent}
              right={drawingContent}
              storageKey="genspec-split-drawing"
            />
          ) : viewMode === "drawing" ? (
            drawingContent
          ) : (
            workbookContent
          )}
        </div>

        {/* Resize handle for AI sidebar */}
        {!collapsed && (
          <div
            onMouseDown={onAgentResizeStart}
            className="w-1 shrink-0 cursor-col-resize bg-zinc-800 hover:bg-blue-500 transition-colors group relative"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}

        {/* AI Sidebar */}
        <AgentConsole
          estimate={estimate}
          drawings={drawings}
          onEstimateUpdated={applyEstimate}
          controlRef={copilotRef}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          activeSheetId={activeSheetId}
          selectedRange={selectedRange}
          onFindings={handleFindings}
          activeDrawingId={activeDrawingId}
          selectedDrawingObject={selectedDrawingObject}
          drawingViewport={drawingViewport}
          width={agentWidth}
          workbookDriver={workbookDriverRef}
          onAgentNavigate={handleAgentNavigate}
          onEstimateSynced={syncEstimate}
          onActionsApplied={handleActionsApplied}
          onTaskStateChange={setAgentTask}
          province={estimate?.projectInfo?.location}
          onProvinceChange={(p) =>
            apply([{ type: "set_project_info", patch: { location: p } }])
          }
        />
      </div>
    </div>
  );
}
