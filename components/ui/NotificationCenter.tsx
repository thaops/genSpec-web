"use client";

import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/types";
import { api } from "@/lib/api";
import { JobCenter, useJobCount } from "./JobCenter";
import {
  Bell, X, Settings, DollarSign, CheckCircle2, ClipboardList,
  Ruler, Download, XCircle,
} from "lucide-react";

const TYPE_ICON: Record<string, React.ReactNode> = {
  price_updated:  <DollarSign   className="h-4 w-4" />,
  review_done:    <CheckCircle2 className="h-4 w-4" />,
  proposal_ready: <ClipboardList className="h-4 w-4" />,
  drawing_parsed: <Ruler        className="h-4 w-4" />,
  export_done:    <Download     className="h-4 w-4" />,
  job_failed:     <XCircle      className="h-4 w-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  price_updated:  "text-emerald-400",
  review_done:    "text-blue-400",
  proposal_ready: "text-accent-400",
  drawing_parsed: "text-purple-400",
  export_done:    "text-zinc-300",
  job_failed:     "text-rose-400",
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
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Thông báo & Jobs"
        >
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-600 px-0.5 text-[9px] font-bold text-white">
              {totalBadge > 9 ? "9+" : totalBadge}
            </span>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                <span className="text-sm font-semibold text-zinc-100">Notifications</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setOpen(false); setJobCenterOpen(true); }}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors ${
                      jobCount > 0 ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Settings className="h-3 w-3" />
                    <span>Jobs {jobCount > 0 ? `(${jobCount})` : ""}</span>
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {loading && (
                  <div className="py-6 text-center text-xs text-zinc-600">Đang tải...</div>
                )}
                {!loading && notifications.length === 0 && (
                  <div className="py-10 text-center text-sm text-zinc-600">
                    Không có thông báo
                  </div>
                )}
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`flex cursor-pointer items-start gap-3 border-b border-zinc-800/50 px-4 py-3 transition-colors last:border-0 hover:bg-zinc-800/40 ${
                      !n.read ? "bg-zinc-800/20" : ""
                    }`}
                  >
                    <span className={`mt-0.5 shrink-0 ${TYPE_COLORS[n.type] ?? "text-zinc-400"}`}>
                      {TYPE_ICON[n.type] ?? <Bell className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-medium ${TYPE_COLORS[n.type] ?? "text-zinc-300"}`}>
                        {n.message}
                      </div>
                      <div className="mt-0.5 text-[10px] text-zinc-600">
                        {new Date(n.createdAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                    {!n.read && (
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </div>
                ))}
              </div>

              {notifications.length > 0 && (
                <div className="border-t border-zinc-800 px-4 py-2">
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
