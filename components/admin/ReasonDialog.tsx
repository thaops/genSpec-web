"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Mọi hành động admin nặng đều đi qua đây. BE trả 400 nếu thiếu `reason`, nên
 * dialog này không phải trang trí — nó là cách duy nhất bấm được các nút đó.
 * Audit log không có lý do thì 3 tháng sau không ai giải thích được.
 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  danger,
  extra,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Field phụ (chọn gói, số ngày, số token…) render phía trên ô lý do. */
  extra?: ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Bắt buộc nhập lý do");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        {description && <div className="mt-1.5 text-sm text-zinc-400">{description}</div>}

        <div className="mt-4 space-y-3">
          {extra}
          <Input
            id="reason"
            label="Lý do (ghi vào audit log)"
            placeholder="vd: khách hàng đã chuyển khoản hợp đồng #123"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={error ?? undefined}
            autoFocus
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" size="sm" variant={danger ? "danger" : "primary"} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
