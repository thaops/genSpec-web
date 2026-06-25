"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider";
import { setPendingPrompt } from "@/lib/pendingPrompt";
import type { EstimateListItem, OfficialFeedItem } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---- formatters ----
function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);
  if (diffH < 1) return "vừa xong";
  if (diffH < 24) return `${diffH}h trước`;
  if (diffD < 7) return `${diffD}d trước`;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

// ---- type badge for feed ----
const TYPE_LABELS: Record<string, string> = {
  price_notification: "Thông báo giá",
  regulation: "Quy định",
  circular: "Thông tư",
  decision: "Quyết định",
};
const TYPE_COLORS: Record<string, string> = {
  price_notification: "bg-blue-500/10 text-blue-300",
  regulation: "bg-amber-500/10 text-amber-300",
  circular: "bg-purple-500/10 text-purple-300",
  decision: "bg-emerald-500/10 text-emerald-300",
};

// ---- AI Command Center quick actions ----
const AI_COMMANDS = [
  {
    icon: "🔍",
    label: "Review Workbook",
    prompt: "Review toàn bộ workbook: kiểm tra công thức, giá, trùng lặp, ước tính sai lệch",
    color: "from-blue-500/10 to-blue-600/5 border-blue-700/30",
  },
  {
    icon: "💰",
    label: "Cập nhật giá",
    prompt: "Tìm và cập nhật giá vật liệu mới nhất từ nguồn chính thức cho toàn bộ workspace",
    color: "from-emerald-500/10 to-emerald-600/5 border-emerald-700/30",
  },
  {
    icon: "📋",
    label: "Phân tích BOQ",
    prompt: "Phân tích BOQ chi tiết: kiểm tra định mức, đơn giá, phát hiện mục thiếu",
    color: "from-violet-500/10 to-violet-600/5 border-violet-700/30",
  },
  {
    icon: "🔢",
    label: "Tra mã hiệu",
    prompt: "Tra cứu mã hiệu công tác xây dựng theo định mức hiện hành",
    color: "from-amber-500/10 to-amber-600/5 border-amber-700/30",
  },
  {
    icon: "📐",
    label: "Tối ưu dự toán",
    prompt: "Phân tích và đề xuất tối ưu hóa dự toán: cắt giảm chi phí, điều chỉnh khối lượng",
    color: "from-rose-500/10 to-rose-600/5 border-rose-700/30",
  },
  {
    icon: "📜",
    label: "Văn bản pháp lý",
    prompt: "Tìm và tóm tắt văn bản pháp luật xây dựng mới nhất liên quan đến dự toán",
    color: "from-cyan-500/10 to-cyan-600/5 border-cyan-700/30",
  },
];

export default function HomePage() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();

  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [feed, setFeed] = useState<OfficialFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cmdCreating, setCmdCreating] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.listEstimates().then((e) => alive && setEstimates(e)).catch(() => {});
    api.getHomeFeed()
      .then((f) => { if (alive) { setFeed(f); setFeedLoading(false); } })
      .catch(() => { if (alive) setFeedLoading(false); });
    return () => { alive = false; };
  }, []);

  async function createWorkspace(name?: string) {
    if (creating) return;
    setCreating(true);
    try {
      const est = await api.createEstimate(name || t("home.defaultName"));
      router.push(`/estimate/${est.id}`);
    } catch (err) {
      toast.error(t("dashboard.createFailed"), (err as ApiError).message);
      setCreating(false);
    }
  }

  async function runCommand(cmd: typeof AI_COMMANDS[0]) {
    if (cmdCreating) return;
    setCmdCreating(cmd.label);
    try {
      let targetId: string;
      if (estimates.length > 0) {
        targetId = estimates[0].id;
      } else {
        const est = await api.createEstimate(t("home.defaultName"));
        targetId = est.id;
      }
      setPendingPrompt({ estimateId: targetId, message: cmd.prompt, files: [] });
      router.push(`/estimate/${targetId}`);
    } catch (err) {
      toast.error("Lỗi", (err as ApiError).message);
      setCmdCreating(null);
    }
  }

  // KPIs
  const totalBudget = estimates.reduce((s, e) => s + (e.costs?.total ?? 0), 0);
  const totalWorkspaces = estimates.length;
  const totalItems = estimates.reduce((s, e) => s + (e.takeoffCount ?? 0), 0);
  const recentCount = estimates.filter(
    (e) => Date.now() - new Date(e.updatedAt).getTime() < 7 * 86_400_000
  ).length;

  const KPI_DATA = [
    { icon: "📁", label: "Workspaces", value: totalWorkspaces.toString(), sub: `${recentCount} hoạt động tuần này` },
    { icon: "💰", label: "Tổng ngân sách", value: totalBudget > 0 ? `${fmt(totalBudget)} VNĐ` : "—", sub: "trên tất cả workspace" },
    { icon: "📋", label: "Công tác", value: totalItems.toString(), sub: "tổng số hạng mục" },
    { icon: "🧠", label: "AI sẵn sàng", value: "Active", sub: "Gemini 2.5 Flash" },
  ];

  // Estimates needing review (those with more items = more complex)
  const reviewQueue = estimates
    .filter((e) => e.takeoffCount > 0)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main scroll area ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6">

          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {KPI_DATA.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <div className="mb-2 text-xl">{kpi.icon}</div>
                <div className="text-[11px] text-zinc-500">{kpi.label}</div>
                <div className="text-base font-semibold text-zinc-100">{kpi.value}</div>
                <div className="mt-0.5 text-[10px] text-zinc-600">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* AI Command Center */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-base">🧠</span>
              <h2 className="text-sm font-semibold text-zinc-200">AI Command Center</h2>
              <span className="rounded-full border border-accent-700/40 bg-accent-500/10 px-2 py-0.5 text-[10px] text-accent-300">
                Agent mode
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AI_COMMANDS.map((cmd) => (
                <button
                  key={cmd.label}
                  onClick={() => runCommand(cmd)}
                  disabled={!!cmdCreating}
                  className={cn(
                    "rounded-xl border bg-gradient-to-br p-3.5 text-left transition-all hover:-translate-y-px hover:shadow-lg disabled:opacity-60",
                    cmd.color
                  )}
                >
                  <div className="mb-1.5 text-xl">{cmd.icon}</div>
                  <div className="text-[13px] font-medium text-zinc-200">
                    {cmdCreating === cmd.label ? (
                      <span className="animate-pulse">Đang mở...</span>
                    ) : (
                      cmd.label
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Create Workspace */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-base">➕</span>
              <h2 className="text-sm font-semibold text-zinc-200">Tạo Workspace</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={() => createWorkspace()}
                disabled={creating}
                className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-left transition-colors hover:border-accent-600 hover:bg-accent-500/5 disabled:opacity-60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-300">
                  ✨
                </span>
                <div>
                  <div className="text-[13px] font-medium text-zinc-200">Workspace trống</div>
                  <div className="text-[11px] text-zinc-500">Bắt đầu từ đầu</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setPendingPrompt({ estimateId: "__new__", message: "Import và phân tích file Excel này", files: [] });
                  createWorkspace("Import từ Excel");
                }}
                disabled={creating}
                className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800/40 disabled:opacity-60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                  📥
                </span>
                <div>
                  <div className="text-[13px] font-medium text-zinc-200">Import Excel</div>
                  <div className="text-[11px] text-zinc-500">Từ file dự toán có sẵn</div>
                </div>
              </button>
              <button
                onClick={() => {
                  const prompt = "Tạo dự toán mẫu cho công trình nhà ở dân dụng 3 tầng, diện tích 120m², khu vực TP.HCM";
                  if (estimates.length > 0) {
                    setPendingPrompt({ estimateId: estimates[0].id, message: prompt, files: [] });
                    router.push(`/estimate/${estimates[0].id}`);
                  } else {
                    setPendingPrompt({ estimateId: "__new__", message: prompt, files: [] });
                    createWorkspace("Dự toán mẫu nhà ở");
                  }
                }}
                disabled={creating}
                className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800/40 disabled:opacity-60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                  📄
                </span>
                <div>
                  <div className="text-[13px] font-medium text-zinc-200">Từ mẫu AI</div>
                  <div className="text-[11px] text-zinc-500">AI tạo dự toán mẫu</div>
                </div>
              </button>
            </div>
          </section>

          {/* Continue Working */}
          {estimates.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">📁</span>
                  <h2 className="text-sm font-semibold text-zinc-200">Tiếp tục làm việc</h2>
                </div>
                <span className="text-xs text-zinc-600">{estimates.length} workspace</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {estimates.slice(0, 6).map((est) => (
                  <button
                    key={est.id}
                    onClick={() => router.push(`/estimate/${est.id}`)}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-base">
                      📋
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-zinc-200">{est.name}</div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                        <span>{est.takeoffCount} công tác</span>
                        {est.costs?.total > 0 && (
                          <>
                            <span>·</span>
                            <span>{fmt(est.costs.total)} VNĐ</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-600">
                      {fmtDate(est.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Recent Activity */}
          {estimates.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
              <div className="mb-3 text-4xl">🏗️</div>
              <h3 className="text-sm font-medium text-zinc-300">Chào mừng đến GenSpec</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Tạo workspace đầu tiên hoặc dùng AI Command Center để bắt đầu
              </p>
              <button
                onClick={() => createWorkspace()}
                className="mt-4 rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-500"
              >
                Tạo Workspace
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-800 xl:block">
        <div className="space-y-5 p-4">

          {/* Official Feed */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">📡</span>
                <span className="text-xs font-semibold text-zinc-200">Official Feed</span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                Live
              </span>
            </div>

            {feedLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-800/60" />
                ))}
              </div>
            ) : feed.length === 0 ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center text-[11px] text-zinc-500">
                Không có dữ liệu feed
              </div>
            ) : (
              <div className="space-y-2">
                {feed.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                  >
                    <div className="mb-1.5 flex items-start gap-2">
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                          TYPE_COLORS[item.type] ?? "bg-zinc-800 text-zinc-400"
                        )}
                      >
                        {TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                        {Array.from({ length: Math.round(item.trustScore * 5) }, (_, j) => (
                          <span key={j} className="text-amber-400">★</span>
                        ))}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[12px] leading-snug text-zinc-300">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent-300 hover:underline"
                        >
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-600">
                      <span>{item.region}</span>
                      {item.issuedDate && (
                        <>
                          <span>·</span>
                          <span>{item.issuedDate}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review Queue */}
          {reviewQueue.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-1.5">
                <span className="text-sm">🔍</span>
                <span className="text-xs font-semibold text-zinc-200">Review Queue</span>
              </div>
              <div className="space-y-2">
                {reviewQueue.map((est) => (
                  <button
                    key={est.id}
                    onClick={() => {
                      setPendingPrompt({
                        estimateId: est.id,
                        message: "Review toàn bộ workbook này: kiểm tra công thức, giá, trùng lặp, phát hiện lỗi",
                        files: [],
                      });
                      router.push(`/estimate/${est.id}`);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/60"
                  >
                    <span className="text-sm">📋</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-zinc-300">{est.name}</div>
                      <div className="text-[10px] text-zinc-600">{est.takeoffCount} công tác</div>
                    </div>
                    <span className="shrink-0 text-[10px] text-amber-400">Review →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Project Intelligence */}
          <div>
            <div className="mb-3 flex items-center gap-1.5">
              <span className="text-sm">🧠</span>
              <span className="text-xs font-semibold text-zinc-200">Project Intelligence</span>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              {totalWorkspaces === 0 ? (
                <p className="text-center text-[11px] text-zinc-500">
                  Tạo workspace để xem AI insights
                </p>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Workspaces active</span>
                    <span className="font-medium text-zinc-300">{totalWorkspaces}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Tổng ngân sách</span>
                    <span className="font-medium text-zinc-300">
                      {totalBudget > 0 ? `${fmt(totalBudget)} VNĐ` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Tổng công tác</span>
                    <span className="font-medium text-zinc-300">{totalItems}</span>
                  </div>
                  {estimates.length > 0 && (
                    <button
                      onClick={() => router.push(`/estimate/${estimates[0].id}?view=insights`)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 py-1.5 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-700"
                    >
                      Xem Insights chi tiết →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
