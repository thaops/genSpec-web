"use client";

import { useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { DrawingObject } from "@/lib/types";
import { Spinner } from "@/components/ui/Button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface HighlightRect {
  id: string;
  x: number; // 0-1 normalized
  y: number;
  w: number;
  h: number;
  color: string;
  label?: string;
}

interface PdfViewerProps {
  url: string;
  objectHighlights?: DrawingObject[];
  onObjectSelect?: (obj: DrawingObject) => void;
}

export function PdfViewer({ url, objectHighlights = [], onObjectSelect }: PdfViewerProps) {
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setTotalPages(numPages);
    setLoading(false);
  }

  function onPageLoadSuccess(page: { width: number; height: number }) {
    setPageWidth(page.width);
    setPageHeight(page.height);
  }

  // Convert DrawingObject bounding boxes to page-relative highlight rects
  const highlights: HighlightRect[] = objectHighlights
    .filter((o) => !o.boundingBox.page || o.boundingBox.page === currentPage)
    .map((o) => ({
      id: o.id,
      x: pageWidth > 0 ? o.boundingBox.x / pageWidth : 0,
      y: pageHeight > 0 ? o.boundingBox.y / pageHeight : 0,
      w: pageWidth > 0 ? o.boundingBox.w / pageWidth : 0,
      h: pageHeight > 0 ? o.boundingBox.h / pageHeight : 0,
      color: "#3b82f6",
      label: o.type,
    }));

  const renderedWidth = pageWidth * scale;
  const renderedHeight = pageHeight * scale;

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-950 text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-30"
          >
            ‹
          </button>
          <span>{currentPage} / {totalPages || "—"}</span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-30"
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} className="px-2 py-1 rounded hover:bg-zinc-800">−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(3, s + 0.2))} className="px-2 py-1 rounded hover:bg-zinc-800">+</button>
          <button onClick={() => setScale(1.2)} className="px-2 py-1 rounded hover:bg-zinc-800 ml-1">Reset</button>
        </div>
      </div>

      {/* PDF scroll area */}
      <div className="flex-1 overflow-auto flex justify-center p-4">
        <div className="relative" ref={pageRef}>
          {loading && (
            <div className="flex items-center justify-center h-48 text-zinc-500">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={null}
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              onLoadSuccess={onPageLoadSuccess}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>

          {/* Highlight overlay */}
          {renderedWidth > 0 && renderedHeight > 0 && highlights.map((h) => (
            <div
              key={h.id}
              onClick={() => {
                const obj = objectHighlights.find((o) => o.id === h.id);
                if (obj) onObjectSelect?.(obj);
              }}
              style={{
                position: "absolute",
                left: `${h.x * renderedWidth}px`,
                top: `${h.y * renderedHeight}px`,
                width: `${h.w * renderedWidth}px`,
                height: `${h.h * renderedHeight}px`,
                border: `2px solid ${h.color}`,
                background: `${h.color}22`,
                cursor: "pointer",
                borderRadius: 2,
                pointerEvents: "auto",
              }}
              title={h.label}
            >
              {h.label && (
                <span
                  style={{
                    position: "absolute",
                    top: -18,
                    left: 0,
                    background: h.color,
                    color: "#fff",
                    fontSize: 10,
                    padding: "1px 4px",
                    borderRadius: 2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h.label}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
