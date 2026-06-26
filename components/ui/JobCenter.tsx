"use client";

import { useEffect, useState } from "react";
import type { BackgroundJob, JobLogEntry } from "@/lib/types";

const STATUS_ICONS: Record<string, string> = {
  queued: "⏳",
  processing: "⚙️",
  done: "✅",
  failed: "❌",
  cancelled: "🚫",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "text-zinc-400",
  processing: "text-blue-400",
  done: "text-emerald-400",
  failed: "text-rose-400",
  cancelled: "text-zinc-600",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  pdf_parse: "Parse PDF",
  dxf_parse: "Parse DXF",
  dwg_convert: "Convert DWG→DXF",
  ai_detect: "AI Detect Objects",
  price_update: "Cập nhật giá",
  review: "Review Workbook",
  review_drawing: "Review Bản vẽ",
  export: "Export F1",
  generate_takeoff: "Generate Takeoff",
  generate_boq: "Generate BOQ",
  compare_revision: "So sánh Revision",
};

interface JobCenterProps {
  open: boolean;
  onClose: () => void;
}

export const jobStore = {
  jobs: [] as BackgroundJob[],
  listeners: new Set<() => void>(),
  add(job: BackgroundJob) {
    this.jobs = [job, ...this.jobs.slice(0, 49)];
    this.listeners.forEach((l) => l());
  },
  update(id: string, partial: Partial<BackgroundJob>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...partial } : j));
    this.listeners.forEach((l) => l());
  },
  appendLog(id: string, entry: JobLogEntry) {
    this.jobs = this.jobs.map((j) =>
      j.id === id ? { ...j, logs: [...(j.logs ?? []), entry] } : j
    );
    this.listeners.forEach((l) => l());
  },
  cancel(id: string) {
    this.update(id, { status: "cancelled", canCancel: false });
  },
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
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

export function appendJobLog(id: string, level: JobLogEntry["level"], message: string) {
  jobStore.appendLog(id, { at: new Date().toISOString(), level, message });
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed top-12 right-4 z-50 w-88 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden" style={{ width: 340 }}>
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
        <div className="max-h-[440px] overflow-y-auto">
          {jobs.length === 0 ? (
            <div className="py-10 text-center text-zinc-600 text-sm">
              Không có jobs
            </div>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="border-b border-zinc-800/50 last:border-0">
                {/* Main row */}
                <div
                  className="px-4 py-3 cursor-pointer hover:bg-zinc-800/30"
                  onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">
                        {job.status === "processing"
                          ? <span className="inline-block animate-spin">⚙️</span>
                          : STATUS_ICONS[job.status] ?? "⏳"}
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
                    <div className="flex items-center gap-2 shrink-0">
                      {job.durationMs != null && job.status === "done" && (
                        <span className="text-[10px] text-zinc-600">{(job.durationMs / 1000).toFixed(1)}s</span>
                      )}
                      <span className={`text-[10px] font-medium ${STATUS_COLORS[job.status]}`}>
                        {job.status}
                      </span>
                    </div>
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

                  {/* Actions row */}
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[9px] text-zinc-700">
                      {new Date(job.createdAt).toLocaleTimeString("vi-VN")}
                      {job.retryCount ? ` · retry #${job.retryCount}` : ""}
                    </span>
                    <div className="flex gap-1.5">
                      {job.canCancel && (
                        <button
                          onClick={(e) => { e.stopPropagation(); jobStore.cancel(job.id); }}
                          className="text-[10px] text-zinc-500 hover:text-rose-400 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      {job.canRetry && job.status === "failed" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateJob(job.id, { status: "queued", progress: 0, retryCount: (job.retryCount ?? 0) + 1 }); }}
                          className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded logs */}
                {expandedId === job.id && job.logs && job.logs.length > 0 && (
                  <div className="px-4 pb-3 bg-zinc-950/40">
                    <div className="rounded border border-zinc-800 bg-zinc-950 p-2 space-y-0.5 max-h-32 overflow-y-auto font-mono">
                      {job.logs.map((log, i) => (
                        <div key={i} className={`text-[10px] flex gap-1.5 ${
                          log.level === "error" ? "text-rose-400" : log.level === "warn" ? "text-amber-400" : "text-zinc-500"
                        }`}>
                          <span className="text-zinc-700 shrink-0">{new Date(log.at).toLocaleTimeString("vi-VN")}</span>
                          <span>{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {jobs.length > 0 && (
          <div className="px-4 py-2 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-[10px] text-zinc-600">{jobs.length} total</span>
            <button
              onClick={() => { jobStore.jobs = jobStore.jobs.filter((j) => j.status === "processing" || j.status === "queued"); jobStore.listeners.forEach((l) => l()); }}
              className="text-[10px] text-zinc-600 hover:text-zinc-400"
            >
              Xóa completed
            </button>
          </div>
        )}
      </div>
    </>
  );
}
