"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SplitLayout = "spreadsheet-drawing" | "drawing-spreadsheet" | "equal";

interface SplitViewProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRatio?: number; // 0-1, left panel ratio
  minRatio?: number;
  maxRatio?: number;
  storageKey?: string;
}

export function SplitView({
  left,
  right,
  defaultRatio = 0.5,
  minRatio = 0.2,
  maxRatio = 0.8,
  storageKey = "genspec-split-ratio",
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey);
      if (stored) return parseFloat(stored);
    }
    return defaultRatio;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startRatio = useRef(ratio);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startRatio.current = ratio;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [ratio]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const delta = e.clientX - startX.current;
      const newRatio = Math.max(minRatio, Math.min(maxRatio, startRatio.current + delta / containerWidth));
      setRatio(newRatio);
    }

    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(storageKey, String(ratio));
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [ratio, minRatio, maxRatio, storageKey]);

  const leftPct = `${Math.round(ratio * 100)}%`;
  const rightPct = `${Math.round((1 - ratio) * 100)}%`;

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden select-none">
      {/* Left pane */}
      <div style={{ width: leftPct }} className="min-w-0 overflow-hidden flex flex-col">
        {left}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-1 shrink-0 bg-zinc-800 hover:bg-blue-500 transition-colors cursor-col-resize group relative"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-blue-500/10" />
        {/* Drag dots */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {[0,1,2].map((i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-blue-400" />
          ))}
        </div>
      </div>

      {/* Right pane */}
      <div style={{ width: rightPct }} className="min-w-0 overflow-hidden flex flex-col">
        {right}
      </div>
    </div>
  );
}
