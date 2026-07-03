"use client";

import { useRef, useState, useEffect } from "react";
import type { Drawing } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { Spinner } from "@/components/ui/Button";
import { addJob, updateJob } from "@/components/ui/JobCenter";
import { FolderOpen } from "lucide-react";

const ACCEPTED = ".pdf,.dxf,.dwg,.jpg,.jpeg,.png";

const STEP_LABELS: Record<string, string> = {
  queued:     "Đã tải lên, đang xếp hàng...",
  downloading:"Đang tải file...",
  converting: "Đang chuyển đổi DWG → DXF...",
  parsing:    "Đang đọc bản vẽ...",
  detecting:  "Đang phân tích đối tượng...",
  indexing:   "Đang tạo search index...",
  graph:      "Đang xây dựng relationship graph...",
  ready:      "Bản vẽ sẵn sàng!",
  failed:     "Xử lý thất bại",
};

interface DrawingUploadProps {
  estimateId: string;
  onUploaded: (drawing: Drawing) => void;
}

export function DrawingUpload({ estimateId, onUploaded }: DrawingUploadProps) {
  const inputRef    = useRef<HTMLInputElement>(null);
  // Live connections/timers — cleaned up on unmount so a mid-parse unmount
  // doesn't leak the SSE stream, the poll interval, or setState calls.
  const esRef       = useRef<EventSource | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalizeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef  = useRef(true);
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stepMsg,   setStepMsg]   = useState<string | null>(null);
  const [percent,   setPercent]   = useState(0);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      if (finalizeRef.current) clearTimeout(finalizeRef.current);
      finalizeRef.current = null;
    };
  }, []);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setStepMsg("Đang tải lên...");
    setPercent(5);

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const job = addJob({
      id: crypto.randomUUID(),
      type: ext === "dwg" ? "dwg_convert" : ext === "pdf" ? "pdf_parse" : "dxf_parse",
      status: "processing",
      progress: 5,
      message: `Đang xử lý ${file.name}`,
      estimateId,
    });

    try {
      // Upload returns immediately with drawingId + jobId
      const result = await api.uploadDrawing(estimateId, file) as Drawing & { jobId?: string };
      const jobId  = result.jobId;

      setStepMsg(STEP_LABELS.queued);
      setPercent(10);

      if (!jobId) {
        // No queue (fallback) — done
        updateJob(job.id, { status: "done", progress: 100, message: `${file.name} đã tải lên` });
        finalize(result);
        return;
      }

      // Poll job status via SSE
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const es = new EventSource(`${apiBase}/jobs/${jobId}/stream`);
      esRef.current = es;

      es.onmessage = (e) => {
        if (!mountedRef.current) return;
        const data = JSON.parse(e.data) as {
          state: string;
          progress: { step: string; message: string; percent: number };
          failedReason?: string;
        };

        const p = data.progress ?? {};
        const step    = p.step ?? data.state;
        const pct     = p.percent ?? percent;
        const msg     = STEP_LABELS[step] ?? step;

        setStepMsg(msg);
        setPercent(pct);
        updateJob(job.id, { progress: pct, message: `${file.name}: ${msg}` });

        if (data.state === "completed") {
          es.close();
          updateJob(job.id, { status: "done", progress: 100, message: `${file.name} sẵn sàng` });
          finalize({ ...result, parseStatus: "ready" });
        } else if (data.state === "failed") {
          es.close();
          const reason = data.failedReason ?? "Xử lý thất bại";
          updateJob(job.id, { status: "failed", message: reason });
          setError(reason);
          setUploading(false);
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!mountedRef.current) return;
        // SSE dropped — poll the drawing until parse finishes instead of faking success
        updateJob(job.id, { message: `${file.name}: mất kết nối, đang kiểm tra...` });
        let pollErrors = 0;
        const stopPoll = () => {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        };
        pollRef.current = setInterval(async () => {
          try {
            const d = await api.getDrawing(estimateId, result.id);
            if (!mountedRef.current) return stopPoll();
            pollErrors = 0;
            if (d.parseStatus === "ready") {
              stopPoll();
              updateJob(job.id, { status: "done", progress: 100, message: `${file.name} sẵn sàng` });
              finalize({ ...result, parseStatus: "ready" });
            } else if (d.parseStatus === "failed") {
              stopPoll();
              updateJob(job.id, { status: "failed", message: STEP_LABELS.failed });
              setError(STEP_LABELS.failed);
              setUploading(false);
            }
          } catch {
            if (!mountedRef.current) return stopPoll();
            if (++pollErrors >= 3) {
              stopPoll();
              const msg = "Mất kết nối — kiểm tra lại sau";
              updateJob(job.id, { status: "failed", message: msg });
              setError(msg);
              setUploading(false);
            }
          }
        }, 4000);
      };
    } catch (e) {
      updateJob(job.id, { status: "failed", message: (e as ApiError).message });
      setError((e as ApiError).message);
      setUploading(false);
      setStepMsg(null);
    }
  }

  function finalize(drawing: Drawing) {
    if (!mountedRef.current) return;
    setStepMsg("Bản vẽ sẵn sàng!");
    setPercent(100);
    finalizeRef.current = setTimeout(() => {
      finalizeRef.current = null;
      if (!mountedRef.current) return;
      setStepMsg(null);
      setPercent(0);
      setUploading(false);
      onUploaded(drawing);
    }, 800);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed transition-colors cursor-pointer
        ${dragging ? "border-blue-500 bg-blue-500/5" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={onInputChange} />

      {uploading ? (
        <div className="flex flex-col items-center gap-3 w-full px-6">
          <Spinner className="h-6 w-6 text-blue-400" />
          <p className="text-sm text-zinc-300 text-center">{stepMsg}</p>
          {percent > 0 && (
            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center px-4">
          <FolderOpen className="h-8 w-8 text-zinc-500" />
          <p className="text-sm text-zinc-300">Kéo thả hoặc click để tải bản vẽ</p>
          <p className="text-xs text-zinc-600">PDF, DXF, DWG, PNG, JPG</p>
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 right-2 rounded bg-rose-900/50 border border-rose-700/50 px-3 py-1.5 text-xs text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
