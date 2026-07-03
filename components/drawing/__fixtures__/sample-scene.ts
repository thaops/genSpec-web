import type { DrawingObject, DrawingScene, SceneEntity } from "@/lib/types";

// Small synthetic floor-plan-ish scene for eyeballing DrawingCanvas at
// /dev/canvas without a backend. Covers all 5 entity types, 3 layers.

function buildEntities(): SceneEntity[] {
  const ents: SceneEntity[] = [];

  // ── WALLS layer: outer rectangle + internal partition grid ────────────────
  ents.push({
    t: "pline",
    layer: "WALLS",
    color: "#a1a1aa",
    closed: true,
    pts: [0, 0, 12000, 0, 12000, 8000, 0, 8000],
  });
  // Partitions
  for (let i = 1; i <= 3; i++) {
    ents.push({ t: "line", layer: "WALLS", color: "#a1a1aa", p: [i * 3000, 0, i * 3000, 8000] });
  }
  ents.push({ t: "line", layer: "WALLS", color: "#a1a1aa", p: [0, 4000, 12000, 4000] });

  // Door arcs on partitions
  for (let i = 0; i < 4; i++) {
    ents.push({
      t: "arc", layer: "WALLS", color: "#fbbf24",
      cx: i * 3000 + 600, cy: 4000, r: 800, a0: 0, a1: 90,
    });
  }

  // ── COLUMNS layer: circles at grid intersections + hatch-ish plines ──────
  for (let gx = 0; gx <= 4; gx++) {
    for (let gy = 0; gy <= 2; gy++) {
      const cx = gx * 3000, cy = gy * 4000;
      ents.push({ t: "circle", layer: "COLUMNS", color: "#60a5fa", cx, cy, r: 200 });
      // small square around each column
      ents.push({
        t: "pline", layer: "COLUMNS", color: "#60a5fa", closed: true,
        pts: [cx - 250, cy - 250, cx + 250, cy - 250, cx + 250, cy + 250, cx - 250, cy + 250],
      });
    }
  }

  // ── ANNOT layer: dimension-like lines + text labels ───────────────────────
  for (let i = 0; i < 4; i++) {
    ents.push({ t: "line", layer: "ANNOT", color: null, p: [i * 3000, -600, (i + 1) * 3000, -600] });
    ents.push({
      t: "text", layer: "ANNOT", color: null,
      x: i * 3000 + 1200, y: -500, h: 250, rot: 0, s: "3000",
    });
  }
  ents.push({ t: "text", layer: "ANNOT", color: "#f472b6", x: 4500, y: 8400, h: 400, rot: 0, s: "MẶT BẰNG TẦNG 1" });
  ents.push({ t: "text", layer: "ANNOT", color: null, x: 12400, y: 4000, h: 250, rot: 90, s: "8000" });

  // Bulk: hatch-like diagonal lines to stress-test culling a bit (~400 lines)
  for (let i = 0; i < 200; i++) {
    const x = (i % 20) * 600;
    const y = Math.floor(i / 20) * 400;
    ents.push({ t: "line", layer: "ANNOT", color: "#3f3f46", p: [x, y, x + 300, y + 200] });
    ents.push({ t: "line", layer: "COLUMNS", color: "#1e3a5f", p: [x + 100, y, x + 100, y + 300] });
  }

  return ents;
}

const entities = buildEntities();

function countLayer(name: string): number {
  return entities.filter((e) => e.layer === name).length;
}

export const sampleScene: DrawingScene = {
  version: 1,
  units: "mm",
  bbox: { minX: 0, minY: -800, maxX: 12600, maxY: 8800 },
  layers: [
    { name: "WALLS",   color: "#a1a1aa", entityCount: countLayer("WALLS") },
    { name: "COLUMNS", color: "#60a5fa", entityCount: countLayer("COLUMNS") },
    { name: "ANNOT",   color: null,      entityCount: countLayer("ANNOT") },
  ],
  entities,
};

// Fake detection results to exercise object overlays / hit-test
export const sampleObjects: DrawingObject[] = [
  {
    id: "obj-col-1",
    stableId: "s-col-1",
    drawingId: "dev",
    type: "column",
    geometry: [[3000, 4000]],
    confidence: 0.92,
    layer: "COLUMNS",
    boundingBox: { x: 2750, y: 3750, w: 500, h: 500 },
    properties: {},
  },
  {
    id: "obj-wall-1",
    stableId: "s-wall-1",
    drawingId: "dev",
    type: "wall",
    geometry: [[0, 4000], [12000, 4000]],
    confidence: 0.85,
    layer: "WALLS",
    boundingBox: { x: 0, y: 3900, w: 12000, h: 200 },
    properties: {},
  },
];
