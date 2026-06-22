"use client";

import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n/I18nProvider";
import type { PriceSource } from "@/lib/types";
import {
  InfoIcon,
  ExternalLinkIcon,
  AlertIcon,
} from "@/components/ui/icons";
import { Popover } from "./Popover";

// Color buckets for a 0-100 confidence score.
function confTone(c: number) {
  if (c >= 90) return { text: "text-emerald-300", bar: "bg-emerald-400" };
  if (c >= 70) return { text: "text-amber-300", bar: "bg-amber-400" };
  return { text: "text-rose-300", bar: "bg-rose-400" };
}

// Small "nguồn" affordance next to a price; popover shows full provenance.
// When no source is present, renders a muted "chưa rõ nguồn" hint so the
// data gap stays visible.
export function SourcePopover({ source }: { source?: PriceSource }) {
  const { t } = useT();

  const hasData =
    source &&
    (source.name ||
      source.date ||
      source.region ||
      source.confidence != null ||
      source.url);

  if (!hasData) {
    return (
      <span
        className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-zinc-800 bg-zinc-900/40 px-1.5 text-[10px] text-zinc-600"
        title={t("transparency.unknownSource")}
      >
        <AlertIcon className="h-3 w-3" />
        <span className="hidden whitespace-nowrap sm:inline">
          {t("transparency.unknownSource")}
        </span>
      </span>
    );
  }

  const conf = source!.confidence;
  const tone = conf != null ? confTone(conf) : null;

  return (
    <Popover
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          title={source!.name}
          className={cn(
            "inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[10px] font-medium transition-colors",
            open
              ? "border-accent-500/40 bg-accent-500/15 text-accent-300"
              : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-accent-500/40 hover:text-accent-300"
          )}
        >
          <InfoIcon className="h-3 w-3" />
          {tone ? (
            <span className={cn("font-mono", tone.text)}>{conf}%</span>
          ) : (
            <span className="hidden sm:inline">{t("transparency.source")}</span>
          )}
        </button>
      )}
    >
      <div className="space-y-2 text-[11px]">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {t("transparency.sourceLabel")}
        </p>

        <Row label={t("transparency.source")} value={source!.name} />
        <Row
          label={t("transparency.updated")}
          value={source!.date ? formatDate(source!.date) : undefined}
        />
        <Row label={t("transparency.region")} value={source!.region} />

        {conf != null && tone && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">
                {t("transparency.confidence")}
              </span>
              <span className={cn("font-mono font-medium", tone.text)}>
                {conf}%
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn("h-full rounded-full", tone.bar)}
                style={{ width: `${Math.max(0, Math.min(100, conf))}%` }}
              />
            </div>
          </div>
        )}

        {source!.url ? (
          <a
            href={source!.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1.5 rounded-md border border-accent-500/30 bg-accent-500/10 px-2 py-1.5 text-accent-200 transition-colors hover:border-accent-500/50 hover:bg-accent-500/15"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {t("transparency.viewSource")}
              </span>
              <span className="block truncate text-[10px] text-accent-300/70">
                {hostOf(source!.url)}
              </span>
            </span>
          </a>
        ) : (
          <p className="mt-1 flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5 text-[10px] text-zinc-500">
            <AlertIcon className="h-3 w-3 shrink-0" />
            {t("transparency.noLink")}
          </p>
        )}
      </div>
    </Popover>
  );
}

// Display host (e.g. "bxd.gov.vn") from a URL for the reference link.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-zinc-200">{value}</span>
    </div>
  );
}
