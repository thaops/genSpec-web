"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { DrawingIndexEntry, DrawingObject, DrawingLayer } from "@/lib/types";

interface DrawingSearchProps {
  objects: DrawingObject[];
  layers?: DrawingLayer[];
  indexEntries?: DrawingIndexEntry[];   // pre-built search index from parser
  onResults: (ids: string[]) => void;
  onNavigate: (obj: DrawingObject) => void;
  onNavigateToEntry?: (entry: DrawingIndexEntry) => void;
  onLayerToggle?: (layerName: string) => void;
  onClose: () => void;
}

const TYPE_ALIASES: Record<string, string[]> = {
  beam: ["dầm", "beam", "b"],
  column: ["cột", "column", "col", "c"],
  wall: ["tường", "wall", "w"],
  slab: ["sàn", "slab", "sl"],
  door: ["cửa", "door", "d"],
  window: ["cửa sổ", "window", "win"],
  stair: ["cầu thang", "stair", "st"],
  roof: ["mái", "roof", "r"],
  footing: ["móng", "footing", "f"],
  pile: ["cọc", "pile", "p"],
  dimension: ["dim", "dimension", "kích thước"],
  text: ["text", "chú thích", "ghi chú"],
  hatch: ["hatch", "ký hiệu"],
};

type ResultKind = "object" | "layer" | "text" | "dimension" | "block";

interface SearchResult {
  kind: ResultKind;
  id: string;
  label: string;
  sublabel?: string;
  page?: number;
  obj?: DrawingObject;
  entry?: DrawingIndexEntry;
  layer?: DrawingLayer;
}

function matchObject(obj: DrawingObject, q: string): boolean {
  if (obj.type.toLowerCase().includes(q)) return true;
  const aliases = TYPE_ALIASES[obj.type] ?? [];
  if (aliases.some((a) => a.includes(q) || q.includes(a))) return true;
  const propStr = Object.values(obj.properties).map(String).join(" ").toLowerCase();
  if (propStr.includes(q)) return true;
  if (obj.boqRef?.toLowerCase().includes(q)) return true;
  if (obj.layer.toLowerCase().includes(q)) return true;
  return false;
}

function buildResults(
  query: string,
  objects: DrawingObject[],
  layers: DrawingLayer[],
  indexEntries: DrawingIndexEntry[]
): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results: SearchResult[] = [];

  // Objects (structural + architectural)
  for (const obj of objects) {
    if (matchObject(obj, q)) {
      results.push({
        kind: "object",
        id: obj.id,
        label: obj.type,
        sublabel: `Layer: ${obj.layer}`,
        page: obj.boundingBox.page,
        obj,
      });
    }
  }

  // Layers
  for (const layer of layers) {
    if (layer.name.toLowerCase().includes(q)) {
      results.push({
        kind: "layer",
        id: `layer-${layer.id}`,
        label: layer.name,
        sublabel: `${layer.objectCount} objects`,
        layer,
      });
    }
  }

  // Index entries (text, dimension, block)
  for (const entry of indexEntries) {
    if (entry.value.toLowerCase().includes(q)) {
      results.push({
        kind: entry.kind as ResultKind,
        id: `entry-${entry.drawingId}-${entry.pageNumber}-${entry.kind}-${entry.value}`,
        label: entry.value,
        sublabel: `${entry.kind} • Trang ${entry.pageNumber}`,
        page: entry.pageNumber,
        entry,
      });
    }
  }

  return results.slice(0, 40);
}

const KIND_ICONS: Record<ResultKind, string> = {
  object: "◈",
  layer: "▤",
  text: "T",
  dimension: "↔",
  block: "⬦",
};

const KIND_COLORS: Record<ResultKind, string> = {
  object: "text-blue-400",
  layer: "text-zinc-400",
  text: "text-yellow-400",
  dimension: "text-cyan-400",
  block: "text-purple-400",
};

const KIND_LABELS: Record<ResultKind, string> = {
  object: "Object",
  layer: "Layer",
  text: "Text",
  dimension: "Dimension",
  block: "Block",
};

export function DrawingSearch({
  objects,
  layers = [],
  indexEntries = [],
  onResults,
  onNavigate,
  onNavigateToEntry,
  onLayerToggle,
  onClose,
}: DrawingSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      onResults([]);
      return;
    }
    const found = buildResults(query, objects, layers, indexEntries);
    setResults(found);
    onResults(found.filter((r) => r.obj).map((r) => r.obj!.id));
    setActiveIdx(0);
  }, [query, objects, layers, indexEntries]);

  function handleSelect(r: SearchResult) {
    if (r.obj) {
      onNavigate(r.obj);
    } else if (r.entry) {
      onNavigateToEntry?.(r.entry);
    } else if (r.layer) {
      onLayerToggle?.(r.layer.name);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { setActiveIdx((i) => Math.min(i + 1, results.length - 1)); e.preventDefault(); }
    if (e.key === "ArrowUp") { setActiveIdx((i) => Math.max(i - 1, 0)); e.preventDefault(); }
    if (e.key === "Enter" && results[activeIdx]) handleSelect(results[activeIdx]);
  }

  const grouped = results.reduce<Record<ResultKind, SearchResult[]>>((acc, r) => {
    (acc[r.kind] ??= []).push(r);
    return acc;
  }, {} as Record<ResultKind, SearchResult[]>);

  const groupOrder: ResultKind[] = ["object", "layer", "text", "dimension", "block"];

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        <Search className="h-4 w-4 text-zinc-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Object, layer, text, C12, dim..."
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-zinc-600 hover:text-zinc-400"><X className="h-3.5 w-3.5" /></button>
        )}
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-xs ml-1">ESC</button>
      </div>

      {/* Grouped results */}
      {results.length > 0 && (
        <div className="max-h-72 overflow-y-auto">
          <div className="px-3 py-1 text-[10px] text-zinc-600 border-b border-zinc-800/50">
            {results.length} kết quả
          </div>
          {groupOrder.map((kind) => {
            const group = grouped[kind];
            if (!group?.length) return null;
            return (
              <div key={kind}>
                <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-700 bg-zinc-950/40">
                  {KIND_LABELS[kind]}
                </div>
                {group.map((r, localIdx) => {
                  const globalIdx = results.indexOf(r);
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-zinc-800 transition-colors ${
                        globalIdx === activeIdx ? "bg-zinc-800" : ""
                      }`}
                    >
                      <span className={`text-xs font-mono shrink-0 mt-0.5 ${KIND_COLORS[r.kind]}`}>
                        {KIND_ICONS[r.kind]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-zinc-300 truncate">{r.label}</div>
                        {r.sublabel && (
                          <div className="text-[10px] text-zinc-600 truncate">{r.sublabel}</div>
                        )}
                      </div>
                      {r.page != null && (
                        <span className="text-[10px] text-zinc-700 shrink-0">p.{r.page}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {query && results.length === 0 && (
        <div className="px-3 py-4 text-xs text-zinc-600 text-center">
          Không tìm thấy kết quả
        </div>
      )}

      <div className="px-3 py-1.5 border-t border-zinc-800/50 flex items-center gap-3 text-[10px] text-zinc-700">
        <span>↑↓ điều hướng</span>
        <span>Enter chọn</span>
        <span>Esc đóng</span>
      </div>
    </div>
  );
}
