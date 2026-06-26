"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ref } from "react";
import type {
  ConversationMessage,
  CopilotProposal,
  Estimate,
  ReviewFinding,
} from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useSmoothStream } from "@/lib/hooks";
import { CopilotComposer } from "./CopilotComposer";
import { LiveTimeline, type TimelineStep } from "./LiveTimeline";
import { ProposalCard, type ProposalState } from "./ProposalCard";
import { HistoryTimeline } from "./HistoryTimeline";
import { SparkleIcon, ChevronRightIcon } from "@/components/ui/icons";
import { takePendingTask, type PendingTask } from "@/lib/pendingTask";
import { TaskCard } from "./TaskCard";

export interface AgentHandle {
  send: (text: string, files: File[]) => void;
}

type AgentTab = "plan" | "review" | "proposals" | "history" | "chat";

interface ProposalItem {
  msgId: string;
  proposal: CopilotProposal;
  state: ProposalState;
  appliedCount?: number;
  timestamp: string;
}

const EDIT_PERM_KEY = (id: string) => `genspec_edit_perm_${id}`;
const COLLAPSED_KEY = "genspec_copilot_collapsed";

interface Props {
  estimate: Estimate;
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
}: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<AgentTab>("chat");
  const [thread, setThread] = useState<ConversationMessage[]>([]);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [reviewFindings, setReviewFindings] = useState<ReviewFinding[]>([]);
  const [liveSteps, setLiveSteps] = useState<TimelineStep[]>([]);
  const [liveText, setLiveText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [editPermission, setEditPermission] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [rollbackLoadingId, setRollbackLoadingId] = useState<
    string | undefined
  >();
  const [activeTask, setActiveTask] = useState<PendingTask | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingFinalizeRef = useRef<(() => void) | null>(null);
  const hasTokensRef = useRef(false);
  const idRef = useRef(0);
  const estimateRef = useRef(estimate);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typed = useSmoothStream(liveText);
  const typedTail =
    typed.length > 1400 ? "…" + typed.slice(-1400) : typed;
  const caretActive = streaming && typed.length < liveText.length;

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

  // Auto-scroll chat
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [thread, liveSteps, streaming]);

  // Cleanup abort on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

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

  // Finalize after animation catches up with liveText
  useEffect(() => {
    if (streaming) return;
    if (!liveText) return;
    if (typed.length < liveText.length) return;
    if (pendingFinalizeRef.current) {
      pendingFinalizeRef.current();
      pendingFinalizeRef.current = null;
    } else {
      setLiveText("");
      setLiveSteps([]);
    }
  }, [streaming, typed, liveText]);

  // Check for pending task on mount — shows Task Card instead of auto-firing
  useEffect(() => {
    const task = takePendingTask(estimate.id);
    if (task) {
      setActiveTask(task);
      setTab("chat");
      if (collapsed) onCollapsedChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate.id]);

  function toggleEditPermission() {
    const next = !editPermission;
    setEditPermission(next);
    localStorage.setItem(EDIT_PERM_KEY(estimate.id), next ? "1" : "0");
  }

  async function send(text?: string, attached?: File[]) {
    const message = (text ?? "").trim();
    const sentFiles = attached ?? [];
    if ((!message && sentFiles.length === 0) || streaming) return;

    setTab("chat");

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
    setStreaming(true);
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
            setLiveText((prev) => prev + t);
          },
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
              setReviewFindings(findings);
              onFindings?.(findings);
            }

            if (p.actions.length === 0) {
              // Read / review response — keep animation alive, finalize after typed catches up
              const assistantMsg: ConversationMessage = {
                id: msgId,
                kind: "assistant",
                text: p.message,
                findings,
                timestamp: ts,
              };
              const nextFinalThread = [...nextThread, assistantMsg];
              finalThread = nextFinalThread;
              // Seed liveText only when no tokens arrived (proxy-buffered response).
              // Use a ref — closure captures liveText="" from send() start, making !liveText always true.
              if (!hasTokensRef.current && p.message) setLiveText(p.message);
              pendingFinalizeRef.current = () => {
                setThread(nextFinalThread);
                setLiveText("");
                setLiveSteps([]);
                saveConversation(nextFinalThread);
              };
            } else if (editPermission) {
              // Edit mode + actions → auto-apply, no confirmation
              setLiveText("");
              setLiveSteps([]);
              api.applyActions(estimateRef.current.id, p.actions, "ai")
                .then((res) => {
                  onEstimateUpdated(res.estimate);
                  const applied = res.applied ?? p.actions.length;
                  const doneMsg: ConversationMessage = {
                    id: msgId,
                    kind: "assistant",
                    text: `${p.message}\n\n✓ Đã áp dụng ${applied} thay đổi.`,
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
              setLiveText("");
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
            setLiveText("");
            setLiveSteps([]);
          },
        },
        activeSheetId,
        selectedRange
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Always persist — animation may not complete before user navigates away
      saveConversation(finalThread);
      if (!pendingFinalizeRef.current) {
        setLiveText("");
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
    try {
      const res = await api.applyActions(
        estimateRef.current.id,
        item.proposal.actions,
        "ai"
      );
      onEstimateUpdated(res.estimate);
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

  // Expose send via controlRef
  useEffect(() => {
    if (!controlRef || typeof controlRef !== "object") return;
    (controlRef as React.MutableRefObject<AgentHandle>).current = {
      send: (text: string, files: File[]) => send(text, files),
    };
  });

  // ── Collapsed rail ───────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange(false)}
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

  const pendingProposals = proposals.filter((p) => p.state === "pending").length;
  const criticalCount = reviewFindings.filter((f) => f.severity === "critical").length;
  const warningCount = reviewFindings.filter((f) => f.severity === "warning").length;

  const TAB_LABELS: Record<AgentTab, string> = {
    plan: "Plan",
    review: "Review",
    proposals: "Proposals",
    history: "History",
    chat: "Chat",
  };

  return (
    <aside className="flex w-full max-w-[440px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">
          <SparkleIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-zinc-200">QS Agent</h2>
        </div>
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

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-zinc-800 px-2 py-1">
        {(["plan", "review", "proposals", "history", "chat"] as AgentTab[]).map(
          (t) => {
            const badge =
              t === "proposals" && pendingProposals > 0
                ? pendingProposals
                : t === "review" && criticalCount + warningCount > 0
                  ? criticalCount + warningCount
                  : null;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                  tab === t
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {TAB_LABELS[t]}
                {badge != null && (
                  <span
                    className={cn(
                      "rounded-full px-1 text-[10px]",
                      t === "proposals"
                        ? "bg-accent-500/20 text-accent-300"
                        : criticalCount > 0
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-amber-500/20 text-amber-300"
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          }
        )}
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "plan" && (
          <PlanPanel steps={liveSteps} streaming={streaming} />
        )}
        {tab === "review" && (
          <ReviewPanel
            findings={reviewFindings}
            onFindingClick={onFindings}
          />
        )}
        {tab === "proposals" && (
          <ProposalsPanel
            proposals={proposals}
            onApply={applyProposal}
            onDiscard={discardProposal}
          />
        )}
        {tab === "history" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <HistoryTimeline
              history={estimate.patchHistory ?? []}
              onRollback={handleRollback}
              rollbackLoadingId={rollbackLoadingId}
            />
          </div>
        )}
        {tab === "chat" && (
          <ChatPanel
            thread={thread}
            proposals={proposals}
            streaming={streaming}
            typedTail={typedTail}
            caretActive={caretActive}
            liveSteps={liveSteps}
            historyLoaded={historyLoaded}
            editPermission={editPermission}
            activeTask={activeTask}
            estimateName={estimate.name}
            activeSheetId={activeSheetId}
            selectedRange={selectedRange}
            onSend={send}
            onApplyProposal={applyProposal}
            onDiscardProposal={discardProposal}
            onSwitchToProposals={() => setTab("proposals")}
            onClearTask={() => setActiveTask(null)}
            scrollRef={scrollRef}
          />
        )}
      </div>
    </aside>
  );
}

// ── Plan Panel ───────────────────────────────────────────────────────────────

function PlanPanel({
  steps,
  streaming,
}: {
  steps: TimelineStep[];
  streaming: boolean;
}) {
  if (steps.length === 0 && !streaming) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div>
          <div className="mb-3 text-3xl">🤖</div>
          <p className="text-sm font-medium text-zinc-400">Agent sẵn sàng</p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Kế hoạch hiển thị khi Agent đang xử lý
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <LiveTimeline steps={steps} streaming={streaming} />
    </div>
  );
}

// ── Review Panel ─────────────────────────────────────────────────────────────

function ReviewPanel({
  findings,
  onFindingClick,
}: {
  findings: ReviewFinding[];
  onFindingClick?: (findings: ReviewFinding[]) => void;
}) {
  if (findings.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div>
          <div className="mb-3 text-3xl">✅</div>
          <p className="text-sm font-medium text-zinc-400">
            Chưa có kết quả review
          </p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Nhập &ldquo;kiểm tra workbook&rdquo; để chạy Review
          </p>
        </div>
      </div>
    );
  }

  const critical = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const info = findings.filter((f) => f.severity === "info");
  const health = Math.max(
    0,
    100 - critical.length * 15 - warnings.length * 5 - info.length
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-zinc-800 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-zinc-200">
            Workbook Health
          </span>
          <span
            className={cn(
              "text-xl font-bold",
              health >= 90
                ? "text-emerald-400"
                : health >= 70
                  ? "text-amber-400"
                  : "text-rose-400"
            )}
          >
            {health}%
          </span>
        </div>
        <div className="flex gap-3 text-[12px]">
          {critical.length > 0 && (
            <span className="text-rose-400">🔴 {critical.length} Critical</span>
          )}
          {warnings.length > 0 && (
            <span className="text-amber-400">
              🟡 {warnings.length} Warnings
            </span>
          )}
          {info.length > 0 && (
            <span className="text-zinc-400">🔵 {info.length} Info</span>
          )}
        </div>
      </div>
      <div className="divide-y divide-zinc-800/50">
        {findings.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFindingClick?.([f])}
            className="w-full px-4 py-3 text-left transition-colors hover:bg-zinc-900/50"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-[13px]">
                {f.severity === "critical"
                  ? "🔴"
                  : f.severity === "warning"
                    ? "🟡"
                    : "🔵"}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] leading-snug text-zinc-200">
                  {f.message}
                </p>
                {f.suggestion && (
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {f.suggestion}
                  </p>
                )}
                {f.area && (
                  <span className="mt-1 inline-block rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                    {f.area}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Proposals Panel ──────────────────────────────────────────────────────────

function ProposalsPanel({
  proposals,
  onApply,
  onDiscard,
}: {
  proposals: ProposalItem[];
  onApply: (item: ProposalItem) => void;
  onDiscard: (item: ProposalItem) => void;
}) {
  if (proposals.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div>
          <div className="mb-3 text-3xl">📋</div>
          <p className="text-sm font-medium text-zinc-400">Chưa có đề xuất</p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Bật Edit và yêu cầu AI chỉnh sửa để tạo Proposal
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 divide-y divide-zinc-800/50 overflow-y-auto">
      {[...proposals].reverse().map((item) => (
        <div key={item.msgId} className="p-3">
          <ProposalCard
            proposal={item.proposal}
            state={item.state}
            appliedCount={item.appliedCount}
            fresh={item.state === "pending"}
            onApply={() => onApply(item)}
            onDiscard={() => onDiscard(item)}
            onViewActivity={() => { }}
          />
          <p className="mt-1 px-1 text-[10px] text-zinc-600">
            {new Date(item.timestamp).toLocaleTimeString("vi-VN")}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Chat Panel ───────────────────────────────────────────────────────────────

interface ChatPanelProps {
  thread: ConversationMessage[];
  proposals: ProposalItem[];
  streaming: boolean;
  typedTail: string;
  caretActive: boolean;
  liveSteps: TimelineStep[];
  historyLoaded: boolean;
  editPermission: boolean;
  activeTask: PendingTask | null;
  estimateName: string;
  activeSheetId?: string;
  selectedRange?: { startRow: number; startCol: number; endRow: number; endCol: number };
  onSend: (text?: string, files?: File[]) => void;
  onApplyProposal: (item: ProposalItem) => void;
  onDiscardProposal: (item: ProposalItem) => void;
  onSwitchToProposals: () => void;
  onClearTask: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
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
  liveSteps,
  historyLoaded,
  editPermission,
  activeTask,
  estimateName,
  activeSheetId: _activeSheetId,
  selectedRange,
  onSend,
  onApplyProposal,
  onDiscardProposal,
  onSwitchToProposals,
  onClearTask,
  scrollRef,
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
                onViewActivity={onSwitchToProposals}
              />
            );
          }
          return null;
        })}

        {/* Keep bubble visible while streaming OR while typewriter animation is still catching up.
            Without this, streaming=false hides the bubble before pendingFinalizeRef fires,
            causing the "all text at once" flash the user sees. */}
        {(streaming || !!typedTail) && (
          <div className="flex animate-slide-up justify-start">
            <div className="max-w-[88%] rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-sm text-zinc-200">
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
          <span>🔒</span>
          <span>
            Chế độ đọc — bật <strong className="text-zinc-400">Edit</strong> để
            AI đề xuất thay đổi
          </span>
        </div>
      )}

      <div className="border-t border-zinc-800 p-3">
        {selectionLabel && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-md border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-[11px] text-accent-300">
              <span>📍</span>
              <span className="font-mono font-semibold">{selectionLabel}</span>
              <span className="text-accent-400/70">đang chọn</span>
            </span>
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

// ── Compat exports ────────────────────────────────────────────────────────────

export { AgentConsole as CopilotPanel };

export function readCopilotCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSED_KEY) === "1";
}
