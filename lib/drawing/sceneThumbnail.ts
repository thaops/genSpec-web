import type { DrawingScene } from "@/lib/types";

/**
 * Render scene bản vẽ ra thumbnail data-URI (PNG nền trong suốt, nét trắng mờ) để
 * hiện trên card home thay cho placeholder chữ cái. Chạy client (không cần raster
 * server). Fit toàn bản vẽ vào khung, lật trục Y (CAD Y-up → canvas Y-down).
 * Chỉ vẽ line/pline/arc/circle (bỏ text) cho gọn, nhận diện được mặt bằng.
 */
export function renderSceneThumbnail(
  scene: DrawingScene | null | undefined,
  width = 480,
  height = 300,
): string | null {
  if (typeof document === "undefined" || !scene?.entities?.length || !scene.bbox) return null;
  const { minX, minY, maxX, maxY } = scene.bbox;
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (!(bw > 0) || !(bh > 0)) return null;

  const pad = 0.08;
  const scale = Math.min((width * (1 - 2 * pad)) / bw, (height * (1 - 2 * pad)) / bh);
  if (!(scale > 0) || !isFinite(scale)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Căn giữa + lật Y.
  const ox = (width - bw * scale) / 2 - minX * scale;
  const oy = (height + bh * scale) / 2 + minY * scale;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy - y * scale;

  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  // Bản vẽ có thể rất lớn — cap để 1 lần gen không treo UI.
  const MAX = 20000;
  const ents = scene.entities.length > MAX ? scene.entities.slice(0, MAX) : scene.entities;
  for (const e of ents) {
    if (e.t === "line") {
      ctx.moveTo(X(e.p[0]), Y(e.p[1]));
      ctx.lineTo(X(e.p[2]), Y(e.p[3]));
    } else if (e.t === "pline") {
      const p = e.pts;
      if (p.length >= 4) {
        ctx.moveTo(X(p[0]), Y(p[1]));
        for (let i = 2; i + 1 < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
        if (e.closed) ctx.lineTo(X(p[0]), Y(p[1]));
      }
    } else if (e.t === "circle") {
      const r = e.r * scale;
      ctx.moveTo(X(e.cx) + r, Y(e.cy));
      ctx.arc(X(e.cx), Y(e.cy), r, 0, Math.PI * 2);
    } else if (e.t === "arc") {
      const r = e.r * scale;
      // Y lật → góc lật dấu; moveTo tới điểm đầu tránh nối nhầm từ nét trước.
      ctx.moveTo(X(e.cx) + Math.cos(e.a0) * r, Y(e.cy) - Math.sin(e.a0) * r);
      ctx.arc(X(e.cx), Y(e.cy), r, -e.a0, -e.a1, true);
    }
  }
  ctx.stroke();

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
