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
  if (diffD < 7) return `${diffD} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

// ---- feed helpers ----
function domainFavicon(url: string | null) {
  if (!url) return null;
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch { return null; }
}

const LOAI_VAN_BAN: Record<string, string> = {
  price_notification: "Thông báo giá",
  regulation: "Quy định",
  circular: "Thông tư",
  decision: "Quyết định",
};
const MAU_VAN_BAN: Record<string, string> = {
  price_notification: "bg-blue-500/10 text-blue-300",
  regulation: "bg-amber-500/10 text-amber-300",
  circular: "bg-purple-500/10 text-purple-300",
  decision: "bg-emerald-500/10 text-emerald-300",
};

const TEN_TAC_VU: Record<string, string> = {
  review: "Kiểm tra toàn bộ",
  price_update: "Cập nhật giá",
};

// ───────────────────────── Main page ─────────────────────────
export default function HomePage() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();

  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [feed, setFeed] = useState<OfficialFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: TaskType;
    params?: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    api.listEstimates().then((e) => alive && setEstimates(e)).catch(() => {});

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

  function goWithTask(id: string, type: TaskType, params?: Record<string, string>) {
    setPendingTask({ estimateId: id, type, params: params ?? {} });
    setPendingAction(null);
    router.push(`/estimate/${id}`);
  }

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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Workspace picker dialog */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPendingAction(null)}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <p className="text-[13px] font-semibold text-zinc-100">Chọn workspace</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Tác vụ:{" "}
                  <span className="text-accent-400">
                    {TEN_TAC_VU[pendingAction.type] ?? pendingAction.type}
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

            <div className="max-h-72 overflow-y-auto p-2">
              {estimates.map((est) => (
                <button
                  key={est.id}
                  onClick={() => goWithTask(est.id, pendingAction.type, pendingAction.params)}
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

            <div className="border-t border-zinc-800 px-5 py-3">
              <button
                onClick={() => { setPendingAction(null); createWorkspace(); }}
                disabled={creating}
                className="flex items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-accent-400 disabled:opacity-40"
              >
                <span>＋</span> Tạo workspace mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Nội dung chính ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6">

          {/* Tác vụ nhanh */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-base">⚡</span>
              <h2 className="text-sm font-semibold text-zinc-200">Tác vụ nhanh</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => triggerAction("review")}
                className="group rounded-xl border border-blue-700/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-blue-600/50 hover:shadow-lg hover:shadow-blue-900/20"
              >
                <div className="mb-3 text-2xl">🔍</div>
                <div className="text-[14px] font-semibold text-zinc-100">Kiểm tra workbook</div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  AI kiểm tra toàn bộ — lỗi giá, trùng lặp, bất thường
                </p>
                <div className="mt-3 text-[11px] font-medium text-blue-400 group-hover:text-blue-300">
                  Mở Agent →
                </div>
              </button>

              <button
                onClick={() => triggerAction("price_update", { province: "TP.HCM" })}
                className="group rounded-xl border border-emerald-700/30 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-600/50 hover:shadow-lg hover:shadow-emerald-900/20"
              >
                <div className="mb-3 text-2xl">💰</div>
                <div className="text-[14px] font-semibold text-zinc-100">Cập nhật giá</div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Tra cứu giá mới từ Sở XD → so sánh → đề xuất
                </p>
                <div className="mt-3 text-[11px] font-medium text-emerald-400 group-hover:text-emerald-300">
                  Mở Agent →
                </div>
              </button>
            </div>
          </section>

          {/* Tiếp tục làm việc */}
          {estimates.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">📁</span>
                  <h2 className="text-sm font-semibold text-zinc-200">Tiếp tục làm việc</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600">{estimates.length} workspace</span>
                  <button
                    onClick={createWorkspace}
                    disabled={creating}
                    className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
                  >
                    <span>＋</span> Tạo mới
                  </button>
                </div>
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
                        <div className="mt-1 hidden items-center gap-2 text-[10px] group-hover:flex">
                          {(est.costs?.total ?? 0) > 0 ? (
                            <span className="text-emerald-500">✓ Có giá</span>
                          ) : (
                            <span className="text-amber-500">⚠ Chưa có giá</span>
                          )}
                          <span className="text-zinc-600">·</span>
                          <span className="text-zinc-500">{fmtDate(est.updatedAt)}</span>
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

          {/* Trạng thái trống */}
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
                Tạo workspace
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Cột phải: văn bản mới ── */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-800 xl:block">
        <div className="p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <span className="text-sm">📡</span>
            <span className="text-xs font-semibold text-zinc-200">Văn bản mới</span>
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
              Không có dữ liệu
            </div>
          ) : (
            <div className="space-y-2">
              {feed.map((item, i) => (
                <button
                  key={i}
                  onClick={() => { if (item.url) window.open(item.url, "_blank", "noopener"); }}
                  className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
                >
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
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px]", MAU_VAN_BAN[item.type] ?? "bg-zinc-800 text-zinc-400")}>
                        {LOAI_VAN_BAN[item.type] ?? item.type}
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
      </aside>
    </div>
  );
}
