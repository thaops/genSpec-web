"use client";

import { useState } from "react";
import type { Patch, PatchChange } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { SparkleIcon, EditIcon, ChevronDownIcon } from "@/components/ui/icons";
import { Button, Spinner } from "@/components/ui/Button";

function timeHHMM(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Detail({ change }: { change: PatchChange }) {
  const isCellUpdate = change.sheetId && change.cell;
  let refDisplay = change.path || "";
  
  if (isCellUpdate) {
    refDisplay = `Sheet "${change.sheetId}" · Ô ${change.cell}`;
  } else if (change.entityId) {
    refDisplay = `${change.path} (${change.entityId})`;
  }

  const fromVal = typeof change.oldValue === "object" ? JSON.stringify(change.oldValue) : String(change.oldValue ?? "");
  const toVal = typeof change.newValue === "object" ? JSON.stringify(change.newValue) : String(change.newValue ?? "");

  return (
    <div className="flex flex-wrap items-baseline gap-1.5 font-mono text-[11px] text-zinc-400">
      <span className="text-accent-300">{refDisplay}</span>
      <span className="text-zinc-600">·</span>
      {change.op === "delete" ? (
        <span className="text-rose-400">Xóa dữ liệu</span>
      ) : change.op === "insert" ? (
        <span className="text-emerald-400">Thêm mới: {toVal}</span>
      ) : (
        <>
          <span className="text-rose-300/90 line-through">{fromVal || "rỗng"}</span>
          <span className="px-0.5 text-zinc-600">→</span>
          <span className="text-emerald-300">{toVal}</span>
        </>
      )}
    </div>
  );
}

export function HistoryTimeline({
  history,
  onRollback,
  rollbackLoadingId,
}: {
  history: Patch[];
  onRollback: (patchId: string) => void;
  rollbackLoadingId?: string;
}) {
  const { t } = useT();
  const [expandedPatchId, setExpandedPatchId] = useState<string | null>(null);
  const entries = [...(history ?? [])].reverse();

  if (entries.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-zinc-600">
        Chưa có lịch sử thay đổi nào.
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 px-4 py-4">
      <span className="absolute left-[22px] top-5 bottom-5 w-px bg-zinc-800" />
      {entries.map((patch) => {
        const isAi = patch.actor === "ai";
        const isExpanded = expandedPatchId === patch.id;
        const isLoading = rollbackLoadingId === patch.id;

        return (
          <li key={patch.id} className="relative flex gap-3">
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border",
                isAi
                  ? "border-accent-500/30 bg-accent-500/10 text-accent-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400"
              )}
            >
              {isAi ? (
                <SparkleIcon className="h-3 w-3" />
              ) : (
                <EditIcon className="h-3 w-3" />
              )}
            </span>
            
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-[13px] text-zinc-200">
                      {isAi ? "Đề xuất AI" : "Chỉnh sửa thủ công"}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                      {timeHHMM(patch.timestamp)}
                    </span>
                  </div>
                  
                  <p className="mt-1 text-[12.5px] text-zinc-300 leading-snug">
                    {patch.description || "Thay đổi bảng tính"}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setExpandedPatchId(isExpanded ? null : patch.id)}
                  className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-accent-300 transition-colors"
                >
                  <ChevronDownIcon
                    className={cn(
                      "h-3 w-3 transition-transform",
                      isExpanded ? "rotate-180" : "rotate-0"
                    )}
                  />
                  {isExpanded ? "Ẩn chi tiết" : `Xem chi tiết (${patch.changes?.length ?? 0})`}
                </button>

                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => onRollback(patch.id)}
                  disabled={!!rollbackLoadingId}
                  leftIcon={isLoading ? <Spinner className="h-3 w-3" /> : undefined}
                  className="h-6 px-2 text-[10.5px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  {isLoading ? "Đang khôi phục" : "Khôi phục"}
                </Button>
              </div>

              {isExpanded && patch.changes && (
                <div className="mt-2.5 space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5">
                  {patch.changes.map((c, idx) => (
                    <Detail key={idx} change={c} />
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
