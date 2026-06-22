"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EstimateListItem } from "@/lib/types";
import { cn, formatVndShort, formatDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useStaggerReveal } from "@/lib/hooks";
import {
  TableIcon,
  TrashIcon,
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/ui/icons";

const STORAGE_KEY = "genspec_history_collapsed";

interface Props {
  estimates: EstimateListItem[] | null;
  onDelete: (id: string) => void;
}

export function ProjectHistory({ estimates, onDelete }: Props) {
  const { t } = useT();
  const count = estimates?.length ?? 0;
  const [collapsed, setCollapsed] = useState(false);

  // Persist collapsed state across visits.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={t("home.expand")}
        aria-label={t("home.expand")}
        className="flex w-full flex-row items-center justify-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 py-2.5 text-zinc-400 transition-colors hover:border-accent-500/40 hover:text-accent-200"
      >
        <ChevronRightIcon className="h-4 w-4" />
        <ClockIcon className="h-5 w-5" />
        {count > 0 && (
          <span className="rounded-full bg-zinc-800/70 px-1.5 py-0.5 text-[11px] text-zinc-300">
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <Expanded
      estimates={estimates}
      count={count}
      onDelete={onDelete}
      onCollapse={toggle}
    />
  );
}

function Expanded({
  estimates,
  count,
  onDelete,
  onCollapse,
}: {
  estimates: EstimateListItem[] | null;
  count: number;
  onDelete: (id: string) => void;
  onCollapse: () => void;
}) {
  const { t } = useT();
  const visible = useStaggerReveal(count, { interval: 70 });

  return (
    <div className="flex w-full flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <ClockIcon className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-200">
          {t("home.historyTitle")}
        </h2>
        {count > 0 && (
          <span className="rounded-full bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-400">
            {count}
          </span>
        )}
        <button
          type="button"
          onClick={onCollapse}
          title={t("home.collapse")}
          aria-label={t("home.collapse")}
          className="ml-auto rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      </div>

      {estimates === null ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[78px] rounded-2xl" />
          ))}
        </div>
      ) : estimates.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30">
          <EmptyState
            icon={<TableIcon className="h-5 w-5" />}
            title={t("home.historyEmpty")}
            description={t("home.historyEmptyDesc")}
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {estimates.map((est, i) => (
            <div
              key={est.id}
              className={cn(
                "group relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 transition-all duration-200",
                "hover:-translate-y-px hover:border-accent-500/40 hover:bg-zinc-900/70",
                i < visible ? "animate-slide-up" : "opacity-0"
              )}
              style={i < visible ? { animationDelay: `${i * 30}ms` } : undefined}
            >
              <Link href={`/estimate/${est.id}`} className="block">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-500/10 text-accent-300">
                    <TableIcon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1 pr-6">
                    <p className="truncate text-sm font-medium text-zinc-100 group-hover:text-white">
                      {est.name || t("editor.untitled")}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {t("home.items", { count: est.takeoffCount ?? 0 })}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-zinc-100">
                    {formatVndShort(est.costs?.total ?? 0)}
                  </span>
                  <span className="truncate text-[11px] text-zinc-600">
                    {formatDateTime(est.updatedAt)}
                  </span>
                </div>
              </Link>
              <button
                onClick={() => onDelete(est.id)}
                className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                aria-label={t("common.delete")}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
