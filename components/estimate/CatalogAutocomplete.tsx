"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogItem } from "@/lib/types";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n/I18nProvider";
import { formatNum } from "@/lib/utils";

interface Props {
  onPick: (item: CatalogItem) => void;
  disabled?: boolean;
}

export function CatalogAutocomplete({ onPick, disabled }: Props) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced catalog search.
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      api
        .catalog(term)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(item: CatalogItem) {
    onPick(item);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("sheet.searchCatalog")}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent-500/50 focus:outline-none disabled:opacity-50"
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full min-w-[420px] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {results.map((item) => (
            <button
              key={item.code}
              onClick={() => pick(item)}
              className="flex w-full items-center gap-3 border-b border-zinc-800 px-3 py-2 text-left last:border-0 hover:bg-zinc-800/70"
            >
              <span className="w-24 shrink-0 font-mono text-xs text-accent-300">
                {item.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                {item.name}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">
                {item.unit}
              </span>
              <span className="w-24 shrink-0 text-right font-mono text-xs text-zinc-400">
                {formatNum(item.material + item.labor + item.machine)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
