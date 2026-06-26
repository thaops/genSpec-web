/**
 * Context Engine — single source of truth for what the user is looking at.
 *
 * Architecture:
 *   UI events (selection, scroll, hover) → ContextEngine.update()
 *   ContextEngine notifies subscribers → AgentConsole / API calls read context
 *
 * Decouples UI from Agent: UI never calls Agent directly.
 * Agent always reads context from here, not from props.
 */

import type { AiContext, DrawingObject } from "@/lib/types";
import { eventBus } from "@/lib/events/EventBus";

export interface DrawingViewportInfo {
  drawingId: string;
  page: number;
  scale: number;
  scrollX: number;
  scrollY: number;
  activeTool: string;
  selectedObjectId?: string;
  selectedObjectType?: string;
  hoveredObjectId?: string;
  layer?: string;
  currentFloor?: string;
}

type ContextListener = (ctx: AiContext) => void;

class ContextEngineClass {
  private ctx: AiContext = { workspaceId: "" };
  private listeners = new Set<ContextListener>();

  /** Called once on workspace mount */
  init(workspaceId: string) {
    this.ctx = { workspaceId, capturedAt: new Date().toISOString() };
    this.notify();
  }

  /** Spreadsheet: active sheet + selection changed */
  onSheetChange(sheetId: string) {
    this.patch({ sheetId, capturedAt: new Date().toISOString() });
  }

  onSelectionChange(selection: AiContext["selection"]) {
    this.patch({ selection, capturedAt: new Date().toISOString() });
  }

  /** Drawing: viewport scrolled / zoomed / tool changed */
  onViewportChange(info: DrawingViewportInfo) {
    this.patch({
      drawingId: info.drawingId,
      objectId: info.selectedObjectId,
      hoveredObjectId: info.hoveredObjectId,
      currentPage: info.page,
      scale: info.scale,
      activeTool: info.activeTool,
      layer: info.layer,
      currentFloor: info.currentFloor,
      capturedAt: new Date().toISOString(),
    });
  }

  /** Drawing: user selected an object */
  onObjectSelect(obj: DrawingObject | null) {
    this.patch({
      objectId: obj?.id,
      capturedAt: new Date().toISOString(),
    });
  }

  /** Drawing: user hovered an object */
  onObjectHover(objectId: string | null) {
    this.patch({ hoveredObjectId: objectId ?? undefined });
  }

  /** Mouse position (throttled by caller) */
  onMouseMove(x: number, y: number) {
    this.patch({ mousePosition: { x, y } });
  }

  /** Floor changed (multi-storey navigation) */
  onFloorChange(floor: string) {
    this.patch({ currentFloor: floor, capturedAt: new Date().toISOString() });
  }

  /** Revision changed */
  onRevisionChange(revisionId: string | undefined) {
    this.patch({ revisionId, capturedAt: new Date().toISOString() });
  }

  /** Read current context snapshot */
  getContext(): Readonly<AiContext> {
    return this.ctx;
  }

  /** Build FormData fields for copilotStream */
  toFormFields(): Record<string, string> {
    const ctx = this.ctx;
    const fields: Record<string, string> = {};
    if (ctx.sheetId) fields.activeSheetId = ctx.sheetId;
    if (ctx.selection) fields.selectedRange = JSON.stringify(ctx.selection);
    if (ctx.drawingId) fields.drawingId = ctx.drawingId;
    if (ctx.objectId) fields.objectId = ctx.objectId;
    fields.drawingContext = JSON.stringify({
      page: ctx.currentPage,
      scale: ctx.scale,
      activeTool: ctx.activeTool,
      layer: ctx.layer,
      currentFloor: ctx.currentFloor,
      hoveredObjectId: ctx.hoveredObjectId,
    });
    return fields;
  }

  subscribe(listener: ContextListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private patch(partial: Partial<AiContext>) {
    this.ctx = { ...this.ctx, ...partial };
    this.notify();
  }

  private notify() {
    this.listeners.forEach((l) => l(this.ctx));
    // Also broadcast on the Event Bus so any module can react
    eventBus.emit("context:updated", { context: this.ctx });
  }
}

// Module-level singleton — one context per browser tab
export const contextEngine = new ContextEngineClass();
