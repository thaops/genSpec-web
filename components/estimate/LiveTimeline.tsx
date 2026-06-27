"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { SparkleIcon, CheckCircleIcon } from "@/components/ui/icons";
import {
  Search, Ruler, Box, Wrench, HardHat, DollarSign, Link, BarChart3,
  FlaskConical, CheckCircle2, FileText,
} from "lucide-react";

export interface TimelineStep {
  text: string;
  at: string; // HH:MM:SS
}

function stepIcon(text: string): React.ReactNode {
  const s = text.toLowerCase();
  if (/phân tích|yêu cầu|loại công trình/.test(s)) return <Search className="h-3 w-3" />;
  if (/bóc tách|khối lượng(?!.*bê)/.test(s)) return <Ruler className="h-3 w-3" />;
  if (/bê ?tông/.test(s)) return <Box className="h-3 w-3" />;
  if (/thép|cốt thép/.test(s)) return <Wrench className="h-3 w-3" />;
  if (/nhân công|lương|chi phí nc/.test(s)) return <HardHat className="h-3 w-3" />;
  if (/giá|vật liệu|vật tư|tra cứu|thu thập/.test(s)) return <DollarSign className="h-3 w-3" />;
  if (/nguồn|tham chiếu/.test(s)) return <Link className="h-3 w-3" />;
  if (/benchmark|suất đầu tư|đối chiếu|thị trường/.test(s)) return <BarChart3 className="h-3 w-3" />;
  if (/kiểm tra|hợp lý|đồng bộ|tính hợp/.test(s)) return <FlaskConical className="h-3 w-3" />;
  if (/hoàn thành|báo cáo|tổng hợp/.test(s)) return <CheckCircle2 className="h-3 w-3" />;
  if (/bản vẽ|ảnh|đọc/.test(s)) return <FileText className="h-3 w-3" />;
  return <span className="text-[8px]">•</span>;
}

// Realtime list of streamed reasoning steps. The last item is "current"
// (pulsing) while `streaming` is true; earlier ones are completed (checkmark).
export function LiveTimeline({
  steps,
  streaming,
}: {
  steps: TimelineStep[];
  streaming: boolean;
}) {
  const { t } = useT();
  const reduced = usePrefersReducedMotion();
  if (steps.length === 0 && !streaming) return null;

  return (
    <div className="animate-slide-up rounded-2xl border border-accent-500/25 bg-accent-500/[0.06] px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-accent-200">
        <span className="relative flex h-5 w-5 items-center justify-center rounded-md bg-accent-500/15 text-accent-300">
          {streaming && !reduced && (
            <span className="animate-pulse-glow absolute inset-0 rounded-md" />
          )}
          <SparkleIcon className="h-3 w-3" />
        </span>
        {streaming ? t("copilot.streaming") : t("copilot.liveTimeline")}
      </div>

      <ol className="relative space-y-2 pl-1">
        {/* connecting line */}
        {steps.length > 1 && (
          <span className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-accent-500/40 via-zinc-700/60 to-transparent" />
        )}
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          const current = streaming && isLast;
          return (
            <li
              key={i}
              className={cn(
                "relative flex items-start gap-2.5 pl-4 text-[12px] leading-snug",
                current ? "text-zinc-200" : "text-zinc-400",
                reduced ? "opacity-100" : "animate-slide-up"
              )}
            >
              {current ? (
                <span className="absolute left-[-1px] top-[1px] flex h-4 w-4 items-center justify-center">
                  <span
                    className={cn(
                      "absolute inline-flex h-4 w-4 rounded-full bg-accent-400/30",
                      !reduced && "animate-ping"
                    )}
                  />
                  <span className="relative text-[13px] leading-none">{stepIcon(s.text)}</span>
                </span>
              ) : (
                <span className="absolute left-[-1px] top-[1px] text-[13px] leading-none">
                  {stepIcon(s.text)}
                </span>
              )}
              <span className={cn("min-w-0 flex-1 pl-1", current && "font-medium")}>{s.text}</span>
              {!current && <CheckCircleIcon className="mt-[3px] h-3 w-3 shrink-0 text-emerald-400/70" />}
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                {s.at}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
