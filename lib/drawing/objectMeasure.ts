/**
 * Pure measurement helpers for detected drawing objects.
 *
 * All values are computed from geometry (preferred) or boundingBox (fallback)
 * and scaled by calibration.unitsPerDrawingUnit when available (→ meters).
 * Without calibration, values remain in raw drawing units.
 */

import type { DrawingCalibration, DrawingObject, DrawingObjectType } from "@/lib/types";

export const OBJECT_TYPE_LABELS: Record<string, string> = {
  beam: "Dầm", column: "Cột", wall: "Tường", slab: "Sàn",
  door: "Cửa", window: "Cửa sổ", stair: "Cầu thang", roof: "Mái",
  footing: "Móng", pile: "Cọc", opening: "Lỗ mở", ramp: "Dốc",
  elevator: "Thang máy", axis: "Trục",
  dimension: "Dimension", leader: "Leader", block: "Block",
  polyline: "Polyline", hatch: "Hatch", text: "Text",
  symbol: "Symbol", viewport: "Viewport", unknown: "Không xác định",
};

export interface ObjectMeasurement {
  /** Length in meters (calibrated) or drawing units (uncalibrated) */
  length: number;
  /** Area in m² (calibrated) or drawing units² */
  area: number;
  /** true when a calibration factor was applied (unit = m) */
  calibrated: boolean;
}

export interface ObjectGroupSummary {
  type: DrawingObjectType;
  label: string;
  count: number;
  totalLength: number;
  totalArea: number;
  layers: string[];
  avgConfidence: number; // 0..1
}

function polylineLength(geometry: number[][]): number {
  let len = 0;
  for (let i = 1; i < geometry.length; i++) {
    len += Math.hypot(geometry[i][0] - geometry[i - 1][0], geometry[i][1] - geometry[i - 1][1]);
  }
  return len;
}

function shoelaceArea(geometry: number[][]): number {
  let a = 0;
  for (let i = 0, j = geometry.length - 1; i < geometry.length; j = i++) {
    a += (geometry[j][0] + geometry[i][0]) * (geometry[j][1] - geometry[i][1]);
  }
  return Math.abs(a) / 2;
}

/**
 * Measure one object: length from polyline geometry when available,
 * otherwise the long side of the bounding box; area from closed geometry
 * (shoelace) when available, otherwise bbox area.
 */
export function measureObject(obj: DrawingObject, cal: DrawingCalibration | null): ObjectMeasurement {
  const factor = cal?.unitsPerDrawingUnit ?? 1;
  const geo = obj.geometry ?? [];
  const { w, h } = obj.boundingBox;

  const rawLength = geo.length >= 2 ? polylineLength(geo) : Math.max(w, h);
  const rawArea = geo.length >= 3 ? shoelaceArea(geo) : w * h;

  return {
    length: rawLength * factor,
    area: rawArea * factor * factor,
    calibrated: cal != null,
  };
}

/** Group objects by type and aggregate measurements. Sorted by count desc. */
export function summarizeObjects(
  objects: DrawingObject[],
  cal: DrawingCalibration | null
): ObjectGroupSummary[] {
  const groups = new Map<DrawingObjectType, ObjectGroupSummary & { _layers: Set<string>; _conf: number }>();
  for (const obj of objects) {
    let g = groups.get(obj.type);
    if (!g) {
      g = {
        type: obj.type,
        label: OBJECT_TYPE_LABELS[obj.type] ?? obj.type,
        count: 0, totalLength: 0, totalArea: 0,
        layers: [], avgConfidence: 0,
        _layers: new Set<string>(), _conf: 0,
      };
      groups.set(obj.type, g);
    }
    const m = measureObject(obj, cal);
    g.count += 1;
    g.totalLength += m.length;
    g.totalArea += m.area;
    g._conf += obj.confidence;
    if (obj.layer) g._layers.add(obj.layer);
  }
  return [...groups.values()]
    .map(({ _layers, _conf, ...g }) => ({
      ...g,
      layers: [..._layers],
      avgConfidence: g.count > 0 ? _conf / g.count : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Compact Vietnamese number formatting for measurement display */
export function formatMeasure(v: number): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("vi-VN", { maximumFractionDigits: v >= 100 ? 0 : 2 });
}
