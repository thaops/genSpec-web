"use client";

import { useState } from "react";
import type { TakeoffCluster } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Panel NỔI bên phải (KHÔNG che bản vẽ) — bản vẽ nhiều cụm (mặt bằng/mặt đứng/chi tiết).
 * Triết lý: KHÔNG tự đoán cụm nào là mặt bằng; bày số đo thử từng cụm để QS chọn. Bóc từng
 * cụm CỘNG DỒN (BE scope theo vùng, không đè); bóc lại 1 cụm = sửa đúng cụm đó.
 */
export function ClusterPicker({
  clusters,
  spanM,
  discipline,
  picked,
  busyId,
  onPick,
  onPickMany,
  onClose,
}: {
  clusters: TakeoffCluster[];
  spanM?: number;
  discipline?: string;
  /** id cụm ĐÃ bóc trong phiên này (hiện "✓ đã bóc"). */
  picked: Set<number>;
  /** id cụm đang bóc (spinner). null = rảnh. */
  busyId: number | null;
  onPick: (cluster: TakeoffCluster, confirmRoundColumns: boolean) => void;
  onPickMany: (clusters: TakeoffCluster[], confirmRoundColumns: boolean) => void;
  onClose: () => void;
}) {
  const [confirmRound, setConfirmRound] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anyRoundColumns = clusters.some((c) => (c.byType?.column ?? 0) > 0);
  const busy = busyId != null;

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectedClusters = clusters.filter((c) => selected.has(c.id));
  const notPicked = clusters.filter((c) => !picked.has(c.id));

  return (
    <div className="fixed right-4 top-16 bottom-4 z-40 flex w-[340px] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur">
      {/* Header — summary-first */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Chọn cụm để bóc</h2>
          <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300" disabled={busy}>
            Xong ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          {clusters.length} cụm{spanM ? ` · trải ~${Math.round(spanM)}m` : ""} — bóc từng cụm sẽ <b className="text-zinc-300">cộng dồn</b> (không đè). Bóc lại 1 cụm = sửa đúng cụm đó.
        </p>
      </div>

      {/* Danh sách cụm */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {clusters.map((c) => {
          const done = picked.has(c.id);
          const isBusy = busyId === c.id;
          return (
            <div
              key={c.id}
              className={cn(
                "rounded-xl border p-2.5 transition-colors",
                done ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
              )}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  disabled={busy}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-200">Cụm {c.id}</span>
                    <span className="truncate text-[11px] text-zinc-500">{c.hint}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500">~{c.widthM}×{c.heightM}m · {c.count} đối tượng</div>
                  {c.lines.length > 0 ? (
                    <div className="mt-1 text-[11px] text-zinc-400">
                      {c.lines.slice(0, 3).map((l) => `${l.name.split(" ")[0]} ${l.quantity}${l.unit}`).join(" · ")}
                      {c.lines.length > 3 ? " …" : ""}
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] italic text-zinc-600">chưa đo được (cấu kiện chờ xác nhận)</div>
                  )}
                </div>
                {done ? (
                  <span className="shrink-0 text-[11px] font-medium text-emerald-400">✓ đã bóc</span>
                ) : null}
              </div>
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant={done ? "outline" : "primary"} disabled={busy} onClick={() => onPick(c, confirmRound)}>
                  {isBusy ? "Đang bóc…" : done ? "Bóc lại cụm này" : "Bóc cụm này"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — cột tròn (nếu có) + bóc hàng loạt */}
      <div className="space-y-2 border-t border-zinc-800 px-3 py-3">
        {anyRoundColumns && discipline === "KC" && (
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
            <input type="checkbox" checked={confirmRound} onChange={(e) => setConfirmRound(e.target.checked)} className="h-3.5 w-3.5 accent-accent-600" />
            Xác nhận vòng tròn là <b className="text-zinc-200">cột tròn</b> → đo πr²×H
          </label>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" disabled={busy || selected.size === 0} onClick={() => onPickMany(selectedClusters, confirmRound)}>
            Bóc {selected.size > 0 ? `${selected.size} cụm chọn` : "cụm chọn"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1" disabled={busy || notPicked.length === 0} onClick={() => onPickMany(notPicked, confirmRound)}>
            Bóc tất cả
          </Button>
        </div>
      </div>
    </div>
  );
}
