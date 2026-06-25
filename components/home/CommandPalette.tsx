"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { EstimateListItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { setPendingPrompt } from "@/lib/pendingPrompt";
import { Spinner } from "@/components/ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
  estimates: EstimateListItem[];
}

const QUICK_COMMANDS = [
  { id: "new", label: "Tạo Workspace mới", icon: "➕", action: "new" },
  { id: "review", label: "Review Workbook mới nhất", icon: "🔍", action: "review" },
  { id: "import", label: "Import Excel", icon: "📥", action: "import" },
  { id: "prices", label: "Tìm giá vật liệu mới nhất", icon: "💰", action: "prices" },
  { id: "codes", label: "Tìm mã hiệu công tác", icon: "🔢", action: "codes" },
  { id: "official", label: "Tra cứu văn bản chính thức", icon: "📋", action: "official" },
];

export function CommandPalette({ open, onClose, estimates }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.toLowerCase().trim();
  const matchedEstimates = q
    ? estimates.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 5)
    : estimates.slice(0, 5);
  const matchedCommands = q
    ? QUICK_COMMANDS.filter((c) => c.label.toLowerCase().includes(q))
    : QUICK_COMMANDS;

  async function handleNew() {
    if (creating) return;
    setCreating(true);
    try {
      const name = query.trim() || "Workspace mới";
      const est = await api.createEstimate(name);
      onClose();
      router.push(`/estimate/${est.id}`);
    } catch {
      setCreating(false);
    }
  }

  async function handleCommand(action: string) {
    if (action === "new") {
      await handleNew();
      return;
    }
    if (action === "review") {
      if (estimates.length === 0) { await handleNew(); return; }
      setPendingPrompt({
        estimateId: estimates[0].id,
        message: "Review toàn bộ workbook: kiểm tra công thức, giá, trùng lặp",
        files: [],
      });
      onClose();
      router.push(`/estimate/${estimates[0].id}`);
      return;
    }
    if (action === "prices") {
      if (estimates.length === 0) { await handleNew(); return; }
      setPendingPrompt({
        estimateId: estimates[0].id,
        message: "Tìm và cập nhật giá vật liệu mới nhất từ nguồn chính thức",
        files: [],
      });
      onClose();
      router.push(`/estimate/${estimates[0].id}`);
      return;
    }
    if (action === "codes") {
      if (estimates.length === 0) { await handleNew(); return; }
      setPendingPrompt({
        estimateId: estimates[0].id,
        message: query.trim() || "Tra cứu mã hiệu công tác xây dựng",
        files: [],
      });
      onClose();
      router.push(`/estimate/${estimates[0].id}`);
      return;
    }
    if (action === "official") {
      if (estimates.length === 0) { await handleNew(); return; }
      setPendingPrompt({
        estimateId: estimates[0].id,
        message: "Tìm và tóm tắt văn bản pháp luật xây dựng mới nhất",
        files: [],
      });
      onClose();
      router.push(`/estimate/${estimates[0].id}`);
      return;
    }
    // import — just close for now
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/80 pt-[15vh] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-slide-up w-full max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <span className="text-zinc-500">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (query.trim()) handleNew();
                else handleCommand("new");
              }
            }}
            placeholder="Tìm workspace, vật liệu, mã hiệu, lệnh..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          {creating && <Spinner className="h-4 w-4 text-zinc-500" />}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
            ESC
          </kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2">
          {/* Quick commands */}
          {matchedCommands.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Lệnh nhanh
              </p>
              {matchedCommands.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => handleCommand(cmd.action)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <span className="text-base">{cmd.icon}</span>
                  {cmd.label}
                </button>
              ))}
            </div>
          )}

          {/* Workspaces */}
          {matchedEstimates.length > 0 && (
            <div className={cn(matchedCommands.length > 0 && "mt-2")}>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Workspaces
              </p>
              {matchedEstimates.map((est) => (
                <button
                  key={est.id}
                  onClick={() => {
                    onClose();
                    router.push(`/estimate/${est.id}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800"
                >
                  <span>📄</span>
                  <span className="flex-1 truncate text-zinc-200">{est.name}</span>
                  <span className="text-xs text-zinc-600">{est.takeoffCount} công tác</span>
                </button>
              ))}
            </div>
          )}

          {/* Create from query */}
          {query.trim() && (
            <div className="mt-2 border-t border-zinc-800 pt-2">
              <button
                onClick={handleNew}
                disabled={creating}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-accent-300 hover:bg-accent-500/10 disabled:opacity-50"
              >
                <span>➕</span>
                Tạo workspace mới &ldquo;{query.trim()}&rdquo;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
