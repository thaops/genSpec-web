"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, type RebarTakeoff, type RebarWeightResult } from "@/lib/api";
import { Spinner } from "@/components/ui/Button";

interface Props {
  estimateId: string;
  drawingId: string;
  onClose: () => void;
}

// Bóc cốt thép từ callout (%%C=Ø). BE không suy kg (cần chiều dài) → panel cho
// nhập tổng chiều dài/Ø rồi gọi /rebar/weight ra kg. Không bịa chiều dài.
export function RebarPanel({ estimateId, drawingId, onClose }: Props) {
  const [data, setData] = useState<RebarTakeoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lengths, setLengths] = useState<Record<number, string>>({});
  const [waste, setWaste] = useState("1.0");
  const [weight, setWeight] = useState<RebarWeightResult | null>(null);
  const [calcing, setCalcing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .rebarTakeoff(estimateId, drawingId)
      .then((d) => { if (alive) { setData(d); setErr(null); } })
      .catch((e) => { if (alive) setErr(e?.message ?? "Lỗi tải"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [estimateId, drawingId]);

  async function computeKg() {
    if (!data) return;
    const inputs = data.diameters
      .map((d) => ({ diameter: d.diameter, totalLengthM: parseFloat(lengths[d.diameter] ?? "") || 0 }))
      .filter((i) => i.totalLengthM > 0);
    if (inputs.length === 0) return;
    setCalcing(true);
    try {
      const r = await api.rebarWeight(estimateId, drawingId, inputs, parseFloat(waste) || 1);
      setWeight(r);
    } catch (e: any) { setErr(e?.message ?? "Lỗi tính kg"); }
    finally { setCalcing(false); }
  }

  const kgByDia = new Map((weight?.rows ?? []).map((r) => [r.diameter, r.weightKg]));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-sm font-semibold text-zinc-200">Cốt thép</span>
        <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
        {loading && <div className="flex items-center gap-2 p-3 text-zinc-500"><Spinner className="h-4 w-4" /> Đang bóc thép…</div>}
        {err && <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300">{err}</div>}

        {data && !loading && (
          <>
            <div className="mb-2 text-zinc-500">{data.totalCallouts} callout · {data.diameters.length} loại Ø</div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10px] uppercase text-zinc-500">
                  <th className="border-b border-zinc-800 py-1 text-left">Ø</th>
                  <th className="border-b border-zinc-800 py-1 text-right">kg/m</th>
                  <th className="border-b border-zinc-800 py-1 text-right" title="Tổng số thanh chịu lực">Thanh</th>
                  <th className="border-b border-zinc-800 py-1 text-right" title="Số callout đai">Đai</th>
                  <th className="border-b border-zinc-800 py-1 text-right" title="Tổng chiều dài (m) — bạn nhập">Dài (m)</th>
                  <th className="border-b border-zinc-800 py-1 text-right">kg</th>
                </tr>
              </thead>
              <tbody>
                {data.diameters.map((d) => (
                  <tr key={d.diameter} className="text-zinc-300">
                    <td className="py-1 font-mono">Ø{d.diameter}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{d.unitWeightKgM}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{d.mainBarCount || "—"}</td>
                    <td className="py-1 text-right font-mono tabular-nums" title={d.spacings.map((s) => "a" + s).join(", ")}>
                      {d.stirrupCalloutCount || "—"}
                    </td>
                    <td className="py-1 text-right">
                      <input
                        value={lengths[d.diameter] ?? ""}
                        onChange={(e) => setLengths((p) => ({ ...p, [d.diameter]: e.target.value }))}
                        placeholder="—"
                        inputMode="decimal"
                        className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-right font-mono text-[11px] text-zinc-200 focus:border-accent-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums text-emerald-300">
                      {kgByDia.has(d.diameter) ? kgByDia.get(d.diameter) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 flex items-center gap-2">
              <label className="text-zinc-500">Hao hụt/nối:</label>
              <input
                value={waste}
                onChange={(e) => setWaste(e.target.value)}
                inputMode="decimal"
                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-right font-mono text-[11px] text-zinc-200"
              />
              <button
                onClick={computeKg}
                disabled={calcing}
                className="ml-auto rounded bg-accent-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {calcing ? "Đang tính…" : "Tính kg"}
              </button>
            </div>

            {weight && (
              <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-emerald-300">
                Tổng: <span className="font-mono font-semibold">{weight.totalKg.toLocaleString("vi-VN")} kg</span>
                <span className="text-emerald-400/70"> (hao hụt ×{weight.wasteFactor})</span>
              </div>
            )}

            <p className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[11px] leading-relaxed text-amber-300/90">
              {data.note}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
