"use client";

import { cn } from "@/lib/utils";
import { FileEdit, ClipboardCheck, Table2, Download } from "lucide-react";
import type { ComponentType } from "react";

// P6 task-mode: điều hướng theo BƯỚC QS (thay vì phơi mọi view/nút).
// Mỗi bước map vào viewMode/action đã có — additive, không phá cấu trúc cũ.
export type WorkflowStep = "draw" | "check" | "estimate" | "export";

interface StepDef {
  key: WorkflowStep;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
}

const STEPS: StepDef[] = [
  { key: "draw", label: "Bản vẽ & Bóc", hint: "Nhận diện & bóc khối lượng từ bản vẽ", icon: FileEdit },
  { key: "check", label: "Kiểm tra", hint: "Rà soát chất lượng, thiếu phạm vi", icon: ClipboardCheck },
  { key: "estimate", label: "Dự toán", hint: "Bảng khối lượng – đơn giá – thành tiền", icon: Table2 },
  { key: "export", label: "Xuất", hint: "Xuất F1 / THDT / TMĐT", icon: Download },
];

interface Props {
  active: WorkflowStep;
  onStep: (step: WorkflowStep) => void;
}

export function WorkflowStepper({ active, onStep }: Props) {
  const activeIdx = STEPS.findIndex((s) => s.key === active);
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 bg-zinc-950/60 px-2 py-1">
      {STEPS.map((s, i) => {
        const isActive = s.key === active;
        const done = i < activeIdx;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center">
            <button
              type="button"
              onClick={() => onStep(s.key)}
              title={s.hint}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-accent-600 text-white"
                  : done
                    ? "text-emerald-300/80 hover:bg-zinc-800"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold",
                  isActive ? "bg-white/20" : done ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-500"
                )}
              >
                {i + 1}
              </span>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="mx-0.5 h-px w-3 bg-zinc-700" />}
          </div>
        );
      })}
    </div>
  );
}
