import { request as baseRequest } from "./api";

/** Mọi call admin đi bằng session admin — không bao giờ dùng token client. */
type AdminOpts = { method?: string; body?: unknown };
const request = <T,>(path: string, opts: AdminOpts = {}) =>
  baseRequest<T>(path, { ...opts, scope: "admin" });
import type {
  AdminUserDetail,
  AdminVocabulary,
  AdminSubscription,
  Plan,
  PlanLimits,
  QuotaRule,
  QuotaStateItem,
  QuotaWindow,
  QuotaAdjustmentRow,
  SubscriptionStatus,
  AdminDashboardSnapshot,
  AdminUser,
  AiUsageRow,
  AiUsageSummary,
  AuditLogRow,
  Paginated,
  UserRole,
  UserStatus,
} from "./types";

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

export const adminApi = {
  dashboard: () => request<AdminDashboardSnapshot>("/admin/dashboard"),

  listUsers: (params: { role?: string; status?: string; email?: string; page?: number; limit?: number } = {}) =>
    request<Paginated<AdminUser>>(`/admin/users${qs(params)}`),

  /** BE bắt buộc `reason` — thiếu là 400. */
  updateUserStatus: (id: string, status: UserStatus, reason: string) =>
    request<AdminUser>(`/admin/users/${id}/status`, { method: "PATCH", body: { status, reason } }),

  /** Chỉ super_admin (`admin.settings`). */
  updateUserRole: (id: string, role: UserRole, reason: string) =>
    request<AdminUser>(`/admin/users/${id}/role`, { method: "PATCH", body: { role, reason } }),

  deleteUser: (id: string, reason: string) =>
    request<AdminUser>(`/admin/users/${id}`, { method: "DELETE", body: { reason } }),

  listAiUsage: (
    params: { userId?: string; estimateId?: string; model?: string; source?: string; mode?: string; from?: string; to?: string; page?: number; limit?: number } = {},
  ) => request<Paginated<AiUsageRow>>(`/admin/ai-usage${qs(params)}`),

  aiUsageSummary: (params: { userId?: string; estimateId?: string; from?: string; to?: string } = {}) =>
    request<AiUsageSummary>(`/admin/ai-usage/summary${qs(params)}`),

  // ---------- User detail + account control ----------

  userDetail: (id: string) => request<AdminUserDetail>(`/admin/users/${id}`),

  /** Mọi hành động nặng đều bắt buộc `reason` — BE trả 400 nếu thiếu. */
  forceLogout: (id: string, reason: string) =>
    request<{ ok: boolean; tokenVersion: number }>(`/admin/users/${id}/force-logout`, {
      method: "POST",
      body: { reason },
    }),

  /** `temporaryPassword` chỉ trả về MỘT LẦN, không lưu ở đâu cả. */
  resetPassword: (id: string, reason: string) =>
    request<{ ok: boolean; temporaryPassword: string }>(`/admin/users/${id}/reset-password`, {
      method: "POST",
      body: { reason },
    }),

  // ---------- Subscription của 1 user ----------

  changePlan: (
    id: string,
    body: { planId: string; reason: string; endAt?: string | null; status?: SubscriptionStatus },
  ) => request<AdminSubscription>(`/admin/users/${id}/subscription`, { method: "POST", body }),

  extendSubscription: (id: string, days: number, reason: string) =>
    request<AdminSubscription>(`/admin/users/${id}/subscription/extend`, {
      method: "POST",
      body: { days, reason },
    }),

  startTrial: (id: string, planId: string, reason: string) =>
    request<AdminSubscription>(`/admin/users/${id}/subscription/trial`, {
      method: "POST",
      body: { planId, reason },
    }),

  setSubscriptionStatus: (id: string, status: SubscriptionStatus, reason: string) =>
    request<AdminSubscription>(`/admin/users/${id}/subscription/status`, {
      method: "PATCH",
      body: { status, reason },
    }),

  setOverrides: (
    id: string,
    overrides: { limits?: PlanLimits; quotas?: QuotaRule[]; features?: { grant?: string[]; revoke?: string[] } },
    reason: string,
  ) =>
    request<AdminSubscription>(`/admin/users/${id}/subscription/overrides`, {
      method: "PATCH",
      body: { overrides, reason },
    }),

  // ---------- Quota ----------

  userQuota: (id: string) =>
    request<{ planSlug: string; subscriptionStatus: string; items: QuotaStateItem[] }>(
      `/admin/users/${id}/quota`,
    ),

  adjustQuota: (
    id: string,
    body: { metric: string; window: QuotaWindow | null; delta: number; kind: "grant" | "deduct"; reason: string },
  ) => request<QuotaAdjustmentRow>(`/admin/users/${id}/quota/adjust`, { method: "POST", body }),

  resetQuota: (id: string, metric: string, window: QuotaWindow, reason: string) =>
    request<QuotaAdjustmentRow>(`/admin/users/${id}/quota/reset`, {
      method: "POST",
      body: { metric, window, reason },
    }),

  quotaHistory: (id: string) => request<QuotaAdjustmentRow[]>(`/admin/users/${id}/quota/history`),

  // ---------- Plans (chỉ super_admin) ----------

  vocabulary: () => request<AdminVocabulary>("/admin/permissions"),

  listPlans: () => request<Plan[]>("/admin/plans"),

  getPlan: (id: string) => request<Plan>(`/admin/plans/${id}`),

  createPlan: (body: Partial<Plan> & { slug: string }) =>
    request<Plan>("/admin/plans", { method: "POST", body }),

  updatePlan: (id: string, body: Partial<Plan> & { reason?: string }) =>
    request<Plan>(`/admin/plans/${id}`, { method: "PATCH", body }),

  deactivatePlan: (id: string, reason: string) =>
    request<Plan>(`/admin/plans/${id}`, { method: "DELETE", body: { reason } }),

  expireOverdue: () =>
    request<{ expired: number }>("/admin/subscriptions/expire-overdue", { method: "POST" }),

  listAuditLogs: (
    params: { actorId?: string; action?: string; targetType?: string; from?: string; to?: string; page?: number; limit?: number } = {},
  ) => request<Paginated<AuditLogRow>>(`/admin/audit-logs${qs(params)}`),
};
