"use client";

import { useState } from "react";
import type { CopilotProposal, ProposalCount } from "@/lib/types";
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

const KIND_LABEL: Record<string, TKey> = {
  material: "copilot.countMaterial",
  labor: "copilot.countLabor",
  equipment: "copilot.countEquipment",
  analysis: "copilot.countAnalysis",
  takeoff: "copilot.countTakeoff",
};

export type ProposalState = "pending" | "applying" | "applied" | "discarded";

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
  const [showDiffs, setShowDiffs] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const { shown, done } = useTypewriter(proposal.message, { enabled: fresh });

  const preview = proposal.preview;
  const delta = preview?.costDelta ?? 0;
  const deltaUp = delta >= 0;
  const sources = proposal.sources ?? [];
  const diffs = preview?.diffs ?? [];
  const isDone = state === "applied" || state === "discarded";

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
        </div>

        {proposal.thinking?.length > 0 && (
          <ThinkingTrace
            steps={proposal.thinking}
            revealed={false}
            defaultOpen={false}
          />
        )}

        <p className="whitespace-pre-line text-zinc-200">
          {fresh && !done ? shown : proposal.message}
        </p>

        {/* Validation self-check (status + benchmark) — shown BEFORE apply */}
        {proposal.validation && (
          <div className="mt-2.5">
            <ValidationPanel report={proposal.validation} compact />
          </div>
        )}

        {/* Confidence with basis */}
        {proposal.confidence && (
          <div className="mt-2.5">
            <ConfidenceCard confidence={proposal.confidence} />
          </div>
        )}

        {/* "Why this result?" — full self-critique: findings + consistency */}
        {proposal.validation &&
          (proposal.validation.findings.length > 0 ||
            proposal.validation.consistency.length > 0) && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowWhy((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-accent-300"
              >
                <ChevronDownIcon
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showWhy ? "rotate-180" : "rotate-0"
                  )}
                />
                {showWhy ? t("copilot.whyHide") : t("copilot.whyShow")}
              </button>
              {showWhy && (
                <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
                  <ValidationPanel report={proposal.validation} />
                </div>
              )}
            </div>
          )}

        {/* Trace — quantity derivation + price sources, BEFORE applying */}
        <TracePanel trace={proposal.trace} />

        {/* Count chips */}
        {preview && preview.counts?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {preview.counts.map((c, i) => (
              <CountChip key={i} count={c} />
            ))}
          </div>
        )}

        {/* Cost delta */}
        {preview && (
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
              {t("copilot.costImpact")}
            </span>
            <span
              className={cn(
                "ml-auto font-mono text-sm font-semibold tabular-nums",
                delta === 0
                  ? "text-zinc-400"
                  : deltaUp
                    ? "text-emerald-400"
                    : "text-rose-400"
              )}
            >
              {deltaUp ? "+" : "−"}
              {formatVndShort(Math.abs(delta))}
            </span>
          </div>
        )}

        {/* Diff list */}
        {diffs.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowDiffs((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-accent-300"
            >
              <ChevronDownIcon
                className={cn(
                  "h-3 w-3 transition-transform",
                  showDiffs ? "rotate-180" : "rotate-0"
                )}
              />
              {showDiffs
                ? t("copilot.hideDiffs")
                : t("copilot.viewDiffs", { count: diffs.length })}
            </button>
            {showDiffs && (
              <ul className="mt-1.5 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2 font-mono text-[11px]">
                {diffs.map((d, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-accent-300">{d.ref}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">{d.field}</span>
                    <span className="text-rose-300/90 line-through">{d.from}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="text-emerald-300">{d.to}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <div className="mt-2.5 border-t border-zinc-800 pt-2">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {t("copilot.sources")}
            </p>
            <ul className="space-y-0.5">
              {sources.map((s, i) => (
                <li key={i} className="truncate text-[11px]">
                  {s.uri ? (
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-300 hover:underline"
                      title={s.uri}
                    >
                      {s.title || s.uri}
                    </a>
                  ) : (
                    <span className="text-zinc-400">{s.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
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
              variant="secondary"
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
      </div>
    </div>
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
