"use client";

import type React from "react";
import type { Estimate, CostSummary, Costs } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatVndShort, formatVnd } from "@/lib/utils";
import { BarChart3, Hash, ClipboardList, Box, Bot } from "lucide-react";

// ---- Semantic Layer ----
function semantic(e: Estimate) {
  const cs = (e.costSummary ?? {}) as CostSummary;
  const costs = (e.costs ?? {}) as Costs;
  const boq = e.boq ?? [];
  const materials = e.materials ?? [];
  const labor = e.labor ?? [];
  const equipment = e.equipment ?? [];
  const sheets = e.sheets ?? [];
  const patches = e.patchHistory ?? [];
  const validation = e.validation;
  const activityLog = e.activityLog ?? [];
  const takeoff = e.takeoff ?? [];

  const total = cs.total ?? 0;
  const vlCost = costs.material ?? 0;
  const ncCost = costs.labor ?? 0;
  const mCost = costs.machine ?? 0;
  const overheadCost = cs.overhead ?? 0;
  const profitCost = cs.profit ?? 0;
  const vatCost = cs.vat ?? 0;
  const contingencyCost = cs.contingency ?? 0;

  const costSegments = [
    { label: "Vật liệu", value: vlCost, hex: "#3b82f6" },
    { label: "Nhân công", value: ncCost, hex: "#10b981" },
    { label: "Máy", value: mCost, hex: "#f59e0b" },
    { label: "Chi phí chung", value: overheadCost, hex: "#8b5cf6" },
    { label: "Lợi nhuận", value: profitCost, hex: "#f43f5e" },
    { label: "VAT", value: vatCost, hex: "#64748b" },
    { label: "Dự phòng", value: contingencyCost, hex: "#a16207" },
  ].filter((s) => s.value > 0);

  const topBoq = [...boq].sort((a, b) => b.total - a.total).slice(0, 5);
  const topBoqMax = topBoq[0]?.total ?? 1;

  let totalFormulas = 0;
  for (const s of sheets) {
    const cellData = s.data?.cellData ?? {};
    for (const row of Object.values(cellData)) {
      for (const cell of Object.values(
        row as Record<string, { f?: string }>
      )) {
        if (cell?.f) totalFormulas++;
      }
    }
  }

  const matTotal = materials.length;
  const matAI = materials.filter(
    (m) => m.source?.type === "ai_estimate"
  ).length;
  const matGovt = materials.filter(
    (m) => m.source?.type === "government"
  ).length;
  const matSupplier = materials.filter(
    (m) => m.source?.type === "supplier" || m.source?.type === "market"
  ).length;
  const matNoSource = materials.filter((m) => !m.source?.type).length;

  const labTotal = labor.length;
  const labAI = labor.filter((l) => l.source?.type === "ai_estimate").length;
  const equTotal = equipment.length;
  const equAI = equipment.filter(
    (eq) => eq.source?.type === "ai_estimate"
  ).length;

  const tkCodes = takeoff
    .map((t) => t.code.toLowerCase().trim())
    .filter(Boolean);
  const dupTk = [
    ...new Set(tkCodes.filter((c, i) => tkCodes.indexOf(c) !== i)),
  ].length;
  const matCodes = materials
    .map((m) => m.code.toLowerCase().trim())
    .filter(Boolean);
  const dupMat = [
    ...new Set(matCodes.filter((c, i) => matCodes.indexOf(c) !== i)),
  ].length;

  const timeline = [
    ...patches
      .slice(-6)
      .reverse()
      .map((p) => ({ at: p.timestamp, label: p.description, actor: p.actor })),
    ...activityLog
      .slice(-6)
      .reverse()
      .map((a) => ({ at: a.at, label: a.label, actor: a.source })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  return {
    total,
    vlCost,
    ncCost,
    mCost,
    overheadCost,
    profitCost,
    vatCost,
    contingencyCost,
    costSegments,
    topBoq,
    topBoqMax,
    totalFormulas,
    matTotal,
    matAI,
    matGovt,
    matSupplier,
    matNoSource,
    labTotal,
    labAI,
    equTotal,
    equAI,
    dupTk,
    dupMat,
    timeline,
    validation,
    boqCount: boq.length,
  };
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, (value / total) * 100);
}

function fmtAt(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---- Primitives ----
function Card({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-900/50 p-4",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function HBar({
  label,
  value,
  max,
  color,
  sub,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sub?: string;
}) {
  const p = pct(value, max);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="max-w-[55%] truncate text-zinc-300">{label}</span>
        <span className="text-right text-zinc-500 tabular-nums">
          {sub ?? formatVndShort(value)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${p}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function DonutGauge({ score }: { score: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const filled = (score / 100) * c;
  const color =
    score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#f43f5e";
  return (
    <svg width={80} height={80} viewBox="0 0 80 80">
      <circle cx={40} cy={40} r={r} fill="none" stroke="#27272a" strokeWidth={7} />
      <circle
        cx={40}
        cy={40}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeDasharray={`${filled} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
      />
      <text
        x={40}
        y={38}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={16}
        fontWeight={700}
        fill={color}
      >
        {score}
      </text>
      <text
        x={40}
        y={52}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fill="#71717a"
      >
        /100
      </text>
    </svg>
  );
}


// ---- Main ----
export function InsightsDashboard({ estimate }: { estimate: Estimate }) {
  const s = semantic(estimate);
  const healthScore = s.validation?.score ?? 0;
  const criticalCount = (s.validation?.findings ?? []).filter(
    (f) => f.severity === "error"
  ).length;
  const warnCount = (s.validation?.findings ?? []).filter(
    (f) => f.severity === "warn"
  ).length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-5 py-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <BarChart3 className="h-3.5 w-3.5" /> Project Intelligence
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          {estimate.name}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Tổng dự toán"
              value={formatVndShort(s.total)}
              sub={s.total > 0 ? formatVnd(s.total) : undefined}
              accent
            />
            <KpiCard
              label="Vật liệu"
              value={`${pct(s.vlCost, s.total).toFixed(1)}%`}
              sub={formatVndShort(s.vlCost)}
              color="text-blue-400"
            />
            <KpiCard
              label="Nhân công"
              value={`${pct(s.ncCost, s.total).toFixed(1)}%`}
              sub={formatVndShort(s.ncCost)}
              color="text-emerald-400"
            />
            <KpiCard
              label="Máy"
              value={`${pct(s.mCost, s.total).toFixed(1)}%`}
              sub={formatVndShort(s.mCost)}
              color="text-amber-400"
            />
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Cost Breakdown */}
            <Card title="Cơ cấu chi phí">
              {/* stacked bar */}
              <div className="mb-3 flex h-5 w-full overflow-hidden rounded-full">
                {s.costSegments.map((seg) => (
                  <div
                    key={seg.label}
                    title={`${seg.label}: ${formatVndShort(seg.value)}`}
                    style={{
                      width: `${pct(seg.value, s.total)}%`,
                      backgroundColor: seg.hex,
                    }}
                  />
                ))}
              </div>
              {/* legend */}
              <div className="space-y-2">
                {s.costSegments.map((seg) => (
                  <div key={seg.label} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: seg.hex }}
                    />
                    <span className="flex-1 truncate text-xs text-zinc-400">
                      {seg.label}
                    </span>
                    <span className="text-xs tabular-nums text-zinc-300">
                      {pct(seg.value, s.total).toFixed(1)}%
                    </span>
                    <span className="w-20 text-right text-xs tabular-nums text-zinc-500">
                      {formatVndShort(seg.value)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top 5 Items */}
            <Card title="Hạng mục chi phí cao nhất">
              {s.topBoq.length === 0 ? (
                <p className="text-xs text-zinc-600">Chưa có dữ liệu BOQ.</p>
              ) : (
                <div className="space-y-3">
                  {s.topBoq.map((row, i) => (
                    <HBar
                      key={row.code + i}
                      label={`#${i + 1} ${row.name}`}
                      value={row.total}
                      max={s.topBoqMax}
                      color={["#3b82f6","#10b981","#f59e0b","#8b5cf6","#f43f5e"][i]}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Validation Health */}
            <Card title="Workbook Health">
              <div className="flex items-center gap-4">
                <DonutGauge score={healthScore} />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-zinc-400">OK</span>
                    <span className="ml-auto font-medium text-zinc-200">
                      {100 - criticalCount - warnCount}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-zinc-400">Warning</span>
                    <span className="ml-auto font-medium text-amber-300">
                      {warnCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-zinc-400">Critical</span>
                    <span className="ml-auto font-medium text-rose-300">
                      {criticalCount}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Source Status */}
            <Card title="Nguồn giá">
              <div className="space-y-2.5">
                <SourceRow
                  label="Vật tư"
                  total={s.matTotal}
                  ai={s.matAI}
                  govt={s.matGovt}
                  supplier={s.matSupplier}
                  noSource={s.matNoSource}
                />
                <SourceRow
                  label="Nhân công"
                  total={s.labTotal}
                  ai={s.labAI}
                  govt={0}
                  supplier={0}
                  noSource={s.labTotal - s.labAI}
                />
                <SourceRow
                  label="Máy"
                  total={s.equTotal}
                  ai={s.equAI}
                  govt={0}
                  supplier={0}
                  noSource={s.equTotal - s.equAI}
                />
              </div>
            </Card>

            {/* Formula + Duplicates */}
            <Card title="Chất lượng dữ liệu">
              <div className="space-y-3">
                <Metric
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Công thức"
                  value={String(s.totalFormulas)}
                  sub="trong workbook"
                  good={s.totalFormulas > 0}
                />
                <Metric
                  icon={<ClipboardList className="h-3.5 w-3.5" />}
                  label="Công tác trùng"
                  value={String(s.dupTk)}
                  sub={`/ ${estimate.takeoff.length} công tác`}
                  good={s.dupTk === 0}
                  warn={s.dupTk > 0}
                />
                <Metric
                  icon={<Box className="h-3.5 w-3.5" />}
                  label="Vật tư trùng mã"
                  value={String(s.dupMat)}
                  sub={`/ ${s.matTotal} vật tư`}
                  good={s.dupMat === 0}
                  warn={s.dupMat > 0}
                />
                <Metric
                  icon={<Bot className="h-3.5 w-3.5" />}
                  label="Giá AI (cần xác minh)"
                  value={String(s.matAI)}
                  sub={`/ ${s.matTotal} vật tư`}
                  good={s.matAI === 0}
                  warn={s.matAI > 0 && s.matAI / Math.max(1, s.matTotal) < 0.5}
                  critical={s.matAI / Math.max(1, s.matTotal) >= 0.5}
                />
              </div>
            </Card>
          </div>

          {/* Timeline */}
          {s.timeline.length > 0 && (
            <Card title="Timeline thay đổi">
              <div className="relative space-y-0 pl-5">
                <div className="absolute left-1.5 top-0 h-full w-px bg-zinc-800" />
                {s.timeline.map((ev, i) => (
                  <div key={i} className="relative pb-3">
                    <span className="absolute -left-[13px] top-1 h-2 w-2 rounded-full border border-zinc-700 bg-zinc-900" />
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-zinc-300">{ev.label}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                          ev.actor === "ai"
                            ? "bg-accent-500/10 text-accent-300"
                            : "bg-zinc-800 text-zinc-500"
                        )}
                      >
                        {ev.actor === "ai" ? "AI" : "Manual"}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-600">{fmtAt(ev.at)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}

// ---- Sub-components ----
function KpiCard({
  label,
  value,
  sub,
  accent,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          accent ? "text-zinc-100" : (color ?? "text-zinc-200")
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 truncate text-[10px] text-zinc-600">{sub}</p>
      )}
    </div>
  );
}

function SourceRow({
  label,
  total,
  ai,
  govt,
  supplier,
  noSource,
}: {
  label: string;
  total: number;
  ai: number;
  govt: number;
  supplier: number;
  noSource: number;
}) {
  if (total === 0) return null;
  const goodPct = pct(govt + supplier, total);
  const aiPct = pct(ai, total);
  const noSrcPct = pct(noSource - ai, total);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-500 tabular-nums">
          {total} mục · {goodPct.toFixed(0)}% có nguồn
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div style={{ width: `${goodPct}%` }} className="bg-emerald-500" />
        <div style={{ width: `${aiPct}%` }} className="bg-amber-500" />
        <div style={{ width: `${noSrcPct}%` }} className="bg-zinc-700" />
      </div>
      <div className="flex gap-3 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Có nguồn {govt + supplier}</span>
        {ai > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> AI {ai}</span>}
        {noSource - ai > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-zinc-700" /> Không nguồn {noSource - ai}</span>}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  good,
  warn,
  critical,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
  warn?: boolean;
  critical?: boolean;
}) {
  const valueColor = critical
    ? "text-rose-400"
    : warn
    ? "text-amber-400"
    : good
    ? "text-emerald-400"
    : "text-zinc-300";
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-zinc-500">{icon}</span>
      <span className="flex-1 text-xs text-zinc-400">{label}</span>
      <span className={cn("text-xs font-semibold tabular-nums", valueColor)}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
    </div>
  );
}
