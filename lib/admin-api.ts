import { request } from "./api";
import type {
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

  updateUserStatus: (id: string, status: UserStatus) =>
    request<AdminUser>(`/admin/users/${id}/status`, { method: "PATCH", body: { status } }),

  updateUserRole: (id: string, role: UserRole) =>
    request<AdminUser>(`/admin/users/${id}/role`, { method: "PATCH", body: { role } }),

  deleteUser: (id: string) => request<AdminUser>(`/admin/users/${id}`, { method: "DELETE" }),

  listAiUsage: (
    params: { userId?: string; estimateId?: string; model?: string; source?: string; mode?: string; from?: string; to?: string; page?: number; limit?: number } = {},
  ) => request<Paginated<AiUsageRow>>(`/admin/ai-usage${qs(params)}`),

  aiUsageSummary: (params: { userId?: string; estimateId?: string; from?: string; to?: string } = {}) =>
    request<AiUsageSummary>(`/admin/ai-usage/summary${qs(params)}`),

  listAuditLogs: (
    params: { actorId?: string; action?: string; targetType?: string; from?: string; to?: string; page?: number; limit?: number } = {},
  ) => request<Paginated<AuditLogRow>>(`/admin/audit-logs${qs(params)}`),
};
