"use client";

import { useState } from "react";
import type { TakeoffCluster } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Bản vẽ có nhiều cụm (mặt bằng/mặt đứng/chi tiết trong 1 model space) → BE CHƯA ghi gì,
 * trả các cụm để QS chọn. Triết lý: KHÔNG tự đoán cụm nào là mặt bằng; bày ra số đo thử
 * của TỪNG cụm để QS quyết. Bóc gộp = số vô nghĩa nên phải chọn.
 */
export function ClusterPicker({
  clusters,
  spanM,
  discipline,
  onPick,
  onCancel,
  busy,
}: {
  clusters: TakeoffCluster[];
  spanM?: number;
  discipline?: string;
  /** Bóc đúng 1 cụm — region của cụm + có xác nhận cột tròn hay không. */
  onPick: (cluster: TakeoffCluster, confirmRoundColumns: boolean) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [confirmRound, setConfirmRound] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const anyRoundColumns = clusters.some((c) => (c.byType?.column ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header — summary-first */}
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-100">Chọn cụm bản vẽ để bóc</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Bản vẽ có <span className="font-semibold text-zinc-200">{clusters.length} cụm</span>
            {spanM ? <> trải ~{Math.round(spanM)}m</> : null} — thường là mặt bằng các tầng, mặt đứng và
            chi tiết đặt cạnh nhau. Bóc gộp tất cả sẽ cộng dồn thành số vô nghĩa, nên chọn đúng cụm cần bóc.
          </p>
        </div>

        {/* Danh sách cụm */}
        <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
          {clusters.map((c) => {
            const isPicking = picking === c.id;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3.5 transition-colors hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-accent-600/20 px-1.5 text-xs font-semibold text-accent-300">
                        {c.id}
                      </span>
                      <span className="truncate text-sm font-medium text-zinc-200">{c.hint || "cụm đối tượng"}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        ~{c.widthM}×{c.heightM}m · {c.count} đối tượng
                      </span>
                    </div>
                    {/* Số đo thử của cụm — geometry thuần, chưa tra giá */}
                    {c.lines.length > 0 ? (
                      <ul className="mt-2 space-y-0.5">
                        {c.lines.slice(0, 6).map((l, i) => (
                          <li key={i} className="flex justify-between gap-3 text-xs text-zinc-400">
                            <span className="truncate">{l.name}</span>
                            <span className="shrink-0 tabular-nums text-zinc-300">
                              {l.quantity.toLocaleString("vi-VN")} {l.unit}
                            </span>
                          </li>
                        ))}
                        {c.lines.length > 6 && (
                          <li className="text-xs text-zinc-600">+{c.lines.length - 6} công tác khác</li>
                        )}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs italic text-zinc-500">
                        Chưa đo được dòng nào (có thể là cột/cấu kiện chờ xác nhận).
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => {
                      setPicking(c.id);
                      onPick(c, confirmRound);
                    }}
                    className="shrink-0"
                  >
                    {isPicking && busy ? "Đang bóc…" : "Bóc cụm này"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer — tuỳ chọn cột tròn (chỉ khi có) + huỷ */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-5 py-3">
          {anyRoundColumns && discipline === "KC" ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={confirmRound}
                onChange={(e) => setConfirmRound(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent-600"
              />
              <span>
                Xác nhận vòng tròn là <span className="text-zinc-200">cột tròn</span> → đo πr²×H
              </span>
            </label>
          ) : (
            <span className="text-xs text-zinc-600">Bóc riêng từng cụm để tránh cộng dồn.</span>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} className={cn(busy && "opacity-50")}>
            Huỷ
          </Button>
        </div>
      </div>
    </div>
  );
}
