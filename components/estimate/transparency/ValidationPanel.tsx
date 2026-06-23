"use client";

import type {
  ValidationReport,
  ValidationFinding,
  ValidationStatus,
  ConsistencyIssue,
} from "@/lib/types";
import { useT } from "@/lib/i18n/I18nProvider";
import { cn, formatVndShort } from "@/lib/utils";
import { CheckCircleIcon, AlertIcon, InfoIcon } from "@/components/ui/icons";

const STATUS: Record<
  ValidationStatus,
  { tone: string; dot: string; labelKey: "validation.statusReasonable" | "validation.statusWarning" | "validation.statusUnrealistic" }
> = {
  reasonable: { tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", dot: "bg-emerald-400", labelKey: "validation.statusReasonable" },
  warning: { tone: "border-amber-500/30 bg-amber-500/10 text-amber-300", dot: "bg-amber-400", labelKey: "validation.statusWarning" },
  unrealistic: { tone: "border-rose-500/30 bg-rose-500/10 text-rose-300", dot: "bg-rose-400", labelKey: "validation.statusUnrealistic" },
};

const SEV_ICON = {
  info: { Icon: InfoIcon, cls: "text-sky-400" },
  warn: { Icon: AlertIcon, cls: "text-amber-400" },
  error: { Icon: AlertIcon, cls: "text-rose-400" },
} as const;

// Renders the AI self-check: status, trust score, benchmark deviation,
// sanity findings and cross-sheet consistency. Used in Overview + ProposalCard.
export function ValidationPanel({
  report,
  compact = false,
}: {
  report?: ValidationReport;
  compact?: boolean;
}) {
  const { t } = useT();
  if (!report) return null;

  const s = STATUS[report.status];
  const bm = report.benchmark;
  const dev = report.deviationPct;
  const issues = report.consistency ?? [];
  const findings = report.findings ?? [];

  return (
    <div className="space-y-3">
      {/* Status + score */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", s.tone)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
          {t(s.labelKey)}
        </span>
        <span className="ml-auto text-[11px] text-zinc-500">
          {t("validation.trustScore")}
        </span>
        <span
          className={cn(
            "font-mono text-sm font-bold tabular-nums",
            report.score >= 80 ? "text-emerald-300" : report.score >= 55 ? "text-amber-300" : "text-rose-300"
          )}
        >
          {Math.round(report.score)}
        </span>
      </div>

      {/* Benchmark */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {t("validation.marketBenchmark")}
        </p>
        {bm ? (
          <div className="space-y-1 text-[12px]">
            <Row label={t("validation.range")} value={`${formatVndShort(bm.low)} – ${formatVndShort(bm.high)}`} />
            {typeof dev === "number" && (
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-500">{t("validation.deviation")}</span>
                <span
                  className={cn(
                    "font-mono font-semibold tabular-nums",
                    Math.abs(dev) <= 15 ? "text-emerald-300" : Math.abs(dev) <= 40 ? "text-amber-300" : "text-rose-300"
                  )}
                >
                  {dev > 0 ? "+" : ""}
                  {dev}%
                </span>
              </div>
            )}
            {bm.basis && <p className="pt-0.5 text-[10.5px] leading-snug text-zinc-500">{bm.basis}</p>}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500">{t("validation.noBenchmark")}</p>
        )}
      </div>

      {!compact && (
        <>
          <IssueList
            label={t("validation.findings")}
            empty={t("validation.noIssues")}
            items={findings.map((f: ValidationFinding) => ({
              id: f.id,
              severity: f.severity,
              title: f.title,
              detail: f.detail,
            }))}
          />
          <IssueList
            label={t("validation.consistency")}
            empty={t("validation.allConsistent")}
            items={issues.map((c: ConsistencyIssue) => ({
              id: c.id,
              severity: c.severity,
              title: c.message,
            }))}
          />
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

function IssueList({
  label,
  empty,
  items,
}: {
  label: string;
  empty: string;
  items: { id: string; severity: "info" | "warn" | "error"; title: string; detail?: string }[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      {items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-400/80">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => {
            const { Icon, cls } = SEV_ICON[it.severity];
            return (
              <li key={it.id} className="flex gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", cls)} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-zinc-200">{it.title}</p>
                  {it.detail && <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{it.detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
