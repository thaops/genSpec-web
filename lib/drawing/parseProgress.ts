// Trạng thái parse bản vẽ — logic thuần (test được), khớp enum backend:
// pending | converting | parsing | ready | failed.

export const PARSE_POLL_MS = 3_000;
// Ngưỡng coi là "kẹt" — quá lâu so với thường lệ.
export const PARSE_STUCK_MS = 75_000;

export const PARSE_STATUS_LABELS: Record<string, string> = {
  pending: "Đang xếp hàng…",
  converting: "Đang chuyển đổi DWG → DXF…",
  parsing: "Đang đọc bản vẽ…",
  failed: "Xử lý thất bại",
};

export function parseStatusLabel(status?: string): string {
  return (status && PARSE_STATUS_LABELS[status]) || "Đang xử lý…";
}

/** Đang trong pipeline (chưa ready, chưa failed). */
export function isParsing(status?: string): boolean {
  return status === "pending" || status === "converting" || status === "parsing";
}

/** Thời gian đã xử lý (ms) tính từ parseStartedAt, fallback createdAt. */
export function parseElapsedMs(
  d: { parseStartedAt?: string; createdAt?: string },
  now: number = Date.now(),
): number {
  const base = d.parseStartedAt ?? d.createdAt;
  if (!base) return 0;
  const t = new Date(base).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, now - t);
}

/** Kẹt quá lâu → gợi ý user thử lại. */
export function isStuck(elapsedMs: number, threshold: number = PARSE_STUCK_MS): boolean {
  return elapsedMs >= threshold;
}
