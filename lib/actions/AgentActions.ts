/**
 * Agent Action Dispatcher — standardized structured commands for AI.
 *
 * All AI requests go through here. No freeform prompt construction in UI.
 * Each action produces a structured string that the backend parses deterministically.
 *
 * Usage:
 *   const prompt = buildAction({ action: "generate_takeoff", obj, drawingId })
 *   copilotRef.current?.send(prompt, [])
 */

import type { AgentActionPayload, DrawingCalibration, DrawingObject } from "@/lib/types";
import type { AiContext } from "@/lib/types";
import type { ObjectGroupSummary } from "@/lib/drawing/objectMeasure";
import { formatMeasure } from "@/lib/drawing/objectMeasure";

/** Human-readable label for UI display */
export const ACTION_LABELS: Record<string, string> = {
  review_workbook: "Review Workbook",
  review_drawing: "Review Bản vẽ",
  generate_takeoff: "Generate Takeoff",
  generate_boq: "Generate BOQ",
  find_missing: "Tìm thiếu sót",
  compare_revision: "So sánh Revision",
  explain_code: "Giải thích mã hiệu",
  update_price: "Cập nhật giá",
  optimize_cost: "Tối ưu chi phí",
};

export const ACTION_ICONS: Record<string, string> = {
  review_workbook: "🔍",
  review_drawing: "📐",
  generate_takeoff: "📏",
  generate_boq: "📋",
  find_missing: "🔎",
  compare_revision: "⟺",
  explain_code: "💬",
  update_price: "💰",
  optimize_cost: "⚡",
};

// ---------- Prompt builders ----------

export function buildAction(payload: AgentActionPayload, ctx?: AiContext): string {
  const lines = [`[ACTION:${payload.action}]`];

  switch (payload.action) {
    case "generate_takeoff": {
      if (payload.drawingId) lines.push(`DrawingId: ${payload.drawingId}`);
      if (payload.objectId) lines.push(`ObjectId: ${payload.objectId}`);
      if (payload.pageNumber != null) lines.push(`Page: ${payload.pageNumber}`);
      if (payload.objectId) {
        lines.push(
          `Truy vết: cột/field Ghi chú của MỖI dòng khối lượng tạo ra PHẢI chứa token [obj:${payload.objectId}] (giữ nguyên dấu ngoặc vuông).`
        );
      }
      break;
    }
    case "review_workbook": {
      if (payload.sheetId) lines.push(`SheetId: ${payload.sheetId}`);
      if (payload.cellRef) lines.push(`CellRef: ${payload.cellRef}`);
      break;
    }
    case "review_drawing": {
      if (payload.drawingId) lines.push(`DrawingId: ${payload.drawingId}`);
      if (payload.pageNumber != null) lines.push(`Page: ${payload.pageNumber}`);
      break;
    }
    case "generate_boq": {
      if (payload.sheetId) lines.push(`SheetId: ${payload.sheetId}`);
      break;
    }
    case "find_missing": {
      if (payload.drawingId) lines.push(`DrawingId: ${payload.drawingId}`);
      if (payload.sheetId) lines.push(`SheetId: ${payload.sheetId}`);
      break;
    }
    case "compare_revision": {
      if (payload.revisionIdA) lines.push(`RevisionA: ${payload.revisionIdA}`);
      if (payload.revisionIdB) lines.push(`RevisionB: ${payload.revisionIdB}`);
      break;
    }
    case "explain_code": {
      if (payload.code) lines.push(`Code: ${payload.code}`);
      break;
    }
    case "update_price": {
      if (payload.code) lines.push(`Code: ${payload.code}`);
      break;
    }
    case "optimize_cost": {
      break;
    }
  }

  // Attach context snapshot for AI to use
  if (ctx) {
    if (ctx.currentFloor) lines.push(`Floor: ${ctx.currentFloor}`);
    if (ctx.layer) lines.push(`Layer: ${ctx.layer}`);
    if (ctx.scale) lines.push(`Scale: ${ctx.scale}`);
  }

  return lines.join("\n");
}

/** Shorthand for the most common action */
export function buildGenerateTakeoffAction(
  obj: DrawingObject,
  drawingId: string,
  ctx?: AiContext
): string {
  return buildAction(
    {
      action: "generate_takeoff",
      estimateId: "",
      drawingId,
      objectId: obj.id,
      pageNumber: obj.boundingBox.page,
    },
    ctx
  );
}

/**
 * Full-drawing takeoff — one-click "⚡ Bóc toàn bộ".
 * Builds a structured Vietnamese prompt with the aggregated object table so
 * the AI never has to guess measurements it wasn't given.
 */
export function buildFullTakeoffAction(
  objects: DrawingObject[],
  drawingId: string,
  calibration: DrawingCalibration | null,
  summary: ObjectGroupSummary[],
  // Sync with the engine's user-set assumptions so the LLM fallback never
  // silently computes with different constants than the deterministic path
  assumptions?: { floorHeight: number; wallThickness: number; beamDepth: number }
): string {
  const H = assumptions?.floorHeight ?? 3.3;
  const T = assumptions?.wallThickness ?? 0.2;
  const D = assumptions?.beamDepth ?? 0.4;
  const calLine = calibration
    ? `Tỉ lệ đã hiệu chỉnh: 1 đơn vị bản vẽ = ${calibration.unitsPerDrawingUnit} ${calibration.unitLabel} (số liệu bên dưới đã quy đổi ra ${calibration.unitLabel}).`
    : "CHƯA HIỆU CHỈNH TỈ LỆ — số liệu bên dưới theo ĐƠN VỊ BẢN VẼ, không phải mét. Ghi rõ điều này trong ghi chú.";
  const unit = calibration?.unitLabel ?? "đv";

  const table = summary.map((g) =>
    `| ${g.label} | [nhóm:${g.type}] | ${g.count} | ${formatMeasure(g.totalLength)} | ${formatMeasure(g.totalArea)} | ${g.layers.join(", ") || "—"} | ${Math.round(g.avgConfidence * 100)}% |`
  );

  return [
    `[ACTION:generate_takeoff]`,
    `DrawingId: ${drawingId}`,
    `Scope: full_drawing`,
    ``,
    `Bóc khối lượng TOÀN BỘ bản vẽ từ ${objects.length} đối tượng đã phát hiện (đã loại các đối tượng bị từ chối khi duyệt).`,
    calLine,
    ``,
    `Bảng nhóm đối tượng:`,
    `| Loại | Token | Số lượng | Tổng chiều dài (${unit}) | Tổng diện tích (${unit}²) | Layer | Độ tin cậy TB |`,
    `|---|---|---|---|---|---|---|`,
    ...table,
    ``,
    `Yêu cầu:`,
    `1. Tạo bảng bóc khối lượng đầy đủ vào sheet "Khối lượng" theo mẫu cột: STT, Mã hiệu định mức, Tên công tác, Đơn vị, Khối lượng, Ghi chú.`,
    `2. Mỗi dòng ghi rõ (cột Ghi chú) suy luận từ nhóm đối tượng nào trong bảng trên.`,
    `3. KHÔNG bịa kích thước không có trong dữ liệu. Nếu thiếu chiều cao tầng, dùng giả định ${H}m và GHI RÕ trong Ghi chú đây là giả định.`,
    `4. TRUY VẾT (BẮT BUỘC): cột Ghi chú của MỖI dòng phải chứa đúng token truy vết của nhóm nguồn (cột Token ở bảng trên, vd [nhóm:wall]). Giữ nguyên dấu ngoặc vuông và chữ thường, KHÔNG dịch token.`,
    `5. KHỐI LƯỢNG (BẮT BUỘC): cột Khối lượng của MỖI dòng phải là MỘT CON SỐ, không được để trống. Đơn vị phải khớp cách tính:`,
    `   - Tường/trát: diện tích (m²) = tổng chiều dài × cao ${H}m; nếu quy ra m³ thì nhân thêm chiều dày (giả định ${T}m, ghi rõ).`,
    `   - Cột/dầm: m³ = tổng diện tích mặt cắt × cao ${H}m (cột) hoặc diện tích chiếm chỗ × chiều sâu giả định ${D}m (dầm) — ghi rõ công thức trong Ghi chú.`,
    `   - Cửa: m² theo tổng diện tích đối tượng. TUYỆT ĐỐI không ghi đơn vị m3 cho một con số vốn là diện tích.`,
    `6. DÒNG ĐẦU message (BẮT BUỘC): "⚠ BẢN NHÁP AI — số liệu do AI tính từ bảng tổng hợp, cần đối chiếu trước khi dùng."`,
  ].join("\n");
}

/** Parse action type from structured prompt (used by backend + tests) */
export function parseActionType(prompt: string): string | null {
  const match = prompt.match(/^\[ACTION:([^\]]+)\]/);
  return match ? match[1] : null;
}
