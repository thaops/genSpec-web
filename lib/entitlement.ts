"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { getToken } from "./auth";
import type { Entitlement, PlanLimits, QuotaSnapshot } from "./types";

/**
 * Đọc entitlement của session client để ẩn/disable UI.
 *
 * ⚠️ Ẩn UI KHÔNG phải bảo mật — BE vẫn có `PermissionGuard` cho mọi endpoint.
 * Hook này chỉ để user không bấm vào thứ chắc chắn bị 403.
 */
export function useEntitlement() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken("app")) {
      setEntitlement(null);
      setLoading(false);
      return;
    }
    try {
      setEntitlement(await api.myEntitlements());
    } catch {
      // Không có entitlement → coi như không có quyền gì thêm; UI tự fail-closed.
      setEntitlement(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const can = useCallback(
    (key: string) => !!entitlement && !entitlement.denyAll && entitlement.features.includes(key),
    [entitlement],
  );

  return { entitlement, loading, can, refresh };
}

export function useQuota() {
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken("app")) return;
    try {
      setQuota(await api.myQuota());
    } catch {
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { quota, refresh };
}

/** `null` = unlimited. Key vắng mặt = 0 = cấm (khớp fail-closed của BE). */
export function limitOf(ent: Entitlement | null, key: keyof PlanLimits): number | null {
  if (!ent || ent.denyAll) return 0;
  const v = ent.limits[key];
  return v === undefined ? 0 : v;
}

const WINDOW_LABEL: Record<string, string> = {
  hour: "mỗi giờ",
  "4h": "mỗi 4 giờ",
  day: "mỗi ngày",
  week: "mỗi tuần",
  month: "mỗi tháng",
};

/**
 * Đổi lỗi 403/413/429 của BE thành câu nói được với QS.
 * Trả `null` nếu không phải lỗi thuộc hệ quota/permission.
 */
export function describeLimitError(err: unknown): string | null {
  const e = err as ApiError & { body?: Record<string, unknown> };
  const body = (e?.body ?? {}) as Record<string, unknown>;

  if (e?.statusCode === 429 && body.error === "QuotaExceeded") {
    const reset = body.resetAt ? new Date(String(body.resetAt)) : null;
    const when = reset
      ? reset.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
      : null;
    const win = WINDOW_LABEL[String(body.window)] ?? String(body.window);
    return `Hết quota ${win} của gói ${body.planSlug} (${body.used}/${body.limit})${
      when ? ` — reset lúc ${when}` : ""
    }`;
  }

  if (e?.statusCode === 413 && body.error === "UploadLimitExceeded") {
    const mb = (n: unknown) => Math.round(Number(n ?? 0) / 1048576);
    return `File ${mb(body.actualBytes)}MB vượt giới hạn ${mb(body.limitBytes)}MB của gói ${body.planSlug}`;
  }

  if (e?.statusCode === 403 && body.error === "PermissionDenied") {
    return `Gói ${body.planSlug} không có tính năng này`;
  }

  return null;
}
