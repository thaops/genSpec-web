"use client";

import { useEffect, useRef } from "react";

interface MinimapProps {
  // Full content dimensions
  contentWidth: number;
  contentHeight: number;
  // Visible viewport (scroll position + container size)
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  // Optional: highlight boxes (normalized 0-1)
  highlights?: Array<{ x: number; y: number; w: number; h: number; color: string }>;
  onViewportClick?: (scrollLeft: number, scrollTop: number) => void;
}

const MINIMAP_W = 120;
const MINIMAP_H = 80;

export function Minimap({
  contentWidth,
  contentHeight,
  scrollLeft,
  scrollTop,
  viewportWidth,
  viewportHeight,
  highlights = [],
  onViewportClick,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || contentWidth === 0 || contentHeight === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleX = MINIMAP_W / contentWidth;
    const scaleY = MINIMAP_H / contentHeight;

    // Background
    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
    ctx.fillStyle = "#1c1c1f";
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

    // Draw highlight boxes
    for (const h of highlights) {
      ctx.fillStyle = `${h.color}44`;
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 0.5;
      ctx.fillRect(h.x * contentWidth * scaleX, h.y * contentHeight * scaleY, h.w * contentWidth * scaleX, h.h * contentHeight * scaleY);
      ctx.strokeRect(h.x * contentWidth * scaleX, h.y * contentHeight * scaleY, h.w * contentWidth * scaleX, h.h * contentHeight * scaleY);
    }

    // Viewport rectangle
    const vpX = scrollLeft * scaleX;
    const vpY = scrollTop * scaleY;
    const vpW = viewportWidth * scaleX;
    const vpH = viewportHeight * scaleY;

    // Darken outside viewport
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, MINIMAP_W, vpY); // top
    ctx.fillRect(0, vpY + vpH, MINIMAP_W, MINIMAP_H - vpY - vpH); // bottom
    ctx.fillRect(0, vpY, vpX, vpH); // left
    ctx.fillRect(vpX + vpW, vpY, MINIMAP_W - vpX - vpW, vpH); // right

    // Viewport border
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }, [contentWidth, contentHeight, scrollLeft, scrollTop, viewportWidth, viewportHeight, highlights]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onViewportClick || contentWidth === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const scaleX = contentWidth / MINIMAP_W;
    const scaleY = contentHeight / MINIMAP_H;
    onViewportClick(cx * scaleX - viewportWidth / 2, cy * scaleY - viewportHeight / 2);
  }

  return (
    <div
      className="absolute bottom-3 right-3 z-20 rounded border border-zinc-700/60 overflow-hidden shadow-xl"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      title="Minimap — Click để điều hướng"
    >
      <canvas
        ref={canvasRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        onClick={handleClick}
        className="cursor-crosshair block"
      />
      <div className="absolute bottom-0.5 right-1 text-[8px] text-zinc-600 pointer-events-none">
        MAP
      </div>
    </div>
  );
}
