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

import type { AgentActionPayload, DrawingObject } from "@/lib/types";
import type { AiContext } from "@/lib/types";

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

/** Parse action type from structured prompt (used by backend + tests) */
export function parseActionType(prompt: string): string | null {
  const match = prompt.match(/^\[ACTION:([^\]]+)\]/);
  return match ? match[1] : null;
}
