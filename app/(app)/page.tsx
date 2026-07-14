"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useNewWorkspaceModal } from "@/components/AppShell";
import type { EstimateListItem, OfficialFeedItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Building2, Search, Ruler, Plus, ArrowRight, MoreVertical, Pencil, Trash2 } from "lucide-react";

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
  if (diffH < 24) return { dot: "bg-emerald-500", label: "Đang làm" };
  if (diffH < 24 * 7) return { dot: "bg-amber-500", label: "Gần đây" };
  return { dot: "bg-zinc-600", label: "Nghỉ" };
}

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

// ── Tiến độ dự án (bước QS) ──────────────────────────────────
function computeTaskProgress(est: EstimateListItem): { pct: number; nextAction: string } {
  const steps = [
    est.drawingCount > 0,
    est.drawingCount > 0, // có bản vẽ ⇒ coi như đã nhận diện
    est.takeoffCount > 0,
    (est.itemCount ?? 0) > 0 || (est.costs?.total ?? 0) > 0,
  ];
  const done = steps.filter(Boolean).length;
  const pct = Math.round((done / steps.length) * 100);
  const nextIdx = steps.findIndex((s) => !s);
  const labels = ["Thêm bản vẽ", "AI nhận diện", "Bóc khối lượng", "Hoàn thiện dự toán"];
  return { pct, nextAction: nextIdx >= 0 ? labels[nextIdx] : "Sẵn sàng xuất" };
}

// ── Project Card ─────────────────────────────────────────────
function ProjectCard({
  est,
  onClick,
  onRename,
  onDelete,
}: {
  est: EstimateListItem;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const status = workspaceStatus(est.updatedAt);
  const task = computeTaskProgress(est);
  const [colors] = useState(() => placeholderColor(est.id));
  const [imgErr, setImgErr] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(est.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const showImg = !!est.thumbnail && !imgErr;
  const initials = est.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  function commitRename() {
    setRenaming(false);
    const name = draft.trim();
    if (name && name !== est.name) onRename(est.id, name);
    else setDraft(est.name);
  }

  const open = () => { if (!renaming && !menuOpen) onClick(); };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !renaming) { e.preventDefault(); open(); } }}
      className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 text-left transition-all duration-200 hover:border-accent-600/50 hover:bg-zinc-900 hover:shadow-xl hover:shadow-black/40"
    >
      {/* Menu ⋯ (hiện khi hover / mở) */}
      <div ref={menuRef} className="absolute right-2 top-2 z-20" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-zinc-300 backdrop-blur-sm transition-opacity hover:bg-black/70",
            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 w-36 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            <button
              onClick={() => { setMenuOpen(false); setDraft(est.name); setRenaming(true); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-zinc-800"
            >
              <Pencil className="h-3.5 w-3.5 text-zinc-400" /> Đổi tên
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(est.id); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-rose-300 hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Xóa dự án
            </button>
          </div>
        )}
      </div>

      <div className={cn("relative aspect-video w-full overflow-hidden bg-gradient-to-br", colors[0], colors[1])}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={est.thumbnail!} alt="" className="absolute inset-0 h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03]" onError={() => setImgErr(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {initials ? <span className="text-3xl font-bold text-white/20 select-none">{initials}</span> : <Building2 className="h-10 w-10 text-white/20" />}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-950/60 to-transparent" />
        {est.drawingCount > 0 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm">
            <Ruler className="h-3 w-3" />
            <span>{est.drawingCount}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div>
          {renaming ? (
            <input
              autoFocus
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setDraft(est.name); setRenaming(false); }
              }}
              className="w-full rounded-md border border-accent-500/60 bg-zinc-950 px-2 py-1 text-[13px] font-semibold text-zinc-100 focus:outline-none"
            />
          ) : (
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-100 group-hover:text-white">{est.name}</span>
          )}
          {est.projectInfo?.location && <p className="mt-0.5 truncate text-[11px] text-zinc-600">{est.projectInfo.location}</p>}
        </div>

        {/* Bước tiếp theo + tiến độ */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-accent-400/90">{task.nextAction}</span>
            <span className="text-zinc-600">{task.pct}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div className={cn("h-1 rounded-full transition-all duration-500", task.pct === 100 ? "bg-emerald-500" : "bg-accent-500")} style={{ width: `${task.pct}%` }} />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-zinc-800/60 pt-2">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
            <span className="text-[11px] text-zinc-500">{fmtDate(est.updatedAt)}</span>
          </div>
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-accent-500 opacity-0 transition-opacity group-hover:opacity-100">
            Mở <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Card "Tạo dự án mới" ─────────────────────────────────────
function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 text-zinc-600 transition-all hover:border-accent-600/60 hover:bg-accent-600/[0.04] hover:text-accent-400"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 group-hover:border-accent-600/60">
        <Plus className="h-5 w-5" />
      </div>
      <span className="text-[12px] font-medium">Tạo dự án mới</span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const openNewWorkspace = useNewWorkspaceModal();

  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [feed, setFeed] = useState<OfficialFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    api.listEstimates().then((e) => { if (alive) { setEstimates(e); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });

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

    api.getHomeFeed()
      .then((f) => {
        if (!alive) return;
        setFeed(f);
        setFeedLoading(false);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: f, fetchedAt: Date.now() })); } catch { /* ignore */ }
      })
      .catch(() => { if (alive) setFeedLoading(false); });
    return () => { alive = false; };
  }, []);

  async function handleRename(id: string, name: string) {
    setEstimates((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e))); // optimistic
    try { await api.renameEstimate(id, name); }
    catch (err) { toast.error("Lỗi đổi tên", (err as ApiError).message); }
  }

  async function handleDelete(id: string) {
    const est = estimates.find((e) => e.id === id);
    if (!window.confirm(`Xóa dự án "${est?.name ?? ""}"? Không thể hoàn tác.`)) return;
    const prev = estimates;
    setEstimates((p) => p.filter((e) => e.id !== id)); // optimistic
    try { await api.deleteEstimate(id); }
    catch (err) { setEstimates(prev); toast.error("Lỗi xóa", (err as ApiError).message); }
  }

  // Ưu tiên tương tác dự án: sort theo cập nhật mới nhất + lọc theo tìm kiếm.
  const filtered = useMemo(() => {
    const sorted = [...estimates].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((e) => e.name.toLowerCase().includes(q) || (e.projectInfo?.location ?? "").toLowerCase().includes(q));
  }, [estimates, search]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main content — DỰ ÁN là trung tâm ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
          {/* Header: tìm + tạo */}
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Dự án</h1>
              <p className="text-[12px] text-zinc-600">
                {estimates.length > 0 ? `${estimates.length} dự án` : "Bắt đầu lập dự toán từ bản vẽ"}
              </p>
            </div>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm dự án…"
                className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 pl-9 pr-4 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
              />
            </div>
            <button
              onClick={openNewWorkspace}
              className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-accent-600 px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-500"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Dự án mới</span>
            </button>
          </div>

          {/* Lưới dự án */}
          {!loaded ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-zinc-900/50" />)}
            </div>
          ) : estimates.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NewProjectCard onClick={openNewWorkspace} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 py-12 text-center text-[12px] text-zinc-600">
              Không tìm thấy &ldquo;{search}&rdquo;
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((est) => (
                <ProjectCard
                  key={est.id}
                  est={est}
                  onClick={() => router.push(`/estimate/${est.id}`)}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              ))}
              {!search && <NewProjectCard onClick={openNewWorkspace} />}
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar: Tin định mức & giá ── */}
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-l border-zinc-800 xl:block">
        <div className="p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Tin định mức &amp; giá</p>
          {feedLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-800/50" />)}</div>
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
                  <span className={cn("inline-block rounded px-1.5 py-0.5 text-[9px] font-medium", FEED_COLOR[item.type] ?? "text-zinc-400 bg-zinc-800")}>
                    {FEED_BADGE[item.type] ?? item.type}
                  </span>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-zinc-400 group-hover:text-zinc-200">{item.title}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-700">
                    <span>{item.region}</span>
                    {item.issuedDate && (<><span>·</span><span>{item.issuedDate}</span></>)}
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
