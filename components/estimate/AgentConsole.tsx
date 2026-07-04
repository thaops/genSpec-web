"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import type {
  Action,
  AgentTaskState,
  AppliedActionsRecord,
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
import { CopilotComposer, type MentionItem } from "./CopilotComposer";
import { type TimelineStep } from "./LiveTimeline";
import { ProposalCard, type ProposalState } from "./ProposalCard";
import { HistoryTimeline } from "./HistoryTimeline";
import { SparkleIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Bot, History as HistoryIcon, Lock, MapPin, Pause, Ruler, Undo2 } from "lucide-react";
import { takePendingTask, type PendingTask } from "@/lib/pendingTask";
import { TaskCard } from "./TaskCard";
import { addJob, updateJob, appendJobLog } from "@/components/ui/JobCenter";

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

/** Options for a silent agent task — full prompt goes to the backend,
    the chat thread only shows the compact displayText. */
export interface RunTaskOptions {
  /** Full structured prompt sent to the backend */
  prompt: string;
  /** Compact user-bubble text shown (and persisted) in the thread */
  displayText: string;
  /** Short label for the JobCenter entry (falls back to displayText) */
  jobLabel?: string;
}

export interface AgentHandle {
  send: (text: string, files: File[]) => void;
  /** Run the copilot pipeline as a background task: chat shows displayText,
      progress is mirrored into the JobCenter, sidebar is NOT force-opened. */
  runTask: (opts: RunTaskOptions) => void;
  injectMessage: (msg: Pick<ConversationMessage, "kind" | "text">) => void;
  /** Inject a ready-made proposal (e.g. from the deterministic takeoff engine)
      into the thread as user bubble (displayText) + pending ProposalCard —
      NO streaming; the user applies it like any AI proposal (or confirms via
      the "oke làm đi" shortcut). Returns the proposal message id (pill deep-link). */
  injectProposal: (proposal: CopilotProposal, displayText: string) => string;
  /** Undo the patch created by an applied AI message (per-message undo logic) */
  undoPatch: (patchId: string) => void;
}

/** Snapshot of an applied proposal for the onActionsApplied callback. */
function toAppliedRecord(
  p: CopilotProposal,
  msgId: string,
  patchId: string | undefined
): AppliedActionsRecord {
  return {
    patchId,
    msgId,
    appliedAt: new Date().toISOString(),
    message:
      p.message.length > 200 ? p.message.slice(0, 200) + "…" : p.message,
    sources: p.sources ?? [],
    cells: p.actions
      .filter(
        (a): a is Extract<Action, { type: "update_cells" }> =>
          a.type === "update_cells"
      )
      .map((a) => ({
        sheetId: a.sheetId,
        cell: a.cell.toUpperCase(),
        oldValue: a.oldValue,
        newValue: a.newValue,
      })),
  };
}

interface ProposalItem {
  msgId: string;
  proposal: CopilotProposal;
  state: ProposalState;
  appliedCount?: number;
  timestamp: string;
}

/** Short affirmation → apply the pending proposal instead of calling the LLM
    (which tends to regenerate a new proposal with made-up numbers). */
const CONFIRM_RE =
  /^(ok(e|ê)?|đồng ý|áp dụng|apply|làm đi|chốt|duyệt|ừ|yes|confirm)[\s\S]{0,20}$/i;
function isConfirmIntent(message: string): boolean {
  if (message.length > 40) return false;
  const base = message.trim().replace(/[!.…?~]+$/g, "").trim();
  // Trailing particles (nhé/nha/đi/luôn/thôi) don't change intent — try both
  const stripped = base.replace(/\s+(nhé|nha|nhá|đi|luôn|thôi)$/i, "").trim();
  return CONFIRM_RE.test(base) || CONFIRM_RE.test(stripped);
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
  /** Called after each successful apply with the cell edits + provenance */
  onActionsApplied?: (record: AppliedActionsRecord) => void;
  /** Mirrors a silent runTask()'s lifecycle → page renders the floating pill.
      Regular send() (user chat) never triggers this. */
  onTaskStateChange?: (s: AgentTaskState | null) => void;
}

export function AgentConsole({
  estimate,
  drawings,
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
  onActionsApplied,
  onTaskStateChange,
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
  // F4: local (non-persisted) resume summary shown when reopening an old thread
  const [resumeSummary, setResumeSummary] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // F1: user requested drive stop (⏸ button or Escape)
  const driveAbortRef = useRef(false);
  const pendingFinalizeRef = useRef<(() => void) | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef("");
  const thinkingRef = useRef("");
  const streamingRef = useRef(false);
  const hasTokensRef = useRef(false);
  const idRef = useRef(0);
  const estimateRef = useRef(estimate);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll guard: don't yank the view down while the user reads history
  const isAtBottomRef = useRef(true);
  const prevThreadLenRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Silent agent task → JobCenter mirroring (set only while a runTask is live)
  const taskJobIdRef = useRef<string | null>(null);
  const taskStartRef = useRef(0);
  const taskStepCountRef = useRef(0);
  // Label of the live silent task — drives the floating pill on the page
  const taskLabelRef = useRef<string>("");

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

  // Load edit permission — defaults ON (agent-first); only an explicit "0" turns it off
  useEffect(() => {
    const saved = localStorage.getItem(EDIT_PERM_KEY(estimate.id));
    setEditPermission(saved !== "0");
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
        // F4: resume card when the last message is older than 30 minutes
        const last = msgs[msgs.length - 1];
        if (last && Date.now() - Date.parse(last.timestamp) > 30 * 60 * 1000) {
          const lines: string[] = [];
          const lastUser = [...msgs].reverse().find((m) => m.kind === "user");
          if (lastUser?.text) {
            const cut =
              lastUser.text.length > 100
                ? lastUser.text.slice(0, 100) + "…"
                : lastUser.text;
            lines.push(`Yêu cầu gần nhất: "${cut}"`);
          }
          const pending = msgs.filter(
            (m) =>
              m.kind === "proposal" &&
              m.proposal &&
              (m.proposalState ?? "pending") === "pending"
          ).length;
          if (pending > 0) {
            lines.push(`Còn ${pending} đề xuất chưa áp dụng — xem trong chat.`);
          }
          const ph = estimateRef.current.patchHistory ?? [];
          const lastPatch = ph[ph.length - 1];
          if (lastPatch?.description) {
            lines.push(`Thay đổi gần nhất: ${lastPatch.description}`);
          }
          if (lines.length > 0) {
            setResumeSummary(`👋 Phiên trước:\n${lines.join("\n")}`);
          }
        }
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

  // Sidebar re-opened (e.g. via the floating task pill) → land the user on
  // the chat surface at the newest message, not the history view.
  useEffect(() => {
    if (collapsed) return;
    setShowHistory(false);
    const t = window.setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      isAtBottomRef.current = true;
    }, 60);
    return () => window.clearTimeout(t);
  }, [collapsed]);

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

  const MAX_DRIVE_STEPS = 60;

  // Non-cell actions that do NOT touch sheet cellData — after a full live
  // drive of the cells, the grid is already correct and must not be reloaded
  // (a reinit right after the animation destroys the "AI is typing" feel).
  const SHEET_TOUCHING_TYPES = new Set(["set_sheets", "clear"]);

  interface DriveResult {
    fullyDriven: boolean;
    /** User pressed ⏸ / Escape mid-drive — caller must NOT persist */
    aborted: boolean;
  }

  /**
   * Replays cell actions visually: activate sheet → move selection → write →
   * flash — so the user watches the AI edit the grid in real time.
   * `fullyDriven` is true only when EVERY action was driven into the grid;
   * otherwise the caller must fall back to a full editor reload.
   */
  async function driveActions(actions: Action[]): Promise<DriveResult> {
    const driver = workbookDriver?.current;
    if (!driver) return { fullyDriven: false, aborted: false };
    const cellActs = actions.filter(
      (a): a is Extract<Action, { type: "update_cells" }> => a.type === "update_cells"
    );
    if (cellActs.length === 0) return { fullyDriven: false, aborted: false };
    driveAbortRef.current = false;
    let aborted = false;
    driver.beginDrive();
    try {
      for (const a of cellActs.slice(0, MAX_DRIVE_STEPS)) {
        if (driveAbortRef.current) {
          aborted = true;
          break;
        }
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
    // Fully driven only if nothing was skipped, truncated or aborted
    return {
      fullyDriven:
        !aborted &&
        cellActs.length <= MAX_DRIVE_STEPS &&
        !actions.some(
          (a) => a.type !== "update_cells" && SHEET_TOUCHING_TYPES.has(a.type)
        ),
      aborted,
    };
  }

  const stopDrive = useCallback(() => {
    driveAbortRef.current = true;
  }, []);

  // F1: Escape stops the drive — listener active only while driving
  const isDriving = driveStatus !== null;
  useEffect(() => {
    if (!isDriving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") driveAbortRef.current = true;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDriving]);

  /** F1: after an aborted drive — reload server state to revert visual writes */
  async function revertDrive() {
    try {
      const fresh = await api.getEstimate(estimateRef.current.id);
      onEstimateUpdated(fresh);
    } catch {
      /* keep current view; server state unchanged anyway */
    }
  }

  // F3: @-mention suggestions — sheets, current selection, drawings, selected object
  const mentionItems = useMemo<MentionItem[]>(() => {
    const items: MentionItem[] = [];
    for (const s of estimate.sheets ?? []) {
      items.push({ label: s.name, kind: "sheet", sheetId: s.id });
    }
    if (selectedRange) items.push({ label: "vùng chọn", kind: "selection" });
    for (const d of drawings ?? []) {
      items.push({ label: d.name, kind: "drawing" });
    }
    if (selectedDrawingObject) {
      items.push({ label: selectedDrawingObject.type, kind: "object" });
    }
    return items;
  }, [estimate.sheets, selectedRange, drawings, selectedDrawingObject]);

  function toggleEditPermission() {
    const next = !editPermission;
    setEditPermission(next);
    localStorage.setItem(EDIT_PERM_KEY(estimate.id), next ? "1" : "0");
  }

  /** Finalize the JobCenter entry of a live silent task (if any). */
  function finishTaskJob(
    status: "done" | "failed",
    message?: string
  ) {
    const jobId = taskJobIdRef.current;
    if (!jobId) return;
    taskJobIdRef.current = null;
    updateJob(jobId, {
      status,
      progress: status === "done" ? 100 : undefined,
      message,
      durationMs: Date.now() - taskStartRef.current,
    });
    if (message) {
      appendJobLog(jobId, status === "done" ? "info" : "error", message);
    }
  }

  /** Silent agent task: same send() pipeline, but the chat bubble shows a
      compact displayText and progress is mirrored into the JobCenter.
      Does NOT force the sidebar open — the collapsed rail pulses instead. */
  function runTask({ prompt, displayText, jobLabel }: RunTaskOptions) {
    if (streamingRef.current) {
      toast.error("Agent đang bận", "Đợi tác vụ hiện tại hoàn tất rồi thử lại.");
      return;
    }
    const job = addJob({
      id: `agent-task-${Date.now()}`,
      type: "agent_task",
      status: "processing",
      progress: 5,
      message: jobLabel ?? displayText,
    });
    taskJobIdRef.current = job.id;
    taskStartRef.current = Date.now();
    taskStepCountRef.current = 0;
    taskLabelRef.current = jobLabel ?? displayText;
    onTaskStateChange?.({
      label: taskLabelRef.current,
      step: "Đang khởi động…",
      status: "running",
    });
    // Agent tasks (⚡ takeoff, generate-takeoff) are inherently edit actions —
    // they must reach the edit handler regardless of the Edit toggle. Safety is
    // preserved: with the toggle off the result is a ProposalCard the user
    // still has to Apply, never an auto-apply.
    void send(prompt, [], { displayText, forceEdit: true });
  }

  async function send(
    text?: string,
    attached?: File[],
    opts?: { displayText?: string; forceEdit?: boolean }
  ) {
    const message = (text ?? "").trim();
    const sentFiles = attached ?? [];
    if ((!message && sentFiles.length === 0) || streaming) return;

    // Confirm-intent shortcut: "oke"/"làm đi"/"áp dụng"… + a pending proposal
    // → apply it directly, skip the LLM round-trip entirely.
    if (message && sentFiles.length === 0 && isConfirmIntent(message)) {
      const pending = [...proposals]
        .reverse()
        .find((p) => p.state === "pending" && p.proposal.actions.length > 0);
      if (pending) {
        setShowHistory(false);
        const ts = new Date().toISOString();
        const confirmUserMsg: ConversationMessage = {
          id: nextId(),
          kind: "user",
          text: opts?.displayText ?? message,
          timestamp: ts,
        };
        const ackMsg: ConversationMessage = {
          id: nextId(),
          kind: "assistant",
          text: `✓ Áp dụng đề xuất đang chờ (${pending.proposal.actions.length} thay đổi).`,
          timestamp: ts,
        };
        const confirmThread = [...thread, confirmUserMsg, ackMsg];
        setThread(confirmThread);
        saveConversation(confirmThread);
        await applyProposal(pending, confirmThread);
        return;
      }
      // Confirmation with nothing pending → fall through to the normal LLM path
    }

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
      // Silent tasks persist the compact displayText, never the long prompt.
      // Trade-off: resending from history won't have the original prompt.
      text:
        opts?.displayText ??
        (message || `📎 ${sentFiles.map((f) => f.name).join(", ")}`),
      timestamp: new Date().toISOString(),
    };

    const nextThread = [...thread, userMsg];
    setThread(nextThread);
    setLiveSteps([]);
    setLiveText("");
    setLiveThinking("");
    thinkingRef.current = "";
    setStreaming(true);
    streamingRef.current = true;
    hasTokensRef.current = false;

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let finalThread = nextThread;

    // F3: a mentioned sheet (@[Tên sheet]) overrides activeSheetId for this request
    let requestSheetId = activeSheetId;
    for (const m of message.matchAll(/@\[([^\]]+)\]/g)) {
      const sheet = (estimateRef.current.sheets ?? []).find(
        (s) => s.name === m[1]
      );
      if (sheet && sheet.id !== activeSheetId) {
        requestSheetId = sheet.id;
        break;
      }
    }

    try {
      await api.copilotStream(
        estimate.id,
        message,
        sentFiles,
        {
          signal: ctrl.signal,
          editPermission: opts?.forceEdit ? true : editPermission,
          onToken: (t: string) => {
            hasTokensRef.current = true;
            enqueueLiveText(t);
          },
          onThinking: (t: string) => {
            thinkingRef.current += t;
            setLiveThinking((prev) => prev + t);
          },
          onStep: (s) => {
            setLiveSteps((prev) => [
              ...prev,
              { text: s.text, at: clockNow() },
            ]);
            const jobId = taskJobIdRef.current;
            if (jobId) {
              taskStepCountRef.current += 1;
              updateJob(jobId, {
                message: s.text,
                progress: Math.min(90, 10 + taskStepCountRef.current * 8),
              });
              appendJobLog(jobId, "info", s.text);
              onTaskStateChange?.({
                label: taskLabelRef.current,
                step: s.text,
                status: "running",
              });
            }
          },
          onProposal: (p: CopilotProposal) => {
            const wasTask = taskJobIdRef.current != null;
            finishTaskJob(
              "done",
              p.actions.length > 0
                ? `Hoàn tất — ${p.actions.length} đề xuất thay đổi`
                : "Hoàn tất"
            );
            const msgId = nextId();
            if (wasTask) {
              onTaskStateChange?.({
                label: taskLabelRef.current,
                step:
                  p.actions.length > 0
                    ? `${p.actions.length} đề xuất thay đổi`
                    : "Hoàn tất",
                status: "done",
                proposalMsgId: msgId,
              });
            }
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
                text:
                  p.message ||
                  "⚠ AI không trả về nội dung — hãy gửi lại hoặc diễn đạt câu hỏi rõ hơn.",
                thinking: thinkingRef.current || undefined,
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
                .catch(() => ({ fullyDriven: false, aborted: false }))
                .then(async ({ fullyDriven, aborted }) => {
                  if (aborted) {
                    // F1: user stopped — revert visual writes, keep proposal pending
                    await revertDrive();
                    const proposalMsg: ConversationMessage = {
                      id: msgId,
                      kind: "proposal",
                      text: p.message,
                      proposal: p,
                      proposalState: "pending",
                      timestamp: ts,
                    };
                    const stopMsg: ConversationMessage = {
                      id: nextId(),
                      kind: "assistant",
                      text: "⏸ Đã dừng — không có thay đổi nào được lưu. Bạn có thể Áp dụng lại đề xuất bên trên.",
                      timestamp: new Date().toISOString(),
                    };
                    setProposals((prev) => [
                      ...prev,
                      { msgId, proposal: p, state: "pending", timestamp: ts },
                    ]);
                    finalThread = [...nextThread, proposalMsg, stopMsg];
                    setThread(finalThread);
                    saveConversation(finalThread);
                    return;
                  }
                  const res = await api.applyActions(
                    estimateRef.current.id,
                    p.actions,
                    "ai"
                  );
                  if (fullyDriven && onEstimateSynced) onEstimateSynced(res.estimate);
                  else onEstimateUpdated(res.estimate);
                  const applied = res.applied ?? p.actions.length;
                  const diffText = buildAppliedDiff(p.actions);
                  const history = res.estimate.patchHistory ?? [];
                  const doneMsg: ConversationMessage = {
                    id: msgId,
                    kind: "assistant",
                    text: `${p.message}\n\n✓ Đã áp dụng ${applied} thay đổi.${diffText}`,
                    patchId: history[history.length - 1]?.id,
                    timestamp: ts,
                  };
                  const nextFinalThread = [...nextThread, doneMsg];
                  finalThread = nextFinalThread;
                  setThread(nextFinalThread);
                  saveConversation(nextFinalThread);
                  onActionsApplied?.(
                    toAppliedRecord(p, msgId, doneMsg.patchId)
                  );
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
            const wasTask = taskJobIdRef.current != null;
            finishTaskJob("failed", m);
            if (wasTask) {
              onTaskStateChange?.({
                label: taskLabelRef.current,
                step: m,
                status: "error",
              });
            }
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
        requestSheetId,
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
      // Stream ended without a proposal or error event (e.g. aborted)
      const danglingTask = taskJobIdRef.current != null;
      finishTaskJob("failed", "Tác vụ kết thúc mà không có kết quả");
      if (danglingTask) {
        onTaskStateChange?.({
          label: taskLabelRef.current,
          step: "Tác vụ kết thúc mà không có kết quả",
          status: "error",
        });
      }
      // Always persist — animation may not complete before user navigates away
      saveConversation(finalThread);
      if (!pendingFinalizeRef.current && !typewriterRef.current && !queueRef.current) {
        setLiveText("");
        setLiveThinking("");
        setLiveSteps([]);
      }
    }
  }

  // baseThread: caller just appended messages in the same tick — the `thread`
  // closure would be stale and drop them (confirm-intent shortcut passes it).
  async function applyProposal(
    item: ProposalItem,
    baseThread?: ConversationMessage[]
  ) {
    setProposals((prev) =>
      prev.map((x) =>
        x.msgId === item.msgId ? { ...x, state: "applying" } : x
      )
    );
    let fullyDriven = false;
    try {
      const drive = await driveActions(item.proposal.actions);
      if (drive.aborted) {
        // F1: user stopped — revert visual writes, keep proposal pending
        await revertDrive();
        setProposals((prev) =>
          prev.map((x) =>
            x.msgId === item.msgId ? { ...x, state: "pending" } : x
          )
        );
        setThread((prev) => [
          ...prev,
          {
            id: nextId(),
            kind: "assistant",
            text: "⏸ Đã dừng — không có thay đổi nào được lưu.",
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }
      fullyDriven = drive.fullyDriven;
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
      const history = res.estimate.patchHistory ?? [];
      const patchId = history[history.length - 1]?.id;
      setProposals((prev) =>
        prev.map((x) =>
          x.msgId === item.msgId
            ? { ...x, state: "applied", appliedCount: applied }
            : x
        )
      );
      const nextThread = (baseThread ?? thread).map((x) =>
        x.id === item.msgId
          ? { ...x, proposalState: "applied" as const, appliedCount: applied, patchId }
          : x
      );
      setThread(nextThread);
      saveConversation(nextThread);
      onActionsApplied?.(toAppliedRecord(item.proposal, item.msgId, patchId));
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

  // F2: per-message undo — rolls back the patch created by that message
  async function undoMessage(msg: ConversationMessage) {
    if (!msg.patchId) return;
    if (
      !window.confirm(
        "Hoàn tác thay đổi này? Các thay đổi sau đó (nếu có) cũng sẽ bị hoàn tác."
      )
    )
      return;
    setRollbackLoadingId(msg.patchId);
    try {
      const res = await api.rollback(estimateRef.current.id, msg.patchId);
      onEstimateUpdated(res);
      const undoneMsg: ConversationMessage = {
        id: nextId(),
        kind: "assistant",
        text: "↩ Đã hoàn tác thay đổi.",
        timestamp: new Date().toISOString(),
      };
      setThread((prev) => {
        const next = [
          ...prev.map((x) => (x.id === msg.id ? { ...x, undone: true } : x)),
          undoneMsg,
        ];
        saveConversation(next);
        return next;
      });
    } catch (err) {
      toast.error("Hoàn tác thất bại", (err as ApiError).message);
    } finally {
      setRollbackLoadingId(undefined);
    }
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
      runTask,
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
      injectProposal: (proposal, displayText) => {
        const ts = new Date().toISOString();
        const userMsg: ConversationMessage = {
          id: nextId(),
          kind: "user",
          text: displayText,
          timestamp: ts,
        };
        const msgId = nextId();
        const proposalMsg: ConversationMessage = {
          id: msgId,
          kind: "proposal",
          text: proposal.message,
          proposal,
          proposalState: "pending",
          timestamp: ts,
        };
        const nextThread = [...thread, userMsg, proposalMsg];
        setThread(nextThread);
        setProposals((prev) => [
          ...prev,
          { msgId, proposal, state: "pending", timestamp: ts },
        ]);
        setShowHistory(false);
        saveConversation(nextThread);
        return msgId;
      },
      undoPatch: (patchId: string) => {
        // Reuse per-message undo when the source message is in the thread;
        // otherwise undo the patch via a synthetic message reference.
        const msg = thread.find((m) => m.patchId === patchId && !m.undone);
        undoMessage(
          msg ?? {
            id: "",
            kind: "assistant",
            patchId,
            timestamp: new Date().toISOString(),
          }
        );
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
        <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-[0_8px_24px_-8px_rgba(59,130,246,0.7)] transition-transform group-hover:scale-105">
          <SparkleIcon className="h-5 w-5" />
          {/* Agent running indicator — click the rail to watch progress */}
          {streaming && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-zinc-950 bg-emerald-400" />
          )}
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
        {/* Mode: Đọc (chat-only) / Sửa (agent can propose & apply edits) */}
        <div
          className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/70 p-0.5"
          title={
            editPermission
              ? "Chế độ Sửa — AI được tạo đề xuất và ghi vào bảng tính"
              : "Chế độ Đọc — AI chỉ trả lời, không sửa dữ liệu"
          }
        >
          <button
            type="button"
            onClick={() => editPermission && toggleEditPermission()}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
              !editPermission
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Đọc
          </button>
          <button
            type="button"
            onClick={() => !editPermission && toggleEditPermission()}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
              editPermission
                ? "bg-accent-600 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            ✎ Sửa
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
            onStopDrive={stopDrive}
            mentionItems={mentionItems}
            patchIds={(estimate.patchHistory ?? []).map((p) => p.id)}
            onUndoMessage={undoMessage}
            undoLoadingPatchId={rollbackLoadingId}
            resumeSummary={resumeSummary}
            onResumeContinue={() => {
              setResumeSummary(null);
              send("Tiếp tục việc đang làm dở dựa trên hội thoại trước", []);
            }}
            onResumeDismiss={() => setResumeSummary(null)}
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
  onStopDrive: () => void;
  mentionItems: MentionItem[];
  patchIds: string[];
  onUndoMessage: (msg: ConversationMessage) => void;
  undoLoadingPatchId?: string;
  resumeSummary: string | null;
  onResumeContinue: () => void;
  onResumeDismiss: () => void;
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
  onStopDrive,
  mentionItems,
  patchIds,
  onUndoMessage,
  undoLoadingPatchId,
  resumeSummary,
  onResumeContinue,
  onResumeDismiss,
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

        {/* F4: resume card — local only, never persisted */}
        {historyLoaded && resumeSummary && (
          <div className="animate-slide-up rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-3 text-sm text-zinc-200">
            <p className="whitespace-pre-line">{resumeSummary}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onResumeContinue}
                className="rounded-full border border-accent-500/40 bg-accent-500/10 px-3 py-1 text-[12px] text-accent-200 transition-colors hover:bg-accent-500/20"
              >
                Tiếp tục việc đang dở
              </button>
              <button
                type="button"
                onClick={onResumeDismiss}
                className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-[12px] text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Việc mới
              </button>
            </div>
          </div>
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
          // F2: undo button available while the patch is still in history
          const canUndo =
            !!item.patchId && !item.undone && patchIds.includes(item.patchId);
          const undoBtn = canUndo ? (
            <UndoButton
              loading={undoLoadingPatchId === item.patchId}
              onClick={() => onUndoMessage(item)}
            />
          ) : null;
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
              <div key={item.id}>
                <ChatBubble role="assistant" text={item.text ?? ""} thinking={item.thinking} />
                {undoBtn}
              </div>
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
              <div key={item.id}>
                <ProposalCard
                  proposal={item.proposal}
                  state={proposalItem.state}
                  appliedCount={proposalItem.appliedCount}
                  fresh={proposalItem.state === "pending"}
                  onApply={() => onApplyProposal(proposalItem)}
                  onDiscard={() => onDiscardProposal(proposalItem)}
                  onViewActivity={() => {}}
                />
                {proposalItem.state === "applied" && undoBtn}
              </div>
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
              <button
                type="button"
                onClick={onStopDrive}
                title="Dừng (Esc)"
                className="ml-1 flex shrink-0 items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-100 transition-colors hover:bg-blue-500/30"
              >
                <Pause className="h-3 w-3" />
                Dừng
              </button>
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
          mentionItems={mentionItems}
        />
      </div>
    </>
  );
}

// F2: small "undo this message" affordance under an applied bubble/card
function UndoButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
    >
      <Undo2 className="h-3 w-3" />
      {loading ? "Đang hoàn tác…" : "Hoàn tác"}
    </button>
  );
}

// ── Chat Bubble ───────────────────────────────────────────────────────────────

function ChatBubble({
  role,
  text,
  error,
  thinking,
}: {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
  thinking?: string;
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
        {thinking && !isUser && (
          <details className="mb-1.5 rounded-lg bg-zinc-950/60 px-2.5 py-1.5">
            <summary className="cursor-pointer select-none text-[10px] font-medium text-zinc-500">
              💭 Suy nghĩ của AI
            </summary>
            <p className="mt-1 whitespace-pre-line text-[11px] italic leading-relaxed text-zinc-500">
              {thinking}
            </p>
          </details>
        )}
        {text}
      </div>
    </div>
  );
}

export function readCopilotCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSED_KEY) === "1";
}
