"use client";

import { useEffect } from "react";
import type { AgentTaskState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Button";
import { Bot, Check, X } from "lucide-react";

const DONE_AUTO_HIDE_MS = 15_000;

interface Props {
  task: AgentTaskState;
  /** Open the agent sidebar (expand + land on chat bottom) */
  onView: () => void;
  onDismiss: () => void;
}

/** Floating page-level pill mirroring a silent agent task — visible feedback
    even while the agent sidebar is collapsed. */
export function AgentTaskPill({ task, onView, onDismiss }: Props) {
  // Auto-hide 15s after completion (error stays until dismissed)
  useEffect(() => {
    if (task.status !== "done") return;
    const t = window.setTimeout(onDismiss, DONE_AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [task.status, onDismiss]);

  const isRunning = task.status === "running";
  const isDone = task.status === "done";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border px-3.5 py-2 text-xs shadow-xl backdrop-blur",
          isRunning && "border-zinc-700 bg-zinc-900/95 text-zinc-200",
          isDone && "border-emerald-500/40 bg-emerald-950/90 text-emerald-200",
          task.status === "error" && "border-rose-500/40 bg-rose-950/90 text-rose-200"
        )}
      >
        {isRunning ? (
          <Spinner className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        ) : isDone ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <X className="h-3.5 w-3.5 shrink-0 text-rose-400" />
        )}
        <Bot className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="min-w-0 truncate">
          {isRunning ? (
            <>
              <span className="font-medium">{task.label}</span>
              <span className="text-zinc-400"> — {task.step}</span>
            </>
          ) : isDone ? (
            <span className="font-medium">
              {task.label} hoàn tất — đề xuất sẵn sàng
            </span>
          ) : (
            <>
              <span className="font-medium">{task.label} thất bại</span>
              {task.step && <span className="opacity-70"> — {task.step}</span>}
            </>
          )}
        </span>
        {task.status !== "error" && (
          <button
            type="button"
            onClick={onView}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              isDone
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                : "border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            )}
          >
            {isDone ? "Xem đề xuất" : "Xem"}
          </button>
        )}
        {!isRunning && (
          <button
            type="button"
            onClick={onDismiss}
            title="Đóng"
            className="shrink-0 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
