"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ref } from "react";
import type {
  Action,
  ConversationMessage,
  CopilotProposal,
  Drawing,
  DrawingObject,
  Estimate,
  ReviewFinding,
} from "@/lib/types";
import type { WorkbookDriver } from "./WorkbookEditor";
import type { DrawingViewportInfo } from "@/components/drawing/DrawingWorkspace";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { CopilotComposer } from "./CopilotComposer";
import { type TimelineStep } from "./LiveTimeline";
import { ProposalCard, type ProposalState } from "./ProposalCard";
import { HistoryTimeline } from "./HistoryTimeline";
import { SparkleIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Bot, History as HistoryIcon, Lock, MapPin, Ruler } from "lucide-react";
import { takePendingTask, type PendingTask } from "@/lib/pendingTask";
import { TaskCard } from "./TaskCard";

// Labels for non-cell action types shown in the auto-apply summary
const ACTION_TYPE_VI: Record<string, string> = {
  upsert_takeoff: "cập nhật khối lượng",
  delete_takeoff: "xóa khối lượng",
  upsert_material: "cập nhật vật tư",
  update_price: "cập nhật giá",
  set_project_info: "cập nhật thông tin dự án",
  set_sheets: "cập nhật bảng tính",
  clear: "xóa dữ liệu",
};

/** Compact plain-text diff for the auto-apply done message. */
function buildAppliedDiff(actions: Action[]): string {
  const cellEdits = actions.filter(
    (a): a is Extract<Action, { type: "update_cells" }> => a.type === "update_cells"
  );
  const lines = cellEdits
    .slice(0, 10)
    .map((a) => `• ${a.cell}: ${a.oldValue} → ${a.newValue}`);
  if (cellEdits.length > 10) {
    lines.push(`… và ${cellEdits.length - 10} thay đổi khác`);
  }
  const otherCounts = new Map<string, number>();
  for (const a of actions) {
    if (a.type !== "update_cells") {
      otherCounts.set(a.type, (otherCounts.get(a.type) ?? 0) + 1);
    }
  }
  for (const [type, n] of otherCounts) {
    lines.push(`• ${n} ${ACTION_TYPE_VI[type] ?? type}`);
  }
  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

export interface AgentHandle {
  send: (text: string, files: File[]) => void;
  injectMessage: (msg: Pick<ConversationMessage, "kind" | "text">) => void;
}

interface ProposalItem {
  msgId: string;
  proposal: CopilotProposal;
  state: ProposalState;
  appliedCount?: number;
  timestamp: string;
}

const EDIT_PERM_KEY = (id: string) => `genspec_edit_perm_${id}`;
const TYPEWRITER_MS = 10; // ~100 chars/sec
const COLLAPSED_KEY = "genspec_copilot_collapsed";

interface Props {
  estimate: Estimate;
  drawings?: Drawing[];
  onEstimateUpdated: (e: Estimate) => void;
  controlRef?: Ref<AgentHandle>;
  collapsed: boolean;
  onCollapsedChange: (c: boolean) => void;
  activeSheetId?: string;
  selectedRange?: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  };
  onFindings?: (findings: ReviewFinding[]) => void;
  activeDrawingId?: string;
  selectedDrawingObject?: DrawingObject;
  drawingViewport?: DrawingViewportInfo;
  width?: number;
  /** Live-drive handle into the spreadsheet (AI moves selection & writes cells) */
  workbookDriver?: React.RefObject<WorkbookDriver | null>;
  /** Called when the agent navigates to a sheet so the page syncs its view */
  onAgentNavigate?: (sheetId: string) => void;
  /** Estimate update WITHOUT editor reinit — used after a live drive already
      wrote the same values into the grid */
  onEstimateSynced?: (e: Estimate) => void;
}

export function AgentConsole({
  estimate,
  onEstimateUpdated,
  controlRef,
  collapsed,
  onCollapsedChange,
  activeSheetId,
  selectedRange,
  onFindings,
  activeDrawingId,
  selectedDrawingObject,
  drawingViewport,
  width,
  workbookDriver,
  onAgentNavigate,
  onEstimateSynced,
}: Props) {
  const toast = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [thread, setThread] = useState<ConversationMessage[]>([]);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [liveSteps, setLiveSteps] = useState<TimelineStep[]>([]);
  const [liveText, setLiveText] = useState("");
  const [liveThinking, setLiveThinking] = useState("");
  const [driveStatus, setDriveStatus] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [editPermission, setEditPermission] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [rollbackLoadingId, setRollbackLoadingId] = useState<
    string | undefined
  >();
  const [activeTask, setActiveTask] = useState<PendingTask | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingFinalizeRef = useRef<(() => void) | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef("");
  const streamingRef = useRef(false);
  const hasTokensRef = useRef(false);
  const idRef = useRef(0);
  const estimateRef = useRef(estimate);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll guard: don't yank the view down while the user reads history
  const isAtBottomRef = useRef(true);
  const prevThreadLenRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typedTail =
    liveText.length > 1400 ? "…" + liveText.slice(-1400) : liveText;
  const caretActive = streaming;

  const nextId = () => String(++idRef.current);
  const clockNow = () =>
    new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  useEffect(() => {
    estimateRef.current = estimate;
  }, [estimate]);

  // Load edit permission
  useEffect(() => {
    const saved = localStorage.getItem(EDIT_PERM_KEY(estimate.id));
    if (saved === "1") setEditPermission(true);
  }, [estimate.id]);

  // Load conversation history
  useEffect(() => {
    let alive = true;
    api
      .getConversation(estimate.id)
      .then((msgs) => {
        if (!alive) return;
        setThread(msgs);
        const restored: ProposalItem[] = [];
        for (const m of msgs) {
          if (m.kind === "proposal" && m.proposal) {
            restored.push({
              msgId: m.id,
              proposal: m.proposal,
              state: (m.proposalState as ProposalState) ?? "pending",
              appliedCount: m.appliedCount,
              timestamp: m.timestamp,
            });
          }
        }
        if (restored.length) setProposals(restored);
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (alive) setHistoryLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [estimate.id]);

  // Save conversation debounced 1s
  const saveConversation = useCallback(
    (msgs: ConversationMessage[]) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        api.saveConversation(estimate.id, msgs).catch(() => { });
      }, 1000);
    },
    [estimate.id]
  );

  // Auto-scroll chat — only when the user is at the bottom, or just sent a message
  useEffect(() => {
    const userSent =
      thread.length > prevThreadLenRef.current &&
      thread[thread.length - 1]?.kind === "user";
    prevThreadLenRef.current = thread.length;
    if (!isAtBottomRef.current && !userSent) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [thread, liveSteps, streaming, liveText, liveThinking, driveStatus]);

  const handleChatScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
  }, []);

  // Cleanup abort and typewriter on unmount
  useEffect(() => () => {
    abortRef.current?.abort();
    if (typewriterRef.current) clearTimeout(typewriterRef.current);
  }, []);

  // Flush pending save before tab closes or user navigates away
  useEffect(() => {
    function flush() {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        // Fire immediately (best-effort, browser may not await fetch on unload)
        api.saveConversation(estimate.id, thread).catch(() => {});
      }
    }
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [estimate.id, thread]);

  // Finalize when streaming ends; guard against clearing while typewriter is running
  useEffect(() => {
    if (streaming) return;
    // Typewriter still draining — drainTick finalizes when the queue empties.
    if (typewriterRef.current || queueRef.current) return;
    if (pendingFinalizeRef.current) {
      const fin = pendingFinalizeRef.current;
      pendingFinalizeRef.current = null;
      fin();
    } else if (liveText || liveThinking || liveSteps.length) {
      setLiveText("");
      setLiveThinking("");
      setLiveSteps([]);
    }
  }, [streaming, liveText, liveThinking, liveSteps.length]);

  // Check for pending task on mount — shows Task Card instead of auto-firing
  useEffect(() => {
    const task = takePendingTask(estimate.id);
    if (task) {
      setActiveTask(task);
      setShowHistory(false);
      if (collapsed) onCollapsedChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate.id]);

  // Token smoothing: LLM streams arrive in large bursts (hundreds of chars per
  // SSE chunk). Rendering each burst directly makes text "jump" in blocks — or,
  // for short answers, appear all at once at the end. Instead, tokens are queued
  // and drained a few chars per tick, adaptively speeding up when the backlog
  // grows so display never lags the stream by more than ~1s.
  function enqueueLiveText(text: string) {
    queueRef.current += text;
    if (!typewriterRef.current) drainTick();
  }

  function drainTick() {
    const q = queueRef.current;
    if (!q) {
      typewriterRef.current = null;
      // Stream already ended and queue is drained → finalize now.
      if (!streamingRef.current && pendingFinalizeRef.current) {
        const fin = pendingFinalizeRef.current;
        pendingFinalizeRef.current = null;
        fin();
      }
      return;
    }
    const n = Math.max(1, Math.ceil(q.length / 100));
    queueRef.current = q.slice(n);
    setLiveText((prev) => prev + q.slice(0, n));
    typewriterRef.current = setTimeout(drainTick, TYPEWRITER_MS);
  }

  // ── Live drive: the agent operates the spreadsheet like a user ────────────
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  function a1ToRowCol(cell: string): { row: number; col: number } | null {
    const m = /^([A-Za-z]+)(\d+)$/.exec(cell.trim());
    if (!m) return null;
    let col = 0;
    for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { row: Number(m[2]) - 1, col: col - 1 };
  }

  const MAX_DRIVE_STEPS = 40;

  /**
   * Replays cell actions visually: activate sheet → move selection → write →
   * flash — so the user watches the AI edit the grid in real time.
   * Returns true only when EVERY action was driven into the grid; otherwise
   * the caller must fall back to a full editor reload.
   */
  async function driveActions(actions: Action[]): Promise<boolean> {
    const driver = workbookDriver?.current;
    if (!driver) return false;
    const cellActs = actions.filter(
      (a): a is Extract<Action, { type: "update_cells" }> => a.type === "update_cells"
    );
    if (cellActs.length === 0) return false;
    driver.beginDrive();
    try {
      for (const a of cellActs.slice(0, MAX_DRIVE_STEPS)) {
        const rc = a1ToRowCol(a.cell);
        if (!rc) continue;
        onAgentNavigate?.(a.sheetId);
        setDriveStatus(`Đang sửa ô ${a.cell} → ${a.newValue}`);
        driver.focusCell(a.sheetId, rc.row, rc.col);
        await sleep(320);
        driver.writeCell(a.sheetId, rc.row, rc.col, a.newValue);
        driver.flashCell(a.sheetId, rc.row, rc.col);
        await sleep(200);
      }
    } finally {
      driver.endDrive();
      setDriveStatus(null);
    }
    // Fully driven only if nothing was skipped or truncated
    return actions.length === cellActs.length && cellActs.length <= MAX_DRIVE_STEPS;
  }

  function toggleEditPermission() {
    const next = !editPermission;
    setEditPermission(next);
    localStorage.setItem(EDIT_PERM_KEY(estimate.id), next ? "1" : "0");
  }

  async function send(text?: string, attached?: File[]) {
    const message = (text ?? "").trim();
    const sentFiles = attached ?? [];
    if ((!message && sentFiles.length === 0) || streaming) return;

    // Cancel any running typewriter animation
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
      typewriterRef.current = null;
    }
    queueRef.current = "";

    setShowHistory(false);

    const userMsg: ConversationMessage = {
      id: nextId(),
      kind: "user",
      text: message || `📎 ${sentFiles.map((f) => f.name).join(", ")}`,
      timestamp: new Date().toISOString(),
    };

    const nextThread = [...thread, userMsg];
    setThread(nextThread);
    setLiveSteps([]);
    setLiveText("");
    setLiveThinking("");
    setStreaming(true);
    streamingRef.current = true;
    hasTokensRef.current = false;

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let finalThread = nextThread;

    try {
      await api.copilotStream(
        estimate.id,
        message,
        sentFiles,
        {
          signal: ctrl.signal,
          editPermission,
          onToken: (t: string) => {
            hasTokensRef.current = true;
            enqueueLiveText(t);
          },
          onThinking: (t: string) => setLiveThinking((prev) => prev + t),
          onStep: (s) =>
            setLiveSteps((prev) => [
              ...prev,
              { text: s.text, at: clockNow() },
            ]),
          onProposal: (p: CopilotProposal) => {
            const msgId = nextId();
            const ts = new Date().toISOString();
            const findings = (p as any).findings as
              | ReviewFinding[]
              | undefined;

            if (findings?.length) {
              onFindings?.(findings);
            }

            if (p.actions.length === 0) {
              // Read / review response
              const assistantMsg: ConversationMessage = {
                id: msgId,
                kind: "assistant",
                text: p.message,
                findings,
                timestamp: ts,
              };
              const nextFinalThread = [...nextThread, assistantMsg];
              finalThread = nextFinalThread;

              if (!hasTokensRef.current && p.message) {
                // Backend buffered the whole response (no token events) —
                // feed it through the same typewriter queue.
                enqueueLiveText(p.message);
              }
              pendingFinalizeRef.current = () => {
                setThread(nextFinalThread);
                setLiveText("");
                setLiveThinking("");
                setLiveSteps([]);
                saveConversation(nextFinalThread);
              };
            } else if (editPermission) {
              // Edit mode + actions → auto-apply, no confirmation
              if (typewriterRef.current) {
                clearTimeout(typewriterRef.current);
                typewriterRef.current = null;
              }
              queueRef.current = "";
              setLiveText("");
              setLiveThinking("");
              setLiveSteps([]);
              // Drive the edits live on the grid, then persist once
              driveActions(p.actions)
                .catch(() => false)
                .then((fullyDriven) =>
                  api.applyActions(estimateRef.current.id, p.actions, "ai").then((res) => ({ res, fullyDriven }))
                )
                .then(({ res, fullyDriven }) => {
                  if (fullyDriven && onEstimateSynced) onEstimateSynced(res.estimate);
                  else onEstimateUpdated(res.estimate);
                  const applied = res.applied ?? p.actions.length;
                  const diffText = buildAppliedDiff(p.actions);
                  const doneMsg: ConversationMessage = {
                    id: msgId,
                    kind: "assistant",
                    text: `${p.message}\n\n✓ Đã áp dụng ${applied} thay đổi.${diffText}`,
                    timestamp: ts,
                  };
                  const nextFinalThread = [...nextThread, doneMsg];
                  finalThread = nextFinalThread;
                  setThread(nextFinalThread);
                  saveConversation(nextFinalThread);
                })
                .catch((err: Error) => {
                  const errMsg: ConversationMessage = {
                    id: msgId,
                    kind: "error",
                    text: `⚠ Áp dụng thất bại: ${err.message}`,
                    timestamp: ts,
                  };
                  finalThread = [...nextThread, errMsg];
                  setThread(finalThread);
                });
            } else {
              // Edit mode OFF → show ProposalCard for manual confirmation
              const proposalMsg: ConversationMessage = {
                id: msgId,
                kind: "proposal",
                text: p.message,
                proposal: p,
                proposalState: "pending",
                timestamp: ts,
              };
              setProposals((prev) => [
                ...prev,
                { msgId, proposal: p, state: "pending", timestamp: ts },
              ]);
              finalThread = [...nextThread, proposalMsg];
              setThread(finalThread);
              // Actions proposal shows immediately — clear streaming bubble now
              if (typewriterRef.current) {
                clearTimeout(typewriterRef.current);
                typewriterRef.current = null;
              }
              queueRef.current = "";
              setLiveText("");
              setLiveThinking("");
              setLiveSteps([]);
            }
          },
          onError: (m: string) => {
            const errMsg: ConversationMessage = {
              id: nextId(),
              kind: "error",
              text: `⚠ ${m}`,
              timestamp: new Date().toISOString(),
            };
            finalThread = [...nextThread, errMsg];
            setThread(finalThread);
            pendingFinalizeRef.current = null;
            if (typewriterRef.current) {
              clearTimeout(typewriterRef.current);
              typewriterRef.current = null;
            }
            queueRef.current = "";
            setLiveText("");
            setLiveThinking("");
            setLiveSteps([]);
          },
        },
        activeSheetId,
        selectedRange,
        activeDrawingId ?? drawingViewport?.drawingId,
        selectedDrawingObject?.id,
        // Pack extended drawing context into a single field
        drawingViewport ? {
          page: drawingViewport.page,
          scale: drawingViewport.scale,
          activeTool: drawingViewport.activeTool,
          layer: drawingViewport.layer,
          objectType: drawingViewport.selectedObjectType,
        } : undefined
      );
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      abortRef.current = null;
      // Always persist — animation may not complete before user navigates away
      saveConversation(finalThread);
      if (!pendingFinalizeRef.current && !typewriterRef.current && !queueRef.current) {
        setLiveText("");
        setLiveThinking("");
        setLiveSteps([]);
      }
    }
  }

  async function applyProposal(item: ProposalItem) {
    setProposals((prev) =>
      prev.map((x) =>
        x.msgId === item.msgId ? { ...x, state: "applying" } : x
      )
    );
    let fullyDriven = false;
    try {
      fullyDriven = await driveActions(item.proposal.actions);
    } catch {
      fullyDriven = false;
    }
    try {
      const res = await api.applyActions(
        estimateRef.current.id,
        item.proposal.actions,
        "ai"
      );
      if (fullyDriven && onEstimateSynced) onEstimateSynced(res.estimate);
      else onEstimateUpdated(res.estimate);
      const applied = res.applied ?? item.proposal.actions.length;
      setProposals((prev) =>
        prev.map((x) =>
          x.msgId === item.msgId
            ? { ...x, state: "applied", appliedCount: applied }
            : x
        )
      );
      const nextThread = thread.map((x) =>
        x.id === item.msgId
          ? { ...x, proposalState: "applied" as const, appliedCount: applied }
          : x
      );
      setThread(nextThread);
      saveConversation(nextThread);
      if (res.warnings?.length)
        toast.error("Cảnh báo", res.warnings.join(", "));
    } catch (err) {
      toast.error("Áp dụng thất bại", (err as ApiError).message);
      setProposals((prev) =>
        prev.map((x) =>
          x.msgId === item.msgId ? { ...x, state: "pending" } : x
        )
      );
    }
  }

  function discardProposal(item: ProposalItem) {
    setProposals((prev) =>
      prev.map((x) =>
        x.msgId === item.msgId ? { ...x, state: "discarded" } : x
      )
    );
    const nextThread = thread.map((x) =>
      x.id === item.msgId
        ? { ...x, proposalState: "discarded" as const }
        : x
    );
    setThread(nextThread);
    saveConversation(nextThread);
  }

  async function handleRollback(patchId: string) {
    setRollbackLoadingId(patchId);
    try {
      const res = await api.rollback(estimateRef.current.id, patchId);
      onEstimateUpdated(res);
      toast.success("Khôi phục thành công", "Đã quay về phiên bản cũ.");
    } catch (err) {
      toast.error("Khôi phục thất bại", (err as ApiError).message);
    } finally {
      setRollbackLoadingId(undefined);
    }
  }

  // Expose send + injectMessage via controlRef
  useEffect(() => {
    if (!controlRef || typeof controlRef !== "object") return;
    (controlRef as React.MutableRefObject<AgentHandle>).current = {
      send: (text: string, files: File[]) => send(text, files),
      injectMessage: (msg) => {
        const full: ConversationMessage = {
          id: nextId(),
          kind: msg.kind,
          text: msg.text ?? "",
          timestamp: new Date().toISOString(),
        };
        setThread((prev) => [...prev, full]);
        setShowHistory(false);
      },
    };
  });

  // ── Collapsed rail ───────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => {
          onCollapsedChange(false);
          localStorage.setItem(COLLAPSED_KEY, "0");
        }}
        className="group flex w-12 shrink-0 flex-col items-center gap-3 border-l border-zinc-800 bg-zinc-950 py-4"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-[0_8px_24px_-8px_rgba(59,130,246,0.7)] transition-transform group-hover:scale-105">
          <SparkleIcon className="h-5 w-5" />
        </span>
        <span
          className="text-[11px] font-medium tracking-wide text-zinc-500 group-hover:text-zinc-300"
          style={{ writingMode: "vertical-rl" }}
        >
          Agent
        </span>
      </button>
    );
  }

  return (
    <aside
      className="flex shrink-0 flex-col border-l border-zinc-800 bg-zinc-950"
      style={{ width: width ?? 380, minWidth: 280, maxWidth: 640 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">
          <SparkleIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-zinc-200">QS Agent</h2>
        </div>
        {/* History (patch timeline + rollback) */}
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          title="Lịch sử thay đổi"
          className={cn(
            "rounded-lg p-1 transition-colors hover:bg-zinc-800",
            showHistory ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-200"
          )}
        >
          <HistoryIcon className="h-4 w-4" />
        </button>
        {/* Edit permission toggle */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">Edit</span>
          <button
            type="button"
            onClick={toggleEditPermission}
            title={editPermission ? "Tắt quyền chỉnh sửa" : "Bật quyền chỉnh sửa"}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              editPermission ? "bg-accent-500" : "bg-zinc-700"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                editPermission ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onCollapsedChange(true);
            localStorage.setItem(COLLAPSED_KEY, "1");
          }}
          className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Single surface: chat (history slides in via header toggle) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showHistory ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <HistoryTimeline
              history={estimate.patchHistory ?? []}
              onRollback={handleRollback}
              rollbackLoadingId={rollbackLoadingId}
            />
          </div>
        ) : (
          <ChatPanel
            thread={thread}
            proposals={proposals}
            streaming={streaming}
            typedTail={typedTail}
            caretActive={caretActive}
            liveThinking={liveThinking}
            driveStatus={driveStatus}
            liveSteps={liveSteps}
            historyLoaded={historyLoaded}
            editPermission={editPermission}
            activeTask={activeTask}
            estimateName={estimate.name}
            activeSheetId={activeSheetId}
            selectedRange={selectedRange}
            activeDrawingId={activeDrawingId}
            selectedDrawingObjectType={selectedDrawingObject?.type}
            onSend={send}
            onApplyProposal={applyProposal}
            onDiscardProposal={discardProposal}
            onClearTask={() => setActiveTask(null)}
            scrollRef={scrollRef}
            onScroll={handleChatScroll}
          />
        )}
      </div>
    </aside>
  );
}


// ── Chat Panel ───────────────────────────────────────────────────────────────

interface ChatPanelProps {
  thread: ConversationMessage[];
  proposals: ProposalItem[];
  streaming: boolean;
  typedTail: string;
  caretActive: boolean;
  liveThinking: string;
  driveStatus: string | null;
  liveSteps: TimelineStep[];
  historyLoaded: boolean;
  editPermission: boolean;
  activeTask: PendingTask | null;
  estimateName: string;
  activeSheetId?: string;
  selectedRange?: { startRow: number; startCol: number; endRow: number; endCol: number };
  activeDrawingId?: string;
  selectedDrawingObjectType?: string;
  onSend: (text?: string, files?: File[]) => void;
  onApplyProposal: (item: ProposalItem) => void;
  onDiscardProposal: (item: ProposalItem) => void;
  onClearTask: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

function colLetter(col: number): string {
  let letter = "";
  let n = col;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

function rangeToA1(r: { startRow: number; startCol: number; endRow: number; endCol: number }): string {
  const start = `${colLetter(r.startCol)}${r.startRow + 1}`;
  const end = `${colLetter(r.endCol)}${r.endRow + 1}`;
  return start === end ? start : `${start}:${end}`;
}

function ChatPanel({
  thread,
  proposals,
  streaming,
  typedTail,
  caretActive,
  liveThinking,
  driveStatus,
  liveSteps,
  historyLoaded,
  editPermission,
  activeTask,
  estimateName,
  activeSheetId: _activeSheetId,
  selectedRange,
  activeDrawingId,
  selectedDrawingObjectType,
  onSend,
  onApplyProposal,
  onDiscardProposal,
  onClearTask,
  scrollRef,
  onScroll,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const selectionLabel = selectedRange ? rangeToA1(selectedRange) : null;

  function runTask(prompt: string) {
    onClearTask();
    onSend(prompt, []);
  }

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {/* Task Card — shown when a home action navigated here */}
        {activeTask && (
          <TaskCard
            task={activeTask}
            estimateName={estimateName}
            onRun={runTask}
            onDismiss={onClearTask}
          />
        )}

        {!historyLoaded && (
          <div className="flex justify-center py-4">
            <span className="text-[12px] text-zinc-600">
              Đang tải lịch sử...
            </span>
          </div>
        )}
        {historyLoaded && thread.length === 0 && !streaming && !activeTask && (
          <ChatBubble
            role="assistant"
            text="Xin chào! Tôi là QS Agent. Tôi có thể đọc, phân tích và review Workbook dự toán của bạn."
          />
        )}
        {thread.map((item) => {
          if (item.kind === "user") {
            return (
              <ChatBubble key={item.id} role="user" text={item.text ?? ""} />
            );
          }
          if (item.kind === "error") {
            return (
              <ChatBubble
                key={item.id}
                role="assistant"
                text={item.text ?? ""}
                error
              />
            );
          }
          if (item.kind === "assistant") {
            return (
              <ChatBubble
                key={item.id}
                role="assistant"
                text={item.text ?? ""}
              />
            );
          }
          if (item.kind === "proposal" && item.proposal) {
            const proposalItem = proposals.find((p) => p.msgId === item.id);
            if (!proposalItem || proposalItem.proposal.actions.length === 0) {
              return (
                <ChatBubble
                  key={item.id}
                  role="assistant"
                  text={item.text || item.proposal.message}
                />
              );
            }
            return (
              <ProposalCard
                key={item.id}
                proposal={item.proposal}
                state={proposalItem.state}
                appliedCount={proposalItem.appliedCount}
                fresh={proposalItem.state === "pending"}
                onApply={() => onApplyProposal(proposalItem)}
                onDiscard={() => onDiscardProposal(proposalItem)}
                onViewActivity={() => {}}
              />
            );
          }
          return null;
        })}

        {/* Keep bubble visible while streaming OR while typewriter animation is still catching up.
            Without this, streaming=false hides the bubble before pendingFinalizeRef fires,
            causing the "all text at once" flash the user sees. */}
        {/* Agent is operating the grid — persistent indicator until drive ends */}
        {driveStatus && (
          <div className="flex animate-slide-up justify-start">
            <div className="flex max-w-[88%] items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-2 text-xs text-blue-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              <Bot className="h-3.5 w-3.5 shrink-0" />
              {driveStatus}
            </div>
          </div>
        )}
        {(streaming || !!typedTail) && (
          <div className="flex animate-slide-up justify-start">
            <div className="max-w-[88%] rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-sm text-zinc-200">
              {/* Live reasoning (Gemini thought summaries) — dim block above the answer */}
              {streaming && liveThinking && (
                <details className="mb-2 rounded-lg bg-zinc-950/60 px-2.5 py-1.5" open={!typedTail}>
                  <summary className="flex cursor-pointer items-center gap-1.5 text-[10px] font-medium text-zinc-500 select-none">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-accent-400" />
                    Đang suy nghĩ…
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] italic leading-relaxed text-zinc-500">
                    {liveThinking.length > 400 ? "…" + liveThinking.slice(-400) : liveThinking}
                  </p>
                </details>
              )}
              {/* Step chips — only while actively streaming, before first token */}
              {streaming && !typedTail && liveSteps.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {liveSteps.slice(-2).map((s, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400"
                    >
                      <span className="h-1 w-1 animate-pulse rounded-full bg-accent-400" />
                      {s.text}
                    </span>
                  ))}
                </div>
              )}
              {/* Streaming text — grows in-place via typewriter, persists until animation done */}
              {typedTail ? (
                <p className={cn("whitespace-pre-wrap leading-relaxed", caretActive && "type-caret")}>
                  {typedTail}
                </p>
              ) : streaming ? (
                <span className="flex gap-0.5 py-0.5">
                  {(["0ms", "160ms", "320ms"] as const).map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500"
                      style={{ animationDelay: d, animationDuration: "1s" }}
                    />
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {!editPermission && (
        <div className="flex items-center gap-1.5 border-t border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-500">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Chế độ đọc — bật <strong className="text-zinc-400">Edit</strong> để
            AI đề xuất thay đổi
          </span>
        </div>
      )}

      <div className="border-t border-zinc-800 p-3">
        {(selectionLabel || activeDrawingId) && (
          <div className="mb-2 flex items-center gap-1.5 flex-wrap">
            {selectionLabel && (
              <span className="flex items-center gap-1 rounded-md border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-[11px] text-accent-300">
                <MapPin className="h-3 w-3" />
                <span className="font-mono font-semibold">{selectionLabel}</span>
                <span className="text-accent-400/70">đang chọn</span>
              </span>
            )}
            {activeDrawingId && (
              <span className="flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-300">
                <Ruler className="h-3 w-3" />
                <span className="text-blue-400/70">Bản vẽ đang mở</span>
                {selectedDrawingObjectType && (
                  <span className="font-semibold ml-1">{selectedDrawingObjectType}</span>
                )}
              </span>
            )}
          </div>
        )}
        <CopilotComposer
          value={input}
          onChange={setInput}
          files={files}
          onAddFiles={(list) =>
            setFiles((prev) => [...prev, ...Array.from(list)])
          }
          onRemoveFile={(idx) =>
            setFiles((prev) => prev.filter((_, j) => j !== idx))
          }
          onSend={() => {
            onSend(input, files);
            setInput("");
            setFiles([]);
          }}
          loading={streaming}
        />
      </div>
    </>
  );
}

// ── Chat Bubble ───────────────────────────────────────────────────────────────

function ChatBubble({
  role,
  text,
  error,
}: {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "animate-slide-up max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm",
          isUser
            ? "bg-accent-600 text-white"
            : error
              ? "border border-rose-500/30 bg-rose-500/5 text-rose-200"
              : "border border-zinc-800 bg-zinc-900/70 text-zinc-200"
        )}
      >
        {text}
      </div>
    </div>
  );
}

export function readCopilotCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSED_KEY) === "1";
}
