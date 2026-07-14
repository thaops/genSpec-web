"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, type BuildingGraph, type MepRow, type ScopeGapFinding, type SwapImpact } from "@/lib/api";
import { Spinner } from "@/components/ui/Button";

type Tab = "floors" | "mep" | "review" | "swap";

interface Props {
  estimateId: string;
  drawingId: string;
  location?: string;
  initialTab?: Tab;
  onClose: () => void;
}

const SEV_CLS: Record<ScopeGapFinding["severity"], string> = {
  high: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  low: "border-zinc-700 bg-zinc-800/40 text-zinc-300",
};
const SEV_LABEL: Record<ScopeGapFinding["severity"], string> = { high: "Cao", medium: "TB", low: "Thấp" };

// Building Graph: cây tầng→phòng, MEP takeoff, rà soát thiếu phạm vi.
export function BuildingPanel({ estimateId, drawingId, location, initialTab = "floors", onClose }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [unit, setUnit] = useState<"mm" | "m">("mm"); // factor cho chiều dài MEP
  const [graph, setGraph] = useState<BuildingGraph | null>(null);
  const [mep, setMep] = useState<MepRow[] | null>(null);
  const [findings, setFindings] = useState<ScopeGapFinding[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // So giá vật tư (knowledge/swap)
  const [swapFrom, setSwapFrom] = useState("");
  const [swapTo, setSwapTo] = useState("");
  const [swapQty, setSwapQty] = useState("1");
  const [swap, setSwap] = useState<SwapImpact | null>(null);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    if (tab === "swap") return; // tab So giá chạy on-demand, không auto-fetch
    let alive = true;
    setLoading(true);
    setErr(null);
    const run = async () => {
      try {
        if (tab === "floors") setGraph(await api.building(estimateId, drawingId));
        else if (tab === "mep")
          setMep(await api.buildingMep(estimateId, drawingId, { byFloor: true, factor: unit === "mm" ? 0.001 : 1, location }));
        else if (tab === "review") setFindings(await api.buildingReview(estimateId, drawingId));
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Lỗi tải");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => { alive = false; };
  }, [tab, unit, estimateId, drawingId, location]);

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
        tab === id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-sm font-semibold text-zinc-200">Công trình</span>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-zinc-800 bg-zinc-950/40 p-1">
        <TabBtn id="floors" label="Tầng" />
        <TabBtn id="mep" label="MEP" />
        <TabBtn id="review" label="Rà soát" />
        <TabBtn id="swap" label="So giá" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
        {loading && <div className="flex items-center gap-2 p-3 text-zinc-500"><Spinner className="h-4 w-4" /> Đang tải…</div>}
        {err && <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300">{err}</div>}

        {/* ── TẦNG ── */}
        {tab === "floors" && graph && !loading && (
          <>
            {graph.floors.length === 0 && <div className="p-3 text-zinc-500">Chưa có đối tượng ngữ nghĩa.</div>}
            {graph.floors.map((f) => (
              <div key={f.floor} className="mb-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-zinc-200">{f.floor}</span>
                  <span className="text-zinc-500">{f.objectCount} đối tượng · {f.rooms.length} phòng</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(f.typeCounts).map(([t, n]) => (
                    <span key={t} className="rounded-full border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
                      {t} <span className="font-mono text-accent-300">{n}</span>
                    </span>
                  ))}
                </div>
                {f.rooms.map((r) => (
                  <div key={r.stableId} className="mt-1 border-t border-zinc-800/60 pt-1 text-[11px] text-zinc-400">
                    🚪 {r.name} — {Object.entries(r.typeCounts).map(([t, n]) => `${t}:${n}`).join(" · ") || "trống"}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* ── MEP ── */}
        {tab === "mep" && !loading && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-zinc-500">Đơn vị vẽ:</span>
              <button onClick={() => setUnit("mm")} className={`rounded px-1.5 py-0.5 text-[10px] ${unit === "mm" ? "bg-accent-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>mm</button>
              <button onClick={() => setUnit("m")} className={`rounded px-1.5 py-0.5 text-[10px] ${unit === "m" ? "bg-accent-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>m</button>
              {location && <span className="ml-auto text-[10px] text-emerald-400/70">giá: {location}</span>}
            </div>
            {mep && mep.length === 0 && <div className="p-3 text-zinc-500">Chưa nhận diện đối tượng MEP.</div>}
            {mep && mep.length > 0 && (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase text-zinc-500">
                    <th className="border-b border-zinc-800 py-1 text-left">Thiết bị/Tuyến</th>
                    {mep.some((r) => r.floor) && <th className="border-b border-zinc-800 py-1 text-center">Tầng</th>}
                    <th className="border-b border-zinc-800 py-1 text-right">SL</th>
                    <th className="border-b border-zinc-800 py-1 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {mep.map((r, i) => (
                    <tr key={i} className="text-zinc-300">
                      <td className="py-1">{r.label}</td>
                      {mep.some((x) => x.floor) && <td className="py-1 text-center text-zinc-500">{r.floor ?? "—"}</td>}
                      <td className="py-1 text-right font-mono tabular-nums">{r.quantity} {r.unit}</td>
                      <td className="py-1 text-right font-mono tabular-nums" title={r.priceSource}>
                        {r.totalPrice != null ? r.totalPrice.toLocaleString("vi-VN") : <span className="text-zinc-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── RÀ SOÁT ── */}
        {tab === "review" && findings && !loading && (
          <>
            {findings.length === 0 && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">Không phát hiện thiếu phạm vi.</div>}
            {findings.map((f, i) => (
              <div key={i} className={`mb-1.5 rounded border px-2 py-1.5 ${SEV_CLS[f.severity]}`}>
                <div className="flex items-center gap-1.5">
                  <span className="rounded px-1 text-[9px] font-bold uppercase">{SEV_LABEL[f.severity]}</span>
                  <span className="text-[10px] opacity-70">{f.scope}</span>
                </div>
                <div className="mt-0.5">{f.message}</div>
                {f.suggestion && <div className="mt-0.5 text-[10px] opacity-70">→ {f.suggestion}</div>}
              </div>
            ))}
          </>
        )}

        {/* ── SO GIÁ VẬT TƯ (knowledge/swap) ── */}
        {tab === "swap" && (
          <div className="space-y-2">
            <p className="text-zinc-500">Đổi vật tư A → B, xem chênh đơn giá × khối lượng (giá có nguồn).</p>
            <input value={swapFrom} onChange={(e) => setSwapFrom(e.target.value)} placeholder="Vật tư hiện tại (vd Holcim)"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200 focus:border-accent-500 focus:outline-none" />
            <input value={swapTo} onChange={(e) => setSwapTo(e.target.value)} placeholder="Vật tư thay thế (vd Hà Tiên)"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200 focus:border-accent-500 focus:outline-none" />
            <div className="flex items-center gap-2">
              <label className="text-zinc-500">Khối lượng:</label>
              <input value={swapQty} onChange={(e) => setSwapQty(e.target.value)} inputMode="decimal"
                className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-right font-mono text-zinc-200" />
              <button
                onClick={async () => {
                  if (!swapFrom.trim() || !swapTo.trim()) return;
                  setSwapping(true); setErr(null);
                  try { setSwap(await api.knowledgeSwap(swapFrom.trim(), swapTo.trim(), parseFloat(swapQty) || 1, location)); }
                  catch (e: any) { setErr(e?.message ?? "Lỗi"); }
                  finally { setSwapping(false); }
                }}
                disabled={swapping}
                className="ml-auto rounded bg-accent-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {swapping ? "…" : "So sánh"}
              </button>
            </div>

            {swap && !swap.matched && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-300">
                Chưa đủ dữ liệu giá cho {!swap.from.price ? swap.from.query : swap.to.query}.
              </div>
            )}
            {swap && swap.matched && (
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">{swap.from.name}</span>
                  <span className="font-mono text-zinc-300">{swap.from.price?.toLocaleString("vi-VN")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">{swap.to.name}</span>
                  <span className="font-mono text-zinc-300">{swap.to.price?.toLocaleString("vi-VN")}</span>
                </div>
                <div className={`mt-1.5 border-t border-zinc-800 pt-1.5 font-mono text-sm font-semibold ${(swap.deltaUnit ?? 0) <= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {(swap.deltaUnit ?? 0) <= 0 ? "▼" : "▲"} {Math.abs(swap.deltaUnit ?? 0).toLocaleString("vi-VN")}đ/{swap.unit ?? "đv"}
                  <span className="ml-1 text-[11px] font-normal opacity-80">({swap.deltaPercent}%)</span>
                  <div className="text-[11px] font-normal text-zinc-400">
                    × {swap.quantity} = <span className={(swap.totalDelta ?? 0) <= 0 ? "text-emerald-300" : "text-rose-300"}>
                      {(swap.totalDelta ?? 0) <= 0 ? "tiết kiệm " : "tăng "}{Math.abs(swap.totalDelta ?? 0).toLocaleString("vi-VN")}đ
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
