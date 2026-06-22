import type { ReactNode } from "react";
import { Card } from "./ui/Card";
import { cn } from "@/lib/utils";

type Tone = "accent" | "amber" | "emerald" | "rose";

const toneMap: Record<Tone, string> = {
  accent: "from-accent-500/20 to-accent-500/0 text-accent-300",
  amber: "from-amber-500/20 to-amber-500/0 text-amber-400",
  emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-400",
  rose: "from-rose-500/20 to-rose-500/0 text-rose-400",
};

export function StatCard({
  label,
  value,
  icon,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br",
            toneMap[tone]
          )}
        >
          {icon}
        </span>
      </div>
    </Card>
  );
}
