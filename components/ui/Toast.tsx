"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { CheckCircle2, X, Info } from "lucide-react";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastContextValue {
  push: (t: Omit<Toast, "id">) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  const value: ToastContextValue = {
    push,
    success: (title, message) => push({ tone: "success", title, message }),
    error: (title, message) => push({ tone: "error", title, message }),
    info: (title, message) => push({ tone: "info", title, message }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2.5">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const toneStyles: Record<ToastTone, { ring: string; icon: ReactNode }> = {
  success: {
    ring: "border-emerald-500/30",
    icon: (
      <span className="text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    ),
  },
  error: {
    ring: "border-rose-500/30",
    icon: (
      <span className="text-rose-400">
        <X className="h-4 w-4" />
      </span>
    ),
  },
  info: {
    ring: "border-accent-500/30",
    icon: (
      <span className="text-accent-300">
        <Info className="h-4 w-4" />
      </span>
    ),
  },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { t } = useT();
  const s = toneStyles[toast.tone];
  return (
    <div
      className={cn(
        "animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-zinc-900/95 p-3.5 shadow-2xl backdrop-blur",
        s.ring
      )}
    >
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 text-xs text-zinc-400">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-300"
        aria-label={t("common.cancel")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
