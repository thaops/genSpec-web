"use client";

import { useState } from "react";
import { Document, Thumbnail } from "react-pdf";
import { Spinner } from "@/components/ui/Button";

interface ThumbnailNavigatorProps {
  url: string;
  currentPage: number;
  totalPages: number;
  onPageSelect: (page: number) => void;
}

export function ThumbnailNavigator({ url, currentPage, totalPages, onPageSelect }: ThumbnailNavigatorProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="w-28 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden">
      <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 shrink-0">
        Pages ({totalPages})
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
        <Document
          file={url}
          onLoadSuccess={() => setLoaded(true)}
          loading={
            <div className="flex items-center justify-center py-6">
              <Spinner className="h-4 w-4 text-zinc-600" />
            </div>
          }
        >
          {loaded && Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => onPageSelect(pageNum)}
              className={`w-full rounded overflow-hidden border-2 transition-colors block ${
                currentPage === pageNum
                  ? "border-blue-500"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <Thumbnail
                pageNumber={pageNum}
                width={88}
                loading={
                  <div className="h-20 bg-zinc-900 flex items-center justify-center">
                    <Spinner className="h-3 w-3 text-zinc-700" />
                  </div>
                }
              />
              <div className={`text-center py-0.5 text-[10px] ${
                currentPage === pageNum ? "text-blue-400 bg-blue-950/30" : "text-zinc-600 bg-zinc-900"
              }`}>
                {pageNum}
              </div>
            </button>
          ))}
        </Document>
      </div>
    </div>
  );
}
