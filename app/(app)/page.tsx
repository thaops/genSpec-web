"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider";
import { setPendingTask, type TaskType } from "@/lib/pendingTask";
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
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  const diffD = Math.floor(diffH / 24);
  if (diffH < 1) return "vừa xong";
  if (diffH < 24) return `${diffH}h trước`;
  if (diffD < 7) return `${diffD}d trước`;
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

// ---- feed helpers ----
function domainFavicon(url: string | null) {
  if (!url) return null;
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch { return null; }
}

// ---- feed badges ----
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


// ───────────────────────── Main page ─────────────────────────
export default function HomePage() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();

  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [feed, setFeed] = useState<OfficialFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedFullscreen, setFeedFullscreen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: TaskType;
    params?: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    api.listEstimates().then((e) => alive && setEstimates(e)).catch(() => {});

    // Daily cache: only re-fetch if cache is older than 24h
    const CACHE_KEY = "genspec_official_feed_v1";
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, fetchedAt } = JSON.parse(raw) as { data: OfficialFeedItem[]; fetchedAt: number };
        if (Date.now() - fetchedAt < CACHE_TTL) {
          if (alive) { setFeed(data); setFeedLoading(false); }
          return () => { alive = false; };
        }
      }
    } catch { /* ignore */ }

    api
      .getHomeFeed()
      .then((f) => {
        if (!alive) return;
        setFeed(f);
        setFeedLoading(false);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: f, fetchedAt: Date.now() })); } catch { /* ignore */ }
      })
      .catch(() => { if (alive) setFeedLoading(false); });
    return () => { alive = false; };
  }, []);

  // Navigate to a specific workspace with a task card.
  function goWithTask(id: string, type: TaskType, params?: Record<string, string>) {
    setPendingTask({ estimateId: id, type, params: params ?? {} });
    setPendingAction(null);
    router.push(`/estimate/${id}`);
  }

  // Click action → if 0 workspaces: create new; if 1: go directly; if many: show picker.
  async function triggerAction(type: TaskType, params?: Record<string, string>) {
    if (estimates.length === 0) {
      setCreating(true);
      try {
        const est = await api.createEstimate(t("home.defaultName"));
        setPendingTask({ estimateId: est.id, type, params: params ?? {} });
        router.push(`/estimate/${est.id}`);
      } catch (err) {
        toast.error("Lỗi", (err as ApiError).message);
        setCreating(false);
      }
    } else if (estimates.length === 1) {
      goWithTask(estimates[0].id, type, params);
    } else {
      // Multiple workspaces → show inline picker
      setPendingAction({ type, params });
    }
  }

  async function createWorkspace() {
    if (creating) return;
    setCreating(true);
    try {
      const est = await api.createEstimate(t("home.defaultName"));
      router.push(`/estimate/${est.id}`);
    } catch (err) {
      toast.error(t("dashboard.createFailed"), (err as ApiError).message);
      setCreating(false);
    }
  }

  // KPIs
  const officialUpdates = feed.length;
  const needReview = estimates.filter((e) => e.takeoffCount > 0).length;
  const healthyCount = estimates.filter((e) => e.itemCount > 0 && (e.costs?.total ?? 0) > 0).length;
  const healthPct = estimates.length > 0 ? Math.round((healthyCount / estimates.length) * 100) : 0;

  const reviewQueue = estimates
    .filter((e) => e.takeoffCount > 0)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  const TASK_LABEL: Record<string, string> = {
    review: "Review Workbook",
    price_update: "Cập nhật giá",
    code_lookup: "Tra mã hiệu",
    boq_analysis: "Phân tích BOQ",
    optimize: "Tối ưu",
    legal: "Văn bản pháp lý",
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Workspace picker dialog */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPendingAction(null)}
          />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <p className="text-[13px] font-semibold text-zinc-100">
                  Chọn workspace
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Mở với tác vụ:{" "}
                  <span className="text-accent-400">
                    {TASK_LABEL[pendingAction.type] ?? pendingAction.type}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setPendingAction(null)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            {/* List */}
            <div className="max-h-72 overflow-y-auto p-2">
              {estimates.map((est) => (
                <button
                  key={est.id}
                  onClick={() =>
                    goWithTask(est.id, pendingAction.type, pendingAction.params)
                  }
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800/70"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-base group-hover:bg-zinc-700">
                    📋
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">
                      {est.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {est.takeoffCount} công tác · {fmtDate(est.updatedAt)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[12px] text-accent-500 opacity-0 transition-opacity group-hover:opacity-100">
                    Mở →
                  </span>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-5 py-3">
              <button
                onClick={() => {
                  setPendingAction(null);
                  createWorkspace();
                }}
                disabled={creating}
                className="flex items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-accent-400 disabled:opacity-40"
              >
                <span>＋</span> Tạo workspace mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6">

          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              onClick={() => document.getElementById("official-feed")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-base">📡</span>
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400">
                  Live
                </span>
              </div>
              <div className="text-[10px] text-zinc-500">Official Updates</div>
              <div className="text-lg font-semibold text-zinc-100">
                {feedLoading ? "—" : officialUpdates}
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">văn bản mới</div>
            </button>

            <button
              onClick={() => needReview > 0 && triggerAction("review")}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition-colors hover:border-amber-700/40 hover:bg-amber-500/5"
            >
              <div className="mb-2 text-base">⚠️</div>
              <div className="text-[10px] text-zinc-500">Need Review</div>
              <div className={cn("text-lg font-semibold", needReview > 0 ? "text-amber-400" : "text-zinc-100")}>
                {needReview}
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">workspace cần kiểm tra</div>
            </button>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-2 text-base">📋</div>
              <div className="text-[10px] text-zinc-500">Pending Proposal</div>
              <div className="text-lg font-semibold text-zinc-500">—</div>
              <div className="mt-0.5 text-[10px] text-zinc-600">chưa áp dụng</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-2 text-base">💚</div>
              <div className="text-[10px] text-zinc-500">Workbook Health</div>
              <div
                className={cn(
                  "text-lg font-semibold",
                  healthPct >= 70 ? "text-emerald-400" : healthPct > 0 ? "text-amber-400" : "text-zinc-500",
                )}
              >
                {estimates.length > 0 ? `${healthPct}%` : "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">
                {healthyCount}/{estimates.length} workspace
              </div>
            </div>
          </div>

          {/* Workspace Actions */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-base">⚡</span>
              <h2 className="text-sm font-semibold text-zinc-200">Workspace Actions</h2>
              <span className="text-[11px] text-zinc-600">— click để mở Agent Console</span>
            </div>

            {/* Primary — 2 large cards */}
            <div className="mb-2.5 grid grid-cols-2 gap-3">
              <button
                onClick={() => triggerAction("review")}
                className="group rounded-xl border border-blue-700/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-blue-600/50 hover:shadow-lg hover:shadow-blue-900/20"
              >
                <div className="mb-3 text-2xl">🔍</div>
                <div className="text-[14px] font-semibold text-zinc-100">Review Workbook</div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  AI kiểm tra toàn bộ — lỗi giá, trùng lặp, bất thường
                </p>
                <div className="mt-3 text-[11px] font-medium text-blue-400 group-hover:text-blue-300">
                  Review Agent →
                </div>
              </button>

              <button
                onClick={() => triggerAction("price_update", { province: "TP.HCM" })}
                className="group rounded-xl border border-emerald-700/30 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-600/50 hover:shadow-lg hover:shadow-emerald-900/20"
              >
                <div className="mb-3 text-2xl">💰</div>
                <div className="text-[14px] font-semibold text-zinc-100">Cập nhật giá</div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Tra cứu giá mới từ Sở XD → so sánh → Proposal
                </p>
                <div className="mt-3 text-[11px] font-medium text-emerald-400 group-hover:text-emerald-300">
                  Price Update Agent →
                </div>
              </button>
            </div>

            {/* Secondary — 4 smaller cards */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { type: "code_lookup" as TaskType,  icon: "🔢", label: "Tra mã hiệu",   sub: "Định mức" },
                { type: "boq_analysis" as TaskType, icon: "📊", label: "Phân tích BOQ", sub: "Chi phí" },
                { type: "optimize" as TaskType,     icon: "✨", label: "Tối ưu",         sub: "Tiết kiệm" },
                { type: "legal" as TaskType,        icon: "📜", label: "Văn bản",        sub: "Pháp lý" },
              ].map((a) => (
                <button
                  key={a.type}
                  onClick={() => triggerAction(a.type)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-800/60"
                >
                  <div className="mb-2 text-lg">{a.icon}</div>
                  <div className="text-[12px] font-medium text-zinc-300">{a.label}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-600">{a.sub}</div>
                </button>
              ))}
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
                  <div key={est.id} className="group">
                    <button
                      onClick={() => router.push(`/estimate/${est.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800/50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-base">
                        {est.takeoffCount > 0 ? "📋" : "📄"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-zinc-200">
                          {est.name}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <span>{est.takeoffCount} công tác</span>
                          {(est.costs?.total ?? 0) > 0 && (
                            <>
                              <span>·</span>
                              <span>{fmt(est.costs.total)} VNĐ</span>
                            </>
                          )}
                        </div>
                        {/* Hover extras */}
                        <div className="mt-1 hidden items-center gap-2 text-[10px] group-hover:flex">
                          {(est.costs?.total ?? 0) > 0 ? (
                            <span className="text-emerald-500">✓ Có giá</span>
                          ) : (
                            <span className="text-amber-500">⚠ Chưa có giá</span>
                          )}
                          <span className="text-zinc-600">·</span>
                          <span className="text-zinc-500">
                            {fmtDate(est.updatedAt)}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-zinc-600 group-hover:hidden">
                        {fmtDate(est.updatedAt)}
                      </span>
                      <span className="hidden shrink-0 text-[11px] text-accent-400 group-hover:block">
                        Mở →
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {estimates.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
              <div className="mb-3 text-4xl">🏗️</div>
              <h3 className="text-sm font-medium text-zinc-300">Chào mừng đến GenSpec</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Tạo workspace đầu tiên để bắt đầu lập dự toán
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

      {/* ── Official Feed Fullscreen overlay ── */}
      {feedFullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📡</span>
              <span className="text-sm font-semibold text-zinc-100">Official Feed</span>
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                Live
              </span>
            </div>
            <button
              onClick={() => setFeedFullscreen(false)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              ✕ Thu gọn
            </button>
          </div>
          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {feedLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="h-52 animate-pulse rounded-xl bg-zinc-800/60" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {feed.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => { setFeedFullscreen(false); if (item.url) window.open(item.url, "_blank", "noopener"); }}
                    className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 text-left transition-all hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30"
                  >
                    {/* Image / placeholder */}
                    <div className="relative h-36 w-full overflow-hidden">
                      {item.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div className={cn(
                        "absolute inset-0 flex flex-col items-center justify-center gap-2",
                        item.type === "price_notification" ? "bg-gradient-to-br from-blue-900/60 to-blue-950/80" :
                        item.type === "circular" ? "bg-gradient-to-br from-purple-900/60 to-purple-950/80" :
                        item.type === "decision" ? "bg-gradient-to-br from-emerald-900/60 to-emerald-950/80" :
                        "bg-gradient-to-br from-amber-900/60 to-amber-950/80",
                        item.imageUrl ? "opacity-0" : "opacity-100",
                      )}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {domainFavicon(item.url) && <img src={domainFavicon(item.url)!} alt="" className="h-8 w-8 rounded opacity-80" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                        <span className="text-[10px] text-zinc-400 opacity-80">{item.source}</span>
                      </div>
                    </div>
                    {/* Content */}
                    <div className="flex flex-1 flex-col p-3">
                      <span className={cn("mb-1.5 w-fit rounded px-1.5 py-0.5 text-[10px]", TYPE_COLORS[item.type] ?? "bg-zinc-800 text-zinc-400")}>
                        {TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      <p className="line-clamp-2 flex-1 text-[12px] font-medium leading-snug text-zinc-200 group-hover:text-white">
                        {item.title}
                      </p>
                      {item.summary && (
                        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">
                          {item.summary}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-600">
                        <span>{item.region}</span>
                        {item.issuedDate && <><span>·</span><span>{item.issuedDate}</span></>}
                        <span className="ml-auto text-amber-500/70">
                          {Array.from({ length: Math.min(5, Math.round(item.trustScore / 20)) }, (_, j) => (
                            <span key={j}>★</span>
                          ))}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Right panel ── */}
      <aside
        id="official-feed"
        className="hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-800 xl:block"
      >
        <div className="space-y-5 p-4">

          {/* Official Feed */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">📡</span>
                <span className="text-xs font-semibold text-zinc-200">Official Feed</span>
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                  Live
                </span>
              </div>
              <button
                onClick={() => setFeedFullscreen(true)}
                title="Xem toàn màn hình"
                className="rounded-md p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                ⛶
              </button>
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
                  <button
                    key={i}
                    onClick={() => { if (item.url) window.open(item.url, "_blank", "noopener"); }}
                    className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
                  >
                    {/* Thumbnail */}
                    <div className="relative h-20 w-full overflow-hidden">
                      {item.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div className={cn(
                        "absolute inset-0 flex items-center justify-center gap-2",
                        item.type === "price_notification" ? "bg-gradient-to-r from-blue-900/50 to-blue-950/70" :
                        item.type === "circular" ? "bg-gradient-to-r from-purple-900/50 to-purple-950/70" :
                        item.type === "decision" ? "bg-gradient-to-r from-emerald-900/50 to-emerald-950/70" :
                        "bg-gradient-to-r from-amber-900/50 to-amber-950/70",
                        item.imageUrl ? "opacity-0" : "opacity-100",
                      )}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {domainFavicon(item.url) && <img src={domainFavicon(item.url)!} alt="" className="h-6 w-6 rounded opacity-70" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                        <span className="text-[9px] text-zinc-500">{item.source}</span>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px]", TYPE_COLORS[item.type] ?? "bg-zinc-800 text-zinc-400")}>
                          {TYPE_LABELS[item.type] ?? item.type}
                        </span>
                        <span className="ml-auto text-[10px] text-amber-500/80">
                          {Array.from({ length: Math.min(5, Math.round(item.trustScore / 20)) }, (_, j) => (
                            <span key={j}>★</span>
                          ))}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[12px] leading-snug text-zinc-300">
                        {item.title}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-600">
                        <span>{item.region}</span>
                        {item.issuedDate && <><span>·</span><span>{item.issuedDate}</span></>}
                        <span className="ml-auto text-zinc-700">Xem →</span>
                      </div>
                    </div>
                  </button>
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
                      setPendingTask({ estimateId: est.id, type: "review" });
                      router.push(`/estimate/${est.id}`);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/60"
                  >
                    <span className="text-sm">📋</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-zinc-300">
                        {est.name}
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {est.takeoffCount} công tác
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] text-amber-400">Review →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </aside>
    </div>
  );
}
