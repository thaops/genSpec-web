"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";
import { LockIcon } from "@/components/ui/icons";
import type { Action, Estimate } from "@/lib/types";

// Every sheet receives the estimate plus an `apply` to push manual edits.
export interface SheetProps {
  estimate: Estimate;
  apply: (actions: Action[]) => Promise<void>;
}

// Dense, scrollable sheet frame with a title bar + optional footer.
export function SheetShell({
  titleKey,
  readonly,
  hint,
  children,
  footer,
}: {
  titleKey: TKey;
  readonly?: boolean;
  hint?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">{t(titleKey)}</h2>
        {readonly && (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
            <LockIcon className="h-3 w-3" />
            {t("tabs.readonly")}
          </span>
        )}
        {hint && (
          <span className="ml-auto hidden truncate text-[11px] text-zinc-500 lg:block">
            {hint}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {footer}
    </div>
  );
}

// Sticky grid header row. `cols` is a tailwind grid-template class.
export function HeadRow({
  cols,
  children,
}: {
  cols: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        cols,
        "sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 text-[11px] font-medium uppercase tracking-wide text-zinc-500 backdrop-blur"
      )}
    >
      {children}
    </div>
  );
}

export function H({
  children,
  right,
}: {
  children?: ReactNode;
  right?: boolean;
}) {
  return (
    <div className={cn("px-2 py-2", right && "text-right")}>{children}</div>
  );
}
