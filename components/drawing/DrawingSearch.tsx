"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawingObject } from "@/lib/types";

interface DrawingSearchProps {
  objects: DrawingObject[];
  onResults: (ids: string[]) => void;
  onNavigate: (obj: DrawingObject) => void;
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
};

function matchObject(obj: DrawingObject, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;

  // Match by type
  if (obj.type.toLowerCase().includes(q)) return true;

  // Match by aliases
  const aliases = TYPE_ALIASES[obj.type] ?? [];
  if (aliases.some((a) => a.includes(q) || q.includes(a))) return true;

  // Match by properties
  const propStr = Object.values(obj.properties)
    .map(String)
    .join(" ")
    .toLowerCase();
  if (propStr.includes(q)) return true;

  // Match by boqRef
  if (obj.boqRef?.toLowerCase().includes(q)) return true;

  return false;
}

export function DrawingSearch({ objects, onResults, onNavigate, onClose }: DrawingSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DrawingObject[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      onResults([]);
      return;
    }
    const found = objects.filter((o) => matchObject(o, query));
    setResults(found);
    onResults(found.map((o) => o.id));
    setActiveIdx(0);
  }, [query, objects]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { setActiveIdx((i) => Math.min(i + 1, results.length - 1)); e.preventDefault(); }
    if (e.key === "ArrowUp") { setActiveIdx((i) => Math.max(i - 1, 0)); e.preventDefault(); }
    if (e.key === "Enter" && results[activeIdx]) { onNavigate(results[activeIdx]); }
  }

  const TYPE_COLORS: Record<string, string> = {
    beam: "text-orange-400", column: "text-blue-400", wall: "text-zinc-400",
    slab: "text-green-400", door: "text-yellow-400", window: "text-cyan-400",
    stair: "text-purple-400", roof: "text-red-400", unknown: "text-zinc-500",
  };

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        <span className="text-zinc-500 text-sm">🔎</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tìm đối tượng (beam, cột, C12...)"
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
        )}
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-xs ml-1">ESC</button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="max-h-60 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] text-zinc-600 border-b border-zinc-800/50">
            {results.length} kết quả
          </div>
          {results.map((obj, idx) => (
            <button
              key={obj.id}
              onClick={() => onNavigate(obj)}
              className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-zinc-800 transition-colors ${
                idx === activeIdx ? "bg-zinc-800" : ""
              }`}
            >
              <span className={`text-xs font-medium shrink-0 mt-0.5 ${TYPE_COLORS[obj.type] ?? "text-zinc-400"}`}>
                {obj.type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-zinc-300 truncate">
                  {obj.boqRef ? `Ref: ${obj.boqRef}` : `Layer: ${obj.layer}`}
                </div>
                {Object.entries(obj.properties).slice(0, 2).map(([k, v]) => (
                  <div key={k} className="text-[10px] text-zinc-600">{k}: {v}</div>
                ))}
              </div>
              <span className="text-[10px] text-zinc-700 shrink-0">{Math.round(obj.confidence * 100)}%</span>
            </button>
          ))}
        </div>
      )}

      {query && results.length === 0 && (
        <div className="px-3 py-4 text-xs text-zinc-600 text-center">
          Không tìm thấy đối tượng nào
        </div>
      )}

      {/* Hints */}
      <div className="px-3 py-1.5 border-t border-zinc-800/50 flex items-center gap-3 text-[10px] text-zinc-700">
        <span>↑↓ điều hướng</span>
        <span>Enter chọn</span>
        <span>Esc đóng</span>
      </div>
    </div>
  );
}
