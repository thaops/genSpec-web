/**
 * Khoá cách FE diễn giải giới hạn. Chạy môi trường node → chỉ test hàm thuần,
 * không render hook.
 */
import { ApiError } from "./api";
import { describeLimitError, limitOf } from "./entitlement";
import type { Entitlement } from "./types";

const ENT: Entitlement = {
  userId: "u1",
  planId: "p",
  planSlug: "free",
  planName: "Free",
  subscriptionStatus: "ACTIVE",
  effectiveUntil: null,
  features: ["ai.chat"],
  limits: { "project.count": 5, "storage.bytes": null },
  quotas: [],
  aiModels: [],
  denyAll: false,
};

function apiError(statusCode: number, body: Record<string, unknown>) {
  return new ApiError("x", statusCode, body as never);
}

describe("limitOf — khớp fail-closed của BE", () => {
  it("đọc đúng số", () => expect(limitOf(ENT, "project.count")).toBe(5));
  it("null = unlimited", () => expect(limitOf(ENT, "storage.bytes")).toBeNull());
  it("key vắng mặt = 0 = cấm", () => expect(limitOf(ENT, "drawing.count")).toBe(0));
  it("chưa có entitlement = cấm, không phải unlimited", () =>
    expect(limitOf(null, "project.count")).toBe(0));
  it("denyAll = cấm hết", () =>
    expect(limitOf({ ...ENT, denyAll: true }, "storage.bytes")).toBe(0));
});

describe("describeLimitError", () => {
  it("429 → nói rõ cửa sổ + số đã dùng + lúc reset", () => {
    const msg = describeLimitError(
      apiError(429, {
        error: "QuotaExceeded",
        metric: "ai.tokens",
        window: "week",
        limit: 100000,
        used: 100000,
        resetAt: "2026-07-27T00:00:00.000Z",
        planSlug: "free",
      }),
    );
    expect(msg).toContain("mỗi tuần");
    expect(msg).toContain("100000/100000");
    expect(msg).toContain("reset lúc");
  });

  it("413 → đổi bytes sang MB", () => {
    const msg = describeLimitError(
      apiError(413, {
        error: "UploadLimitExceeded",
        limitBytes: 20 * 1048576,
        actualBytes: 25 * 1048576,
        planSlug: "free",
      }),
    );
    expect(msg).toBe("File 25MB vượt giới hạn 20MB của gói free");
  });

  it("403 permission → gợi ý gói", () => {
    expect(
      describeLimitError(apiError(403, { error: "PermissionDenied", planSlug: "free" })),
    ).toBe("Gói free không có tính năng này");
  });

  it("lỗi khác → null để caller dùng message gốc", () => {
    expect(describeLimitError(apiError(500, {}))).toBeNull();
    expect(describeLimitError(apiError(403, { error: "Forbidden" }))).toBeNull();
    expect(describeLimitError(new Error("network"))).toBeNull();
  });
});
