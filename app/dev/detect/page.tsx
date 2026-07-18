"use client";

/**
 * DEBUG MODE — soi kết quả nhận diện của 1 bản vẽ: phân bố type, breakdown theo layer,
 * số ambiguous, và tải JSON. Dùng để chẩn đoán nhanh (vd "sao bản nước ra cột giả")
 * thay vì phải đoán. Chỉ trang dev, không nằm trong luồng người dùng.
 */
import { useState } from "react";
import { api } from "@/lib/api";
import type { DrawingObject } from "@/lib/types";
import { Button } from "@/components/ui/Button";

export default function DetectDebugPage() {
  const [estimateId, setEstimateId] = useState("");
  const [drawingId, setDrawingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [objs, setObjs] = useState<DrawingObject[] | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.detectDrawingObjects(estimateId.trim(), drawingId.trim());
      setObjs(r.objects);
    } catch (e) {
      setErr((e as Error).message);
      setObjs(null);
    } finally {
      setBusy(false);
    }
  }

  const byType = tally(objs, (o) => o.type);
  const byLayer = tally(objs, (o) => o.layer || "(no layer)");
  const ambiguous = objs?.filter((o) => o.ambiguous).length ?? 0;
  const byRaw = tally(objs, (o) => o.rawType || "?");

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 text-sm text-zinc-200">
      <h1 className="text-lg font-semibold">Debug — nhận diện bản vẽ</h1>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">estimateId</span>
          <input value={estimateId} onChange={(e) => setEstimateId(e.target.value)}
            className="w-72 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">drawingId</span>
          <input value={drawingId} onChange={(e) => setDrawingId(e.target.value)}
            className="w-72 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs" />
        </label>
        <Button size="sm" onClick={run} disabled={busy || !estimateId.trim() || !drawingId.trim()}>
          {busy ? "Đang nhận diện…" : "Detect"}
        </Button>
        {objs && (
          <Button size="sm" variant="outline"
            onClick={() => download(`detect-${drawingId}.json`, JSON.stringify(objs, null, 1))}>
            Tải JSON
          </Button>
        )}
      </div>

      {err && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300">{err}</p>}

      {objs && (
        <div className="space-y-4">
          <p className="text-zinc-400">
            <span className="font-semibold text-zinc-200">{objs.length}</span> đối tượng ·{" "}
            <span className={ambiguous ? "text-amber-300" : ""}>{ambiguous} ambiguous</span>
          </p>
          <Dist title="Type" rows={byType} total={objs.length} />
          <Dist title="rawType (entity gốc)" rows={byRaw} total={objs.length} />
          <Dist title="Layer (top 30)" rows={byLayer.slice(0, 30)} total={objs.length} />
        </div>
      )}
    </div>
  );
}

function tally(objs: DrawingObject[] | null, key: (o: DrawingObject) => string): [string, number][] {
  if (!objs) return [];
  const m = new Map<string, number>();
  for (const o of objs) m.set(key(o), (m.get(key(o)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Dist({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <div>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="space-y-1">
        {rows.map(([k, n]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-52 shrink-0 truncate font-mono text-xs text-zinc-300">{k}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-zinc-800">
              <div className="h-full bg-accent-600" style={{ width: `${(n / total) * 100}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right tabular-nums text-xs text-zinc-400">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
