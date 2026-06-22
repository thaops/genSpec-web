"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "zinc" | "amber" | "emerald" | "rose" | "accent" | "sky";

const tones: Record<Tone, string> = {
  zinc: "bg-zinc-800/80 text-zinc-300 border-zinc-700/80",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  accent: "bg-accent-500/10 text-accent-300 border-accent-500/30",
  sky: "bg-sky-500/10 text-sky-400 border-sky-500/30",
};

export function Badge({
  tone = "zinc",
  children,
  className,
  dot,
  pulse,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
