"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import type {
  Estimate,
  CopilotProposal,
  CopilotStep,
  Confidence,
} from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";
import { useToast } from "@/components/ui/Toast";
import { CopilotComposer } from "./CopilotComposer";
import { LiveTimeline, type TimelineStep } from "./LiveTimeline";
import { ProposalCard, type ProposalState } from "./ProposalCard";
import { ActivityLog } from "./ActivityLog";

type Tab = "chat" | "activity";

interface ThreadItem {
  id: number;
  kind: "user" | "assistant" | "proposal" | "error";
  text?: string;
  proposal?: CopilotProposal;
  // proposal lifecycle
  state?: ProposalState;
  appliedCount?: number;
  fresh?: boolean;
}

export interface CopilotHandle {
  send: (text: string, files: File[]) => void;
}

interface Props {
  estimate: Estimate;
  // single state updater the panel calls after apply / on estimate change
  onEstimateUpdated: (e: Estimate) => void;
  onLoadingChange?: (loading: boolean) => void;
  onConfidence?: (c: Confidence) => void;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  controlRef?: Ref<CopilotHandle>;
}

const SUGGESTIONS: TKey[] = [
  "copilot.suggest1",
  "copilot.suggest2",
  "copilot.suggest3",
  "copilot.suggest4",
];

function clockNow(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function Copilot({
  estimate,
  onEstimateUpdated,
  onLoadingChange,
  onConfidence,
  tab,
  onTabChange,
  controlRef,
}: Props) {
  const { t } = useT();
  const toast = useToast();
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [liveText, setLiveText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const estimateRef = useRef(estimate);

  const nextId = () => ++idRef.current;

  useEffect(() => {
    estimateRef.current = estimate;
  }, [estimate]);

  useEffect(() => {
    onLoadingChange?.(streaming);
  }, [streaming, onLoadingChange]);

  const isEmpty =
    (estimate.takeoff?.length ?? 0) === 0 &&
    (estimate.analyses?.length ?? 0) === 0 &&
    (estimate.materials?.length ?? 0) === 0;
  const showSuggestions = isEmpty && thread.length === 0 && !streaming;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [thread, steps, streaming]);

  // Cancel any in-flight stream on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function send(text?: string, attached?: File[]) {
    const message = (text ?? input).trim();
    const sent = attached ?? files;
    if ((!message && sent.length === 0) || streaming) return;

    onTabChange("chat");
    setThread((tr) => [
      ...tr,
      {
        id: nextId(),
        kind: "user",
        text: message || `📎 ${sent.map((f) => f.name).join(", ")}`,
      },
    ]);
    setInput("");
    setFiles([]);
    setSteps([]);
    setLiveText("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await api.copilotStream(estimate.id, message, sent, {
        signal: ctrl.signal,
        onToken: (text: string) => {
          setLiveText((prev) => (prev + text).slice(-1600));
        },
        onStep: (s: CopilotStep) => {
          setSteps((prev) => [...prev, { text: s.text, at: clockNow() }]);
        },
        onProposal: (p: CopilotProposal) => {
          setThread((tr) => [
            ...tr,
            {
              id: nextId(),
              kind: "proposal",
              proposal: p,
              state: "pending",
              fresh: true,
            },
          ]);
          setSteps([]);
          setLiveText("");
          if (p.confidence) onConfidence?.(p.confidence);
        },
        onError: (m: string) => {
          toast.error(t("copilot.failed"), m);
          setThread((tr) => [
            ...tr,
            { id: nextId(), kind: "error", text: `⚠ ${m}` },
          ]);
        },
      });
    } finally {
      setStreaming(false);
      setSteps([]);
      setLiveText("");
      abortRef.current = null;
    }
  }

  async function applyProposal(item: ThreadItem) {
    if (!item.proposal) return;
    setThread((tr) =>
      tr.map((x) => (x.id === item.id ? { ...x, state: "applying" } : x))
    );
    try {
      const res = await api.applyActions(
        estimateRef.current.id,
        item.proposal.actions,
        "ai"
      );
      onEstimateUpdated(res.estimate);
      setThread((tr) =>
        tr.map((x) =>
          x.id === item.id
            ? {
                ...x,
                state: "applied",
                fresh: false,
                appliedCount: res.applied ?? item.proposal?.actions.length ?? 0,
              }
            : x
        )
      );
      if (res.warnings?.length) {
        toast.error(t("copilot.failed"), res.warnings.join(", "));
      }
    } catch (err) {
      toast.error(t("copilot.failed"), (err as ApiError).message);
      setThread((tr) =>
        tr.map((x) => (x.id === item.id ? { ...x, state: "pending" } : x))
      );
    }
  }

  function discardProposal(item: ThreadItem) {
    setThread((tr) =>
      tr.map((x) =>
        x.id === item.id ? { ...x, state: "discarded", fresh: false } : x
      )
    );
  }

  useImperativeHandle(
    controlRef,
    () => ({ send: (text: string, f: File[]) => send(text, f) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, files, input]
  );

  const activityCount = estimate.activityLog?.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        <TabButton
          active={tab === "chat"}
          onClick={() => onTabChange("chat")}
          label={t("copilot.tabChat")}
        />
        <TabButton
          active={tab === "activity"}
          onClick={() => onTabChange("activity")}
          label={t("copilot.tabActivity")}
          count={activityCount}
        />
      </div>

      {tab === "activity" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ActivityLog log={estimate.activityLog ?? []} />
        </div>
      ) : (
        <>
          {/* Thread */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {isEmpty && thread.length === 0 && !streaming && (
              <Bubble role="assistant" text={t("copilot.greeting")} />
            )}

            {thread.map((item) => {
              if (item.kind === "user")
                return <Bubble key={item.id} role="user" text={item.text!} />;
              if (item.kind === "error")
                return (
                  <Bubble
                    key={item.id}
                    role="assistant"
                    text={item.text!}
                    error
                  />
                );
              if (item.kind === "proposal" && item.proposal)
                return (
                  <ProposalCard
                    key={item.id}
                    proposal={item.proposal}
                    state={item.state ?? "pending"}
                    appliedCount={item.appliedCount}
                    fresh={item.fresh}
                    onApply={() => applyProposal(item)}
                    onDiscard={() => discardProposal(item)}
                    onViewActivity={() => onTabChange("activity")}
                  />
                );
              return null;
            })}

            {streaming && (
              <>
                {liveText.trim() && (
                  <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3">
                    <p className="type-caret whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-400">
                      {liveText}
                    </p>
                  </div>
                )}
                <LiveTimeline steps={steps} streaming={streaming} />
              </>
            )}
          </div>

          {/* Composer */}
          <div className="space-y-2.5 border-t border-zinc-800 p-3">
            {showSuggestions && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => send(t(key))}
                    className="rounded-full border border-zinc-700/80 bg-zinc-800/40 px-3 py-1.5 text-[12px] text-zinc-300 transition-all hover:-translate-y-px hover:border-accent-500/50 hover:bg-accent-500/10 hover:text-accent-200"
                  >
                    {t(key)}
                  </button>
                ))}
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
              onSend={() => send()}
              loading={streaming}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-zinc-800/80 text-zinc-100"
          : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300"
      )}
    >
      {label}
      {count != null && count > 0 && (
        <span className="rounded-full bg-zinc-700/70 px-1.5 text-[10px] tabular-nums text-zinc-300">
          {count}
        </span>
      )}
    </button>
  );
}

function Bubble({
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
