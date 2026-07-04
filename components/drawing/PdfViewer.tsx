"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { DrawingObject } from "@/lib/types";
import type { DrawingTool } from "./DrawingToolbar";
import { ThumbnailNavigator } from "./ThumbnailNavigator";
import { Minimap } from "./Minimap";
import { DrawingSearch } from "./DrawingSearch";
import { Spinner } from "@/components/ui/Button";
import { Search } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const OBJECT_COLORS: Record<string, string> = {
  beam: "#f97316", column: "#3b82f6", wall: "#71717a",
  slab: "#22c55e", door: "#eab308", window: "#06b6d4",
  stair: "#a855f7", roof: "#ef4444", unknown: "#6b7280",
};

interface PdfViewerProps {
  url: string;
  activeTool?: DrawingTool;
  objectHighlights?: DrawingObject[];
  highlightObjectIds?: string[]; // from search
  onObjectSelect?: (obj: DrawingObject) => void;
  onViewportChange?: (info: { page: number; scale: number; scrollX: number; scrollY: number }) => void;
}

export function PdfViewer({
  url,
  activeTool = "pointer",
  objectHighlights = [],
  highlightObjectIds,
  onObjectSelect,
  onViewportChange,
}: PdfViewerProps) {
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchHighlightIds, setSearchHighlightIds] = useState<string[]>([]);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const effectiveHighlightIds = highlightObjectIds ?? searchHighlightIds;

  // Track scroll for minimap
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setScroll({ left: el.scrollLeft, top: el.scrollTop });
  }

  // Track container size for minimap
  useEffect(() => {
    if (!scrollRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(scrollRef.current);
    return () => obs.disconnect();
  }, []);

  // Notify parent about viewport changes
  useEffect(() => {
    onViewportChange?.({ page: currentPage, scale, scrollX: scroll.left, scrollY: scroll.top });
  }, [currentPage, scale, scroll.left, scroll.top]);

  // Keyboard shortcut for search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Open search when tool = search
  useEffect(() => {
    if (activeTool === "search") setShowSearch(true);
  }, [activeTool]);

  const renderedWidth = pageWidth * scale;
  const renderedHeight = pageHeight * scale;

  // Determine cursor
  const cursorMap: Record<DrawingTool, string> = {
    pointer: "default", pan: "grab", zoom: "zoom-in",
    measure: "crosshair", count: "crosshair", area: "crosshair", scope: "crosshair",
    search: "default", layer: "default", compare: "default", ai: "default",
  };

  function navigateToObject(obj: DrawingObject) {
    const page = obj.boundingBox.page ?? currentPage;
    setCurrentPage(page);
    setShowSearch(false);
    onObjectSelect?.(obj);
    // Scroll to object
    if (scrollRef.current && pageWidth > 0) {
      const x = obj.boundingBox.x * scale - 100;
      const y = obj.boundingBox.y * scale - 100;
      scrollRef.current.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior: "smooth" });
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Thumbnail navigator */}
      {showThumbnails && totalPages > 1 && (
        <ThumbnailNavigator
          url={url}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageSelect={(p) => { setCurrentPage(p); }}
        />
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-950 text-xs text-zinc-400 shrink-0">
          {/* Page nav */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowThumbnails(!showThumbnails)}
              title="Page thumbnails"
              className={`px-1.5 py-1 rounded transition-colors ${showThumbnails ? "bg-blue-600 text-white" : "hover:bg-zinc-800"}`}
            >
              ▦
            </button>
            <div className="w-px h-4 bg-zinc-800" />
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-1.5 py-1 rounded hover:bg-zinc-800 disabled:opacity-30"
            >‹</button>
            <span className="tabular-nums">{currentPage} / {totalPages || "—"}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-1.5 py-1 rounded hover:bg-zinc-800 disabled:opacity-30"
            >›</button>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1">
            <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} className="px-1.5 py-1 rounded hover:bg-zinc-800">−</button>
            <button onClick={() => setScale(1.2)} className="px-2 py-1 rounded hover:bg-zinc-800 font-mono text-[11px]">
              {Math.round(scale * 100)}%
            </button>
            <button onClick={() => setScale((s) => Math.min(4, s + 0.2))} className="px-1.5 py-1 rounded hover:bg-zinc-800">+</button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`px-1.5 py-1 rounded transition-colors ${showSearch ? "bg-zinc-700 text-zinc-200" : "hover:bg-zinc-800"}`}
              title="Tìm kiếm (Ctrl+F)"
            >
              <Search className="h-4 w-4" />
            </button>
            {objectHighlights.length > 0 && (
              <span className="text-zinc-600 text-[10px] ml-1">{objectHighlights.length} objects</span>
            )}
          </div>
        </div>

        {/* PDF scroll area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto flex justify-center p-4 relative"
          onScroll={handleScroll}
          style={{ cursor: cursorMap[activeTool] }}
        >
          {/* Search panel */}
          {showSearch && (
            <DrawingSearch
              objects={objectHighlights}
              onResults={setSearchHighlightIds}
              onNavigate={navigateToObject}
              onClose={() => { setShowSearch(false); setSearchHighlightIds([]); }}
            />
          )}

          {/* Page container */}
          <div className="relative">
            <Document
              file={url}
              onLoadSuccess={({ numPages }) => setTotalPages(numPages)}
              loading={
                <div className="flex items-center justify-center h-48 text-zinc-500">
                  <Spinner className="h-6 w-6" />
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                scale={scale}
                onLoadSuccess={(p) => { setPageWidth(p.width); setPageHeight(p.height); }}
                renderTextLayer
                renderAnnotationLayer
              />
            </Document>

            {/* Object highlight overlay */}
            {renderedWidth > 0 && objectHighlights.map((obj) => {
              if (obj.boundingBox.page && obj.boundingBox.page !== currentPage) return null;
              const x = obj.boundingBox.x * scale;
              const y = obj.boundingBox.y * scale;
              const w = obj.boundingBox.w * scale;
              const h = obj.boundingBox.h * scale;
              const color = OBJECT_COLORS[obj.type] ?? "#6b7280";
              const isSearchMatch = effectiveHighlightIds.length > 0 && effectiveHighlightIds.includes(obj.id);
              const isSelected = false; // TODO: track selected id

              return (
                <div
                  key={obj.id}
                  onClick={() => onObjectSelect?.(obj)}
                  style={{
                    position: "absolute",
                    left: x, top: y, width: w, height: h,
                    border: `2px solid ${color}`,
                    background: isSearchMatch ? `${color}44` : `${color}18`,
                    cursor: "pointer",
                    borderRadius: 2,
                    boxShadow: isSearchMatch ? `0 0 0 2px ${color}` : undefined,
                    transition: "background 0.15s",
                  }}
                  title={`${obj.type} (${Math.round(obj.confidence * 100)}%)`}
                >
                  {(w > 30 || isSearchMatch) && (
                    <span style={{
                      position: "absolute", top: -16, left: 0,
                      background: color, color: "#fff",
                      fontSize: 9, padding: "1px 3px", borderRadius: 2,
                      whiteSpace: "nowrap", pointerEvents: "none",
                    }}>
                      {obj.type}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Minimap */}
          {renderedWidth > 0 && renderedHeight > 0 && (
            <Minimap
              contentWidth={renderedWidth}
              contentHeight={renderedHeight}
              scrollLeft={scroll.left}
              scrollTop={scroll.top}
              viewportWidth={containerSize.w}
              viewportHeight={containerSize.h}
              highlights={objectHighlights.map((o) => ({
                x: o.boundingBox.x / pageWidth,
                y: o.boundingBox.y / pageHeight,
                w: o.boundingBox.w / pageWidth,
                h: o.boundingBox.h / pageHeight,
                color: OBJECT_COLORS[o.type] ?? "#6b7280",
              }))}
              onViewportClick={(left, top) => {
                scrollRef.current?.scrollTo({ left, top, behavior: "smooth" });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
