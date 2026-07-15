"use client";

import { useState } from "react";
import type { CopilotProposal, CopilotSource, ProposalCount } from "@/lib/types";
import { cn, formatVndShort } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";
import { useTypewriter } from "@/lib/hooks";
import { Button, Spinner } from "@/components/ui/Button";
import {
  SparkleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
} from "@/components/ui/icons";
import { ThinkingTrace } from "./ThinkingTrace";
import { ConfidenceCard } from "./ConfidenceCard";
import { ValidationPanel } from "./transparency/ValidationPanel";
import { TracePanel } from "./transparency/TracePanel";

// Chỉ hiện vài ô đầu trong "Chi tiết" — đổi hàng chục ô ("23 ô dữ liệu") thành
// nút "Xem nhật ký" thay vì liệt kê hết, tránh cảm giác "tường số" khó tiếp cận.
const DIFF_PREVIEW_COUNT = 5;

const KIND_LABEL: Record<string, TKey> = {
  material: "copilot.countMaterial",
  labor: "copilot.countLabor",
  equipment: "copilot.countEquipment",
  analysis: "copilot.countAnalysis",
  takeoff: "copilot.countTakeoff",
};

export type ProposalState = "pending" | "applying" | "applied" | "discarded";

// Phân loại độ tin cậy nguồn giá theo source.type (optional — BE có thể chưa gửi)
type SourceKind = "official" | "web" | "ai";

function classifySource(s: CopilotSource): SourceKind {
  const t = (s.type ?? "").toLowerCase();
  if (t === "government" || t === "catalog") return "official";
  if (t === "ai_estimate") return "ai";
  if (s.uri && /^https?:\/\//i.test(s.uri)) return "web";
  return "ai"; // không có uri lẫn type → coi như AI ước lượng
}

const SOURCE_BADGE: Record<SourceKind, { label: string; cls: string }> = {
  official: {
    label: "Nguồn chính thống",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  web: {
    label: "Web",
    cls: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  ai: {
    label: "AI ước lượng",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
};

interface Props {
  proposal: CopilotProposal;
  state: ProposalState;
  appliedCount?: number;
  fresh?: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onViewActivity: () => void;
}

export function ProposalCard({
  proposal,
  state,
  appliedCount,
  fresh = false,
  onApply,
  onDiscard,
  onViewActivity,
}: Props) {
  const { t } = useT();
  // P1 summary-first: mọi chi tiết (thinking/validation/confidence/trace/diffs/sources)
  // gộp sau MỘT toggle. Mặc định chỉ hiện: kết luận + số + confidence + cảnh báo AI + 2 nút.
  const [showDetail, setShowDetail] = useState(false);
  const { shown, done } = useTypewriter(proposal.message, { enabled: fresh });

  const preview = proposal.preview;
  const delta = preview?.costDelta ?? 0;
  const deltaUp = delta >= 0;
  const sources = proposal.sources ?? [];
  const diffs = preview?.diffs ?? [];
  const isDone = state === "applied" || state === "discarded";

  // Tín hiệu trust giữ Ở SUMMARY (không ẩn): giá toàn bộ là AI ước lượng.
  const allAiSources = sources.length > 0 && sources.every((s) => classifySource(s) === "ai");
  const hasDetail =
    (proposal.thinking?.length ?? 0) > 0 ||
    !!proposal.validation ||
    !!proposal.confidence ||
    !!proposal.trace ||
    diffs.length > 0 ||
    sources.length > 0;

  return (
    <div className="animate-slide-up flex justify-start">
      <div
        className={cn(
          "w-full max-w-[96%] rounded-2xl border px-3.5 py-3 text-sm",
          state === "applied"
            ? "border-emerald-500/30 bg-emerald-500/[0.04]"
            : state === "discarded"
              ? "border-zinc-800 bg-zinc-900/40 opacity-70"
              : "border-accent-500/30 bg-zinc-900/70"
        )}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent-300">
          <SparkleIcon className="h-3.5 w-3.5" />
          {t("copilot.proposalTitle")}
          <span
            className={cn(
              "ml-auto rounded-full border px-2 py-px text-[10px] font-medium normal-case tracking-normal",
              state === "applied"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : state === "discarded"
                  ? "border-zinc-700 bg-zinc-800/60 text-zinc-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            )}
          >
            {state === "applied"
              ? "Đã áp dụng"
              : state === "discarded"
                ? "Đã bỏ"
                : state === "applying"
                  ? "Đang áp dụng…"
                  : "Chờ duyệt"}
          </span>
          {proposal.validation && <ScoreBadge score={proposal.validation.score} />}
        </div>

        {/* KẾT LUẬN (1 dòng) */}
        <p className="whitespace-pre-line text-zinc-200">
          {fresh && !done ? shown : proposal.message}
        </p>

        {/* SỐ liệu tóm tắt — count chips + cost delta (giữ ở summary) */}
        {preview && preview.counts?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {preview.counts.map((c, i) => (
              <CountChip key={i} count={c} />
            ))}
          </div>
        )}
        {preview && delta !== 0 && (
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
              {t("copilot.costImpact")}
            </span>
            <span
              className={cn(
                "ml-auto font-mono text-sm font-semibold tabular-nums",
                deltaUp ? "text-emerald-400" : "text-rose-400"
              )}
            >
              {deltaUp ? "+" : "−"}
              {formatVndShort(Math.abs(delta))}
            </span>
          </div>
        )}

        {/* TRUST — estimated CẢNH BÁO (grounded im lặng). Giữ ở summary, KHÔNG ẩn. */}
        {allAiSources && (
          <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
            ⚠ Giá là AI ước lượng — cần kiểm chứng
          </p>
        )}

        {/* Actions / result */}
        {!isDone ? (
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={onApply}
              disabled={state === "applying"}
              leftIcon={
                state === "applying" ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircleIcon className="h-4 w-4" />
                )
              }
            >
              {state === "applying" ? t("copilot.applying") : t("copilot.apply")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDiscard}
              disabled={state === "applying"}
            >
              {t("copilot.discard")}
            </Button>
          </div>
        ) : state === "applied" ? (
          <div className="mt-3 flex items-center gap-2 border-t border-zinc-800 pt-2 text-[12px] text-emerald-300">
            <CheckCircleIcon className="h-4 w-4" />
            {t("copilot.appliedN", { count: appliedCount ?? 0 })}
            <button
              type="button"
              onClick={onViewActivity}
              className="ml-auto text-[11px] text-accent-300 hover:underline"
            >
              {t("copilot.viewActivity")}
            </button>
          </div>
        ) : (
          <p className="mt-3 border-t border-zinc-800 pt-2 text-[12px] text-zinc-500">
            {t("copilot.discarded")}
          </p>
        )}

        {/* MỘT toggle chi tiết — gộp: thinking · kiểm tra · độ tin · trace · thay đổi · nguồn */}
        {hasDetail && (
          <div className="mt-2 border-t border-zinc-800 pt-2">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-accent-300"
            >
              <ChevronDownIcon
                className={cn("h-3 w-3 transition-transform", showDetail ? "rotate-180" : "rotate-0")}
              />
              {showDetail ? "Ẩn chi tiết" : "Chi tiết"}
            </button>

            {showDetail && (
              <div className="mt-2 space-y-2.5">
                {proposal.thinking?.length > 0 && (
                  <ThinkingTrace steps={proposal.thinking} revealed={false} defaultOpen={false} />
                )}
                {proposal.validation && <ValidationPanel report={proposal.validation} />}
                {proposal.confidence && <ConfidenceCard confidence={proposal.confidence} />}
                <TracePanel trace={proposal.trace} />

                {/* Thay đổi từng dòng — chỉ vài dòng đầu, còn lại xem ở nhật ký (tránh "tường số" khi có hàng chục ô). */}
                {diffs.length > 0 && (
                  <div>
                    <ul className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2 font-mono text-[11px]">
                      {diffs.slice(0, DIFF_PREVIEW_COUNT).map((d, i) => {
                        let refDisplay = d.ref;
                        if (d.ref.includes("->")) {
                          const parts = d.ref.split("->").map((p) => p.trim());
                          if (parts.length === 2) refDisplay = `Ô ${parts[1]}`;
                        }
                        return (
                          <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                            <span className="text-accent-300">{refDisplay}</span>
                            <span className="text-zinc-600">·</span>
                            <span className="text-zinc-500">{d.field}</span>
                            <span className="text-rose-300/90 line-through">{d.from}</span>
                            <span className="text-zinc-600">→</span>
                            <span className="text-emerald-300">{d.to}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {diffs.length > DIFF_PREVIEW_COUNT && (
                      <button
                        type="button"
                        onClick={onViewActivity}
                        className="mt-1 text-[11px] text-zinc-500 hover:text-accent-300"
                      >
                        +{diffs.length - DIFF_PREVIEW_COUNT} ô khác — {t("copilot.viewActivity")}
                      </button>
                    )}
                  </div>
                )}

                {/* Nguồn giá (đầy đủ) */}
                {sources.length > 0 && (
                  <div className="border-t border-zinc-800 pt-2">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      {t("copilot.sources")}
                    </p>
                    <ul className="space-y-0.5">
                      {sources.map((s, i) => {
                        const badge = SOURCE_BADGE[classifySource(s)];
                        return (
                          <li key={i} className="flex items-center gap-1.5 text-[11px]">
                            <span className="min-w-0 truncate">
                              {s.uri ? (
                                <a href={s.uri} target="_blank" rel="noreferrer" className="text-accent-300 hover:underline" title={s.uri}>
                                  {s.title || s.uri}
                                </a>
                              ) : (
                                <span className="text-zinc-400">{s.title}</span>
                              )}
                            </span>
                            <span className={cn("shrink-0 rounded-full border px-1.5 py-px text-[9px] font-medium", badge.cls)}>
                              {badge.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Validation self-check score (0-100) as a colored badge: ≥80 ok, ≥60 warn, <60 bad
function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : score >= 60
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return (
    <span
      title="Điểm AI tự kiểm tra mức độ đáng tin của kết quả (0–100). Xem lý do ở mục 'Vì sao có kết quả này'."
      className={cn(
        "rounded-full border px-2 py-px font-mono text-[10px] font-semibold tabular-nums tracking-normal",
        cls
      )}
    >
      Độ tin {score}/100
    </span>
  );
}

function CountChip({ count }: { count: ProposalCount }) {
  const { t } = useT();
  const labelKey = KIND_LABEL[count.kind];
  const total = count.added + count.updated + count.removed;
  const label = labelKey
    ? t(labelKey, { n: total })
    : `${total} ${count.kind}`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-[11px] text-accent-200">
      {count.added > 0 && (
        <span className="text-emerald-400">
          {t("copilot.countAdded", { n: count.added })}
        </span>
      )}
      {count.updated > 0 && (
        <span className="text-amber-400">
          {t("copilot.countUpdated", { n: count.updated })}
        </span>
      )}
      {count.removed > 0 && (
        <span className="text-rose-400">
          {t("copilot.countRemoved", { n: count.removed })}
        </span>
      )}
      <span>{label}</span>
    </span>
  );
}
