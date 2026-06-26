"use client";

import { useEffect, useRef, useState } from "react";
import type { BackgroundJob } from "@/lib/types";
import { api } from "@/lib/api";

const STATUS_ICONS: Record<string, string> = {
  queued: "⏳",
  processing: "⚙️",
  done: "✅",
  failed: "❌",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "text-zinc-400",
  processing: "text-blue-400",
  done: "text-emerald-400",
  failed: "text-rose-400",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  pdf_parse: "Parse PDF",
  dxf_parse: "Parse DXF",
  dwg_convert: "Convert DWG→DXF",
  ai_detect: "AI Detect Objects",
  price_update: "Cập nhật giá",
  review: "Review Workbook",
  export: "Export F1",
};

interface JobCenterProps {
  open: boolean;
  onClose: () => void;
}

// In-memory job queue — populated by other components via addJob()
export const jobStore = {
  jobs: [] as BackgroundJob[],
  listeners: new Set<() => void>(),
  add(job: BackgroundJob) {
    this.jobs = [job, ...this.jobs.slice(0, 19)];
    this.listeners.forEach((l) => l());
  },
  update(id: string, partial: Partial<BackgroundJob>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...partial } : j));
    this.listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
};

export function addJob(job: Omit<BackgroundJob, "createdAt">): BackgroundJob {
  const full: BackgroundJob = { ...job, createdAt: new Date().toISOString() };
  jobStore.add(full);
  return full;
}

export function updateJob(id: string, partial: Partial<BackgroundJob>) {
  jobStore.update(id, partial);
}

export function useJobCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sync = () => {
      setCount(jobStore.jobs.filter((j) => j.status === "processing" || j.status === "queued").length);
    };
    sync();
    const unsub = jobStore.subscribe(sync);
    return () => { unsub(); };
  }, []);
  return count;
}

export function JobCenter({ open, onClose }: JobCenterProps) {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);

  useEffect(() => {
    const sync = () => setJobs([...jobStore.jobs]);
    sync();
    const unsub = jobStore.subscribe(sync);
    return () => { unsub(); };
  }, []);

  const activeCount = jobs.filter((j) => j.status === "processing" || j.status === "queued").length;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-12 right-4 z-50 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">Job Center</span>
            {activeCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-mono">
                {activeCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
        </div>

        {/* Job list */}
        <div className="max-h-96 overflow-y-auto">
          {jobs.length === 0 ? (
            <div className="py-10 text-center text-zinc-600 text-sm">
              Không có jobs đang chạy
            </div>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="px-4 py-3 border-b border-zinc-800/50 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">
                      {job.status === "processing" ? (
                        <span className="inline-block animate-spin">⚙️</span>
                      ) : (
                        STATUS_ICONS[job.status] ?? "⏳"
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-200 truncate">
                        {JOB_TYPE_LABELS[job.type] ?? job.type}
                      </div>
                      {job.message && (
                        <div className="text-[10px] text-zinc-500 truncate">{job.message}</div>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 ${STATUS_COLORS[job.status]}`}>
                    {job.status}
                  </span>
                </div>

                {/* Progress bar */}
                {(job.status === "processing" || job.status === "queued") && (
                  <div className="mt-2 h-1 rounded-full bg-zinc-800 overflow-hidden">
                    {job.status === "processing" ? (
                      <div
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${job.progress}%` }}
                      />
                    ) : (
                      <div className="h-full w-1/3 bg-zinc-600 animate-pulse" />
                    )}
                  </div>
                )}

                <div className="mt-1 text-[9px] text-zinc-700">
                  {new Date(job.createdAt).toLocaleTimeString("vi-VN")}
                </div>
              </div>
            ))
          )}
        </div>

        {jobs.length > 0 && (
          <div className="px-4 py-2 border-t border-zinc-800">
            <button
              onClick={() => { jobStore.jobs = []; jobStore.listeners.forEach((l) => l()); }}
              className="text-[10px] text-zinc-600 hover:text-zinc-400"
            >
              Xóa lịch sử
            </button>
          </div>
        )}
      </div>
    </>
  );
}
