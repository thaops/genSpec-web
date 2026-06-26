"use client";

import { useRef, useState } from "react";
import type { Drawing } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { Spinner } from "@/components/ui/Button";
import { addJob, updateJob } from "@/components/ui/JobCenter";

const ACCEPTED = ".pdf,.dxf,.dwg,.jpg,.jpeg,.png";
const FILE_ICONS: Record<string, string> = {
  pdf: "📄",
  dxf: "📐",
  dwg: "📐",
  jpg: "🖼️",
  jpeg: "🖼️",
  png: "🖼️",
};

interface DrawingUploadProps {
  estimateId: string;
  onUploaded: (drawing: Drawing) => void;
}

export function DrawingUpload({ estimateId, onUploaded }: DrawingUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isDwg = ext === "dwg";
    const jobType = isDwg ? "dwg_convert" : ext === "pdf" ? "pdf_parse" : "dxf_parse";
    const jobMsg = isDwg ? "Convert DWG → DXF..." : `Parse ${ext.toUpperCase()}...`;
    setProgress(jobMsg);

    const job = addJob({
      id: crypto.randomUUID(),
      type: jobType,
      status: "processing",
      progress: 20,
      message: jobMsg,
      estimateId,
    });

    try {
      const drawing = await api.uploadDrawing(estimateId, file);
      updateJob(job.id, { status: "done", progress: 100, message: `${file.name} sẵn sàng` });
      setProgress("Xử lý xong!");
      setTimeout(() => {
        setProgress(null);
        setUploading(false);
        onUploaded(drawing);
      }, 600);
    } catch (e) {
      updateJob(job.id, { status: "failed", message: (e as ApiError).message });
      setError((e as ApiError).message);
      setUploading(false);
      setProgress(null);
    }
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
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={onInputChange}
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-6 w-6 text-blue-400" />
          <p className="text-sm text-zinc-400">{progress}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center px-4">
          <span className="text-3xl">📂</span>
          <p className="text-sm text-zinc-300">Kéo thả hoặc click để tải bản vẽ</p>
          <p className="text-xs text-zinc-600">PDF, DXF, DWG, PNG, JPG</p>
          <p className="text-[10px] text-zinc-700 mt-1">DWG sẽ tự động convert sang DXF</p>
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
