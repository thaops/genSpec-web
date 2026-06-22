"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatNum } from "@/lib/utils";

interface Props {
  value: number;
  onCommit: (next: number) => void;
  className?: string;
  disabled?: boolean;
}

// Right-aligned numeric cell. Edits as a plain number; commits on blur/Enter.
export function EditableNumberCell({
  value,
  onCommit,
  className,
  disabled,
}: Props) {
  // `draft` is only meaningful while editing; it's seeded fresh on each open,
  // so no effect is needed to keep it in sync with `value`.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function open() {
    setDraft(String(value));
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const parsed = Number(draft.replace(/[^\d.-]/g, ""));
    const next = isFinite(parsed) ? parsed : 0;
    if (next !== value) onCommit(next);
  }

  if (editing && !disabled) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        inputMode="decimal"
        className={cn(
          "w-full bg-zinc-800 px-2 py-1.5 text-right font-mono text-xs text-zinc-100 outline-none ring-1 ring-accent-500/60",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={open}
      className={cn(
        "block w-full px-2 py-1.5 text-right font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/60 disabled:cursor-default",
        className
      )}
    >
      {formatNum(value)}
    </button>
  );
}
