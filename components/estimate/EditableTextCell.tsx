"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
  align?: "left" | "right";
  mono?: boolean;
  disabled?: boolean;
}

// Inline text cell. Edits on click; commits on blur/Enter, cancels on Escape.
export function EditableTextCell({
  value,
  onCommit,
  className,
  placeholder,
  align = "left",
  mono,
  disabled,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function open() {
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
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
        placeholder={placeholder}
        className={cn(
          "w-full bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 outline-none ring-1 ring-accent-500/60",
          align === "right" && "text-right",
          mono && "font-mono",
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
        "block w-full truncate px-2 py-1.5 text-xs transition-colors hover:bg-zinc-800/60 disabled:cursor-default",
        align === "right" ? "text-right" : "text-left",
        mono && "font-mono",
        value ? "text-zinc-200" : "text-zinc-600",
        className
      )}
      title={value}
    >
      {value || placeholder || "—"}
    </button>
  );
}
