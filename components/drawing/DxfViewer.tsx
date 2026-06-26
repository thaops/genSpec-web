"use client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyViewer = any;

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Button";

interface LayerState {
  name: string;
  displayName: string;
  visible: boolean;
}

interface DxfViewerProps {
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  highlightObjectIds?: string[];
}

export function DxfViewer({ url }: DxfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<AnyViewer>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerState[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    let alive = true;

    async function init() {
      try {
        // Dynamic import to avoid SSR issues with WebGL
        const mod = await import("dxf-viewer");
        const Viewer = mod.DxfViewer;
        if (!alive || !containerRef.current) return;

        const viewer = new Viewer(containerRef.current, {
          autoResize: true,
          colorCorrection: true,
          blackWhiteInversion: false,
          pointSize: 2,
        });
        viewerRef.current = viewer;

        await viewer.Load({
          url,
          fonts: [],
          progressCbk: null,
          workerFactory: null,
        });

        if (!alive) return;

        const rawLayers: Iterable<{ name: string; displayName: string }> = viewer.GetLayers();
        const layerList: LayerState[] = Array.from(rawLayers).map((info) => ({
          name: info.name,
          displayName: info.displayName || info.name,
          visible: true,
        }));
        setLayers(layerList);
        setLoading(false);
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      alive = false;
      viewerRef.current?.Destroy?.();
      viewerRef.current = null;
    };
  }, [url]);

  function toggleLayer(name: string) {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.name !== name) return l;
        const next = { ...l, visible: !l.visible };
        viewerRef.current?.ShowLayer(name, next.visible);
        return next;
      })
    );
  }

  function fitView() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const bounds = viewer.GetBounds();
    if (bounds) {
      viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 10);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
        <span className="text-2xl">⚠️</span>
        <p className="text-sm">Không thể tải file DXF</p>
        <p className="text-xs text-zinc-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-950 text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 font-mono">DXF</span>
          {!loading && layers.length > 0 && (
            <span className="text-zinc-600">{layers.length} layers</span>
          )}
        </div>
        <button onClick={fitView} className="px-2 py-1 rounded hover:bg-zinc-800">
          Fit View
        </button>
      </div>

      {/* Canvas + Layer panel */}
      <div className="flex flex-1 min-h-0">
        <div ref={containerRef} className="flex-1 min-h-0" />

        {layers.length > 0 && (
          <div className="w-40 border-l border-zinc-800 bg-zinc-950 overflow-y-auto shrink-0">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
              Layers
            </div>
            {layers.map((layer) => (
              <label
                key={layer.name}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-900 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => toggleLayer(layer.name)}
                  className="rounded accent-blue-500"
                />
                <span className="text-xs text-zinc-400 truncate">{layer.displayName}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
          <div className="flex flex-col items-center gap-3">
            <Spinner className="h-6 w-6" />
            <span className="text-xs text-zinc-400">Đang tải bản vẽ DXF...</span>
          </div>
        </div>
      )}
    </div>
  );
}
