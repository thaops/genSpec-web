"use client";

import { useState } from "react";
import type { PendingTask, TaskType } from "@/lib/pendingTask";
import { cn } from "@/lib/utils";
import { Search, DollarSign, Hash, BarChart3, Sparkles, ScrollText, X } from "lucide-react";
import type React from "react";

// ── Meta ──────────────────────────────────────────────────────────────────────

const TASK_META: Record<TaskType, { Icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  review:       { Icon: Search,      label: "Review Agent",       color: "text-blue-300 bg-blue-500/10 border-blue-700/40" },
  price_update: { Icon: DollarSign,  label: "Price Update Agent", color: "text-emerald-300 bg-emerald-500/10 border-emerald-700/40" },
  code_lookup:  { Icon: Hash,        label: "Code Lookup",        color: "text-amber-300 bg-amber-500/10 border-amber-700/40" },
  boq_analysis: { Icon: BarChart3,   label: "BOQ Analysis Agent", color: "text-violet-300 bg-violet-500/10 border-violet-700/40" },
  optimize:     { Icon: Sparkles,    label: "Optimization Agent", color: "text-rose-300 bg-rose-500/10 border-rose-700/40" },
  legal:        { Icon: ScrollText,  label: "Legal Agent",        color: "text-cyan-300 bg-cyan-500/10 border-cyan-700/40" },
};

// ── Shared primitives ─────────────────────────────────────────────────────────

function RunButton({ onClick, label, color }: { onClick: () => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mt-3 w-full rounded-lg py-2.5 text-[12px] font-semibold text-white transition-all hover:-translate-y-px active:translate-y-0",
        color ?? "bg-accent-600 hover:bg-accent-500",
      )}
    >
      {label}
    </button>
  );
}

// ── Review Task ───────────────────────────────────────────────────────────────

const REVIEW_SCOPE = [
  { key: "code",    label: "Mã hiệu",   detail: "mã hiệu công tác" },
  { key: "formula", label: "Công thức", detail: "công thức tính toán" },
  { key: "matprice",label: "Giá VL",    detail: "giá vật liệu" },
  { key: "labor",   label: "Nhân công", detail: "đơn giá nhân công" },
  { key: "machine", label: "Ca máy",    detail: "giá ca máy" },
  { key: "norm",    label: "Định mức",  detail: "hệ số định mức" },
  { key: "legal",   label: "Văn bản",   detail: "văn bản pháp lý áp dụng" },
  { key: "outlier", label: "Bất thường",detail: "giá trị bất thường" },
];

function ReviewTaskBody({ onRun }: { onRun: (p: string) => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(REVIEW_SCOPE.map((s) => [s.key, true])),
  );

  function run() {
    const selected = REVIEW_SCOPE.filter((s) => checked[s.key]).map((s) => s.detail);
    onRun(
      `Review toàn bộ workbook. Kiểm tra chi tiết: ${selected.join(", ")}.\n\n` +
      `Chỉ tạo Proposal, không tự sửa.\n` +
      `Trả về Review Summary: Health %, số lỗi (critical/warning/info), danh sách phát hiện có mã ô cụ thể.`,
    );
  }

  return (
    <div>
      <p className="mb-2 text-[11px] text-zinc-500">Scope</p>
      <div className="grid grid-cols-2 gap-0.5">
        {REVIEW_SCOPE.map((s) => (
          <label
            key={s.key}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-zinc-800/60"
          >
            <input
              type="checkbox"
              checked={checked[s.key]}
              onChange={() => setChecked((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
              className="h-3 w-3 rounded accent-blue-500"
            />
            <span className="text-[12px] text-zinc-300">{s.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-600">
        <span>Agent: Review Agent</span>
        <span>·</span>
        <span>Est. ~30s</span>
      </div>
      <RunButton onClick={run} label="▶  Run Review" color="bg-blue-600 hover:bg-blue-500" />
    </div>
  );
}

// ── Price Update Task ─────────────────────────────────────────────────────────

const PROVINCES = ["TP.HCM", "Hà Nội", "Bình Dương", "Đồng Nai", "Đà Nẵng", "Toàn quốc"];
const PRICE_SRC = [
  { value: "official",  label: "Chính thức (Sở XD)" },
  { value: "supplier",  label: "Nhà cung cấp" },
  { value: "all",       label: "Tất cả" },
];

function PriceTaskBody({ onRun, initialProvince }: { onRun: (p: string) => void; initialProvince?: string }) {
  const [province, setProvince] = useState(initialProvince ?? "TP.HCM");
  const [source, setSource] = useState("official");

  function run() {
    const srcLabel = PRICE_SRC.find((s) => s.value === source)?.label ?? source;
    onRun(
      `Tra cứu giá vật liệu xây dựng mới nhất tại ${province} từ nguồn ${srcLabel}.\n` +
      `So sánh với giá hiện tại trong workbook.\n` +
      `Sinh Proposal cập nhật từng vật tư — user có thể Áp dụng hoặc Bỏ qua từng mục riêng lẻ.`,
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[11px] text-zinc-500">Tỉnh / Thành phố</p>
        <div className="flex flex-wrap gap-1">
          {PROVINCES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvince(p)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                province === p
                  ? "border-emerald-600/60 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] text-zinc-500">Nguồn</p>
        <div className="flex gap-1.5">
          {PRICE_SRC.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSource(s.value)}
              className={cn(
                "flex-1 rounded-lg border py-1.5 text-[11px] transition-colors",
                source === s.value
                  ? "border-emerald-600/60 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <RunButton onClick={run} label="▶  Tra cứu & So sánh" color="bg-emerald-600 hover:bg-emerald-500" />
    </div>
  );
}

// ── Code Lookup Task ──────────────────────────────────────────────────────────

function CodeLookupTaskBody({ onRun }: { onRun: (p: string) => void }) {
  const [code, setCode] = useState("");

  function run() {
    onRun(
      code.trim()
        ? `Tra cứu mã hiệu "${code.trim()}": tên đầy đủ công tác, Thông tư/Quyết định áp dụng, định mức VL/NC/Máy chi tiết. Đề xuất Insert vào workbook nếu chưa có.`
        : `Liệt kê 20 mã hiệu công tác xây dựng phổ biến nhất trong dự toán dân dụng. Hiển thị kèm định mức VL/NC/Máy và Thông tư áp dụng. Format bảng rõ ràng.`,
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-zinc-500">Nhập mã hoặc mô tả công tác</p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && run()}
        placeholder="VD: AB.25322 hoặc đào đất hố móng..."
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        autoFocus
      />
      <RunButton
        onClick={run}
        label={code.trim() ? "▶  Tra cứu mã" : "▶  Liệt kê mã phổ biến"}
        color="bg-amber-600 hover:bg-amber-500"
      />
    </div>
  );
}

// ── BOQ Analysis Task ─────────────────────────────────────────────────────────

const BOQ_TYPES = [
  { value: "cost",     label: "Chi phí",   detail: "cơ cấu chi phí VL/NC/Máy, top 10 hạng mục đắt nhất, so sánh suất đầu tư chuẩn khu vực" },
  { value: "material", label: "Vật liệu",  detail: "top 10 vật tư chiếm nhiều chi phí nhất, kiểm tra giá đơn vị so thị trường, phát hiện giá bất thường" },
  { value: "risk",     label: "Rủi ro",    detail: "hạng mục giá AI_estimate, thiếu nguồn dữ liệu, độ không chắc chắn cao — đề xuất bổ sung" },
  { value: "full",     label: "Toàn diện", detail: "cơ cấu chi phí + vật liệu + rủi ro + tổng hợp đề xuất tối ưu" },
];

function BocAnalysisTaskBody({ onRun }: { onRun: (p: string) => void }) {
  const [type, setType] = useState("cost");

  function run() {
    const sel = BOQ_TYPES.find((t) => t.value === type)!;
    onRun(`Phân tích BOQ — ${sel.label}: ${sel.detail}.\nTrình bày dạng bảng, số liệu cụ thể, kèm nhận xét chuyên môn QS.`);
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-zinc-500">Phân tích</p>
      <div className="space-y-1">
        {BOQ_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors",
              type === t.value
                ? "border-violet-600/60 bg-violet-500/10 text-violet-200"
                : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700",
            )}
          >
            <span className="text-[10px]">{type === t.value ? "●" : "○"}</span>
            {t.label}
          </button>
        ))}
      </div>
      <RunButton onClick={run} label="▶  Phân tích" color="bg-violet-600 hover:bg-violet-500" />
    </div>
  );
}

// ── Optimize Task ─────────────────────────────────────────────────────────────

const OPTIMIZE_GOALS = [
  { value: "cost",     label: "Giảm chi phí tổng",   detail: "tìm vật liệu thay thế, loại trùng lặp, tối ưu overhead" },
  { value: "material", label: "Tối ưu vật liệu",      detail: "gợi ý vật liệu thay thế đảm bảo chất lượng nhưng rẻ hơn" },
  { value: "code",     label: "Chuẩn hóa mã hiệu",    detail: "thay mã cũ/sai bằng mã hiện hành theo Thông tư mới nhất" },
];

function OptimizeTaskBody({ onRun }: { onRun: (p: string) => void }) {
  const [goal, setGoal] = useState("cost");

  function run() {
    const sel = OPTIMIZE_GOALS.find((g) => g.value === goal)!;
    onRun(
      `Tối ưu dự toán — mục tiêu: ${sel.label}. ${sel.detail}.\n` +
      `Sinh Proposal cụ thể, không tự động áp dụng.\n` +
      `Ước tính số tiền tiết kiệm (VNĐ) cho mỗi đề xuất.`,
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-zinc-500">Mục tiêu</p>
      <div className="space-y-1">
        {OPTIMIZE_GOALS.map((g) => (
          <button
            key={g.value}
            type="button"
            onClick={() => setGoal(g.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors",
              goal === g.value
                ? "border-rose-600/60 bg-rose-500/10 text-rose-200"
                : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700",
            )}
          >
            <span className="text-[10px]">{goal === g.value ? "●" : "○"}</span>
            {g.label}
          </button>
        ))}
      </div>
      <RunButton onClick={run} label="▶  Tìm cơ hội tiết kiệm" color="bg-rose-600 hover:bg-rose-500" />
    </div>
  );
}

// ── Legal Task ────────────────────────────────────────────────────────────────

const LEGAL_TYPES = ["Thông tư", "QCVN", "TCVN", "Quyết định", "Nghị định"];

function LegalTaskBody({ onRun }: { onRun: (p: string) => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(LEGAL_TYPES.slice(0, 3).map((t) => [t, true])),
  );

  function run() {
    const selected = LEGAL_TYPES.filter((t) => checked[t]);
    onRun(
      selected.length > 0
        ? `Tra cứu văn bản pháp lý xây dựng mới nhất: ${selected.join(", ")}.\nLiệt kê những điểm quan trọng ảnh hưởng đến dự toán và định mức trong workbook hiện tại.`
        : "Tra cứu toàn bộ văn bản pháp lý xây dựng mới nhất liên quan đến dự toán và định mức.",
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-zinc-500">Tra cứu</p>
      <div className="grid grid-cols-2 gap-0.5">
        {LEGAL_TYPES.map((t) => (
          <label
            key={t}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-zinc-800/60"
          >
            <input
              type="checkbox"
              checked={!!checked[t]}
              onChange={() => setChecked((prev) => ({ ...prev, [t]: !prev[t] }))}
              className="h-3 w-3 rounded accent-cyan-500"
            />
            <span className="text-[12px] text-zinc-300">{t}</span>
          </label>
        ))}
      </div>
      <RunButton onClick={run} label="▶  Tra cứu văn bản" color="bg-cyan-700 hover:bg-cyan-600" />
    </div>
  );
}

// ── Main TaskCard ─────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: PendingTask;
  estimateName: string;
  onRun: (prompt: string) => void;
  onDismiss: () => void;
}

export function TaskCard({ task, estimateName, onRun, onDismiss }: TaskCardProps) {
  const meta = TASK_META[task.type];

  return (
    <div className="mx-1 mb-3 overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-900/90">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
            meta.color,
          )}
        >
          <meta.Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-zinc-200">{meta.label}</span>
        </div>
        <span className="max-w-[110px] truncate text-[10px] text-zinc-600" title={estimateName}>
          {estimateName}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 shrink-0 rounded p-0.5 text-zinc-600 transition-colors hover:text-zinc-400"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        {task.type === "review"       && <ReviewTaskBody onRun={onRun} />}
        {task.type === "price_update" && (
          <PriceTaskBody onRun={onRun} initialProvince={task.params?.province as string | undefined} />
        )}
        {task.type === "code_lookup"  && <CodeLookupTaskBody onRun={onRun} />}
        {task.type === "boq_analysis" && <BocAnalysisTaskBody onRun={onRun} />}
        {task.type === "optimize"     && <OptimizeTaskBody onRun={onRun} />}
        {task.type === "legal"        && <LegalTaskBody onRun={onRun} />}
      </div>
    </div>
  );
}
