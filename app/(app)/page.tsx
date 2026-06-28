"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider";
import { setPendingTask, type TaskType } from "@/lib/pendingTask";
import type { EstimateListItem, OfficialFeedItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { X, Plus, Building2, Search, Ruler, BarChart3, ScanSearch, DollarSign, FileText, CheckCircle2 } from "lucide-react";

// ── Formatters ───────────────────────────────────────────────
function fmtDate(iso: string) {
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  const diffD = Math.floor(diffH / 24);
  if (diffH < 1) return "vừa xong";
  if (diffH < 24) return `${diffH}h trước`;
  if (diffD < 7) return `${diffD} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function workspaceStatus(updatedAt: string): { dot: string; label: string } {
  const diffH = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 3_600_000);
  if (diffH < 24) return { dot: "bg-emerald-500", label: "Đang làm việc" };
  if (diffH < 24 * 7) return { dot: "bg-amber-500", label: "Gần đây" };
  return { dot: "bg-zinc-600", label: "Không hoạt động" };
}

// Deterministic placeholder color from string hash
function placeholderColor(id: string) {
  const PALETTES = [
    ["from-blue-900/80", "to-blue-950"],
    ["from-violet-900/80", "to-violet-950"],
    ["from-emerald-900/80", "to-emerald-950"],
    ["from-rose-900/80", "to-rose-950"],
    ["from-amber-900/80", "to-amber-950"],
    ["from-cyan-900/80", "to-cyan-950"],
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

// ── Feed config ──────────────────────────────────────────────
const FEED_BADGE: Record<string, string> = {
  price_notification: "Thông báo giá",
  regulation: "Quy định",
  circular: "Thông tư",
  decision: "Quyết định",
};
const FEED_COLOR: Record<string, string> = {
  price_notification: "text-blue-400 bg-blue-500/10",
  regulation: "text-amber-400 bg-amber-500/10",
  circular: "text-purple-400 bg-purple-500/10",
  decision: "text-emerald-400 bg-emerald-500/10",
};

const TEN_TAC_VU: Record<string, string> = {
  review: "Kiểm tra toàn bộ",
  price_update: "Cập nhật giá",
};

// ── Task progress ─────────────────────────────────────────────
function computeTaskProgress(est: EstimateListItem): {
  pct: number;
  nextAction: string;
  doneSteps: number;
  totalSteps: number;
} {
  const steps = [
    est.drawingCount > 0,
    est.drawingCount > 0, // assume detected if drawing exists
    est.takeoffCount > 0,
    (est.itemCount ?? 0) > 0 || (est.costs?.total ?? 0) > 0,
  ];
  const doneSteps = steps.filter(Boolean).length;
  const totalSteps = steps.length;
  const pct = Math.round((doneSteps / totalSteps) * 100);
  const nextIdx = steps.findIndex((s) => !s);
  const labels = ["Upload bản vẽ", "AI phân tích", "Bóc khối lượng", "Hoàn thiện BOQ"];
  const nextAction = nextIdx >= 0 ? labels[nextIdx] : "Sẵn sàng xuất";
  return { pct, nextAction, doneSteps, totalSteps };
}

// ── Workspace Card ────────────────────────────────────────────
function WorkspaceCard({
  est,
  onClick,
}: {
  est: EstimateListItem;
  onClick: () => void;
}) {
  const status = workspaceStatus(est.updatedAt);
  const task = computeTaskProgress(est);
  const [colors] = useState(() => placeholderColor(est.id));
  const [imgErr, setImgErr] = useState(false);
  const showImg = !!est.thumbnail && !imgErr;

  const initials = est.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 text-left transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 hover:shadow-xl hover:shadow-black/40"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={est.thumbnail!}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center bg-gradient-to-br",
              colors[0],
              colors[1],
            )}
          >
            {initials ? (
              <span className="text-3xl font-bold text-white/20 select-none">
                {initials}
              </span>
            ) : (
              <Building2 className="h-10 w-10 text-white/20" />
            )}
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-950/60 to-transparent" />

        {/* Drawing badge */}
        {est.drawingCount > 0 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm">
            <Ruler className="h-3 w-3" />
            <span>{est.drawingCount}</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        {/* Name */}
        <div>
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-100 group-hover:text-white">
            {est.name}
          </span>
          {est.projectInfo?.location && (
            <p className="mt-0.5 truncate text-[11px] text-zinc-600">
              {est.projectInfo.location}
            </p>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">{task.nextAction}</span>
            <span className="text-zinc-600">{task.pct}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                task.pct === 100 ? "bg-emerald-500" : "bg-accent-500"
              )}
              style={{ width: `${task.pct}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between border-t border-zinc-800/60 pt-2">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
            <span className="text-[11px] text-zinc-500">{fmtDate(est.updatedAt)}</span>
          </div>
          <span className="text-[11px] font-medium text-accent-500 opacity-0 transition-opacity group-hover:opacity-100">
            Tiếp tục →
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
      <Building2 className="mb-3 h-8 w-8 text-zinc-600" />
      <p className="text-[13px] font-medium text-zinc-400">Chào mừng đến GenSpec</p>
      <p className="mt-1 text-[12px] text-zinc-600">
        Tạo workspace đầu tiên để bắt đầu lập dự toán
      </p>
      <button
        onClick={onCreate}
        className="mt-5 rounded-lg bg-accent-600 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-accent-500"
      >
        Tạo workspace
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function HomePage() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();

  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [feed, setFeed] = useState<OfficialFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
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

  const filtered = search.trim()
    ? estimates.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          (e.projectInfo?.location ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : estimates;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Workspace picker dialog ── */}
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
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {estimates.map((est) => (
                <button
                  key={est.id}
                  onClick={() => goWithTask(est.id, pendingAction.type, pendingAction.params)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800/70"
                >
                  <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                    {est.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={est.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-700">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">
                      {est.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {fmtDate(est.updatedAt)}
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
                <Plus className="h-3 w-3" /> Tạo workspace mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">

          {/* Search + New */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm workspace..."
                className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-9 pr-4 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
              />
            </div>
            <button
              onClick={createWorkspace}
              disabled={creating}
              className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-accent-600 px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
            >
              <span>+</span>
              <span>New Workspace</span>
            </button>
          </div>

          {/* Quick Actions */}
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
              Quick Actions
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => triggerAction("review")}
                className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3.5 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800/60"
              >
                <Search className="h-5 w-5 text-blue-400 shrink-0" />
                <div>
                  <div className="text-[13px] font-medium text-zinc-200 group-hover:text-white">
                    Review Workbook
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-600">
                    AI kiểm tra lỗi giá, trùng lặp
                  </div>
                </div>
              </button>

              <button
                onClick={() => triggerAction("price_update", { province: "TP.HCM" })}
                className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3.5 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800/60"
              >
                <DollarSign className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-[13px] font-medium text-zinc-200 group-hover:text-white">
                    Update Prices
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-600">
                    Tra giá mới từ Sở XD
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* Continue Working */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                Continue Working
              </p>
              {estimates.length > 0 && (
                <span className="text-[11px] text-zinc-700">{estimates.length} workspace</span>
              )}
            </div>

            {estimates.length === 0 && (
              <EmptyState onCreate={createWorkspace} />
            )}

            {estimates.length > 0 && filtered.length === 0 && (
              <div className="rounded-xl border border-zinc-800 py-10 text-center text-[12px] text-zinc-600">
                Không tìm thấy &ldquo;{search}&rdquo;
              </div>
            )}

            {filtered.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.slice(0, 9).map((est) => (
                  <WorkspaceCard
                    key={est.id}
                    est={est}
                    onClick={() => router.push(`/estimate/${est.id}`)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Right sidebar: Knowledge Feed ── */}
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-l border-zinc-800 xl:block">
        <div className="p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            Knowledge Feed
          </p>

          {feedLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-800/50" />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <p className="text-[11px] text-zinc-600">Không có dữ liệu</p>
          ) : (
            <div className="space-y-px">
              {feed.map((item, i) => (
                <button
                  key={i}
                  onClick={() => { if (item.url) window.open(item.url, "_blank", "noopener"); }}
                  className="group w-full rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-zinc-800/60"
                >
                  <span className={cn(
                    "inline-block rounded px-1.5 py-0.5 text-[9px] font-medium",
                    FEED_COLOR[item.type] ?? "text-zinc-400 bg-zinc-800",
                  )}>
                    {FEED_BADGE[item.type] ?? item.type}
                  </span>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-zinc-400 group-hover:text-zinc-200">
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-700">
                    <span>{item.region}</span>
                    {item.issuedDate && (
                      <>
                        <span>·</span>
                        <span>{item.issuedDate}</span>
                      </>
                    )}
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
