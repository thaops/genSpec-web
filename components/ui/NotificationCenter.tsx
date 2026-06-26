"use client";

import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/types";
import { api } from "@/lib/api";
import { JobCenter, useJobCount } from "./JobCenter";

const TYPE_ICONS: Record<string, string> = {
  price_updated: "💰",
  review_done: "✅",
  proposal_ready: "📋",
  drawing_parsed: "📐",
  export_done: "📥",
  job_failed: "❌",
};

const TYPE_COLORS: Record<string, string> = {
  price_updated: "text-emerald-400",
  review_done: "text-blue-400",
  proposal_ready: "text-accent-400",
  drawing_parsed: "text-purple-400",
  export_done: "text-zinc-300",
  job_failed: "text-rose-400",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [jobCenterOpen, setJobCenterOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const jobCount = useJobCount();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const totalBadge = unreadCount + jobCount;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getNotifications()
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Poll every 30s
  useEffect(() => {
    const iv = setInterval(() => {
      api.getNotifications().then(setNotifications).catch(() => {});
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  async function markRead(id: string) {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch { /* ignore */ }
  }

  return (
    <>
      {/* Bell button */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="relative flex items-center justify-center w-8 h-8 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Thông báo & Jobs"
        >
          <span className="text-base">🔔</span>
          {totalBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white px-0.5">
              {totalBadge > 9 ? "9+" : totalBadge}
            </span>
          )}
        </button>

        {/* Notification dropdown */}
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-full right-0 mt-1 z-50 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-100">Notifications</span>
                <div className="flex items-center gap-2">
                  {/* Job center button */}
                  <button
                    onClick={() => { setOpen(false); setJobCenterOpen(true); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                      jobCount > 0 ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span>⚙️</span>
                    <span>Jobs {jobCount > 0 ? `(${jobCount})` : ""}</span>
                  </button>
                  <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
                </div>
              </div>

              {/* Notifications list */}
              <div className="max-h-80 overflow-y-auto">
                {loading && (
                  <div className="py-6 text-center text-xs text-zinc-600">Đang tải...</div>
                )}
                {!loading && notifications.length === 0 && (
                  <div className="py-10 text-center text-zinc-600 text-sm">
                    Không có thông báo
                  </div>
                )}
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-zinc-800/50 last:border-0 cursor-pointer hover:bg-zinc-800/40 transition-colors ${
                      !n.read ? "bg-zinc-800/20" : ""
                    }`}
                  >
                    <span className="text-base shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? "🔔"}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-medium ${TYPE_COLORS[n.type] ?? "text-zinc-300"}`}>
                        {n.message}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">
                        {new Date(n.createdAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                    {!n.read && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                    )}
                  </div>
                ))}
              </div>

              {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-zinc-800">
                  <button
                    onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400"
                  >
                    Đánh dấu tất cả đã đọc
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <JobCenter open={jobCenterOpen} onClose={() => setJobCenterOpen(false)} />
    </>
  );
}
