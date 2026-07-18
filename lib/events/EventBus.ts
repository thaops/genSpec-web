/**
 * Event Bus — decouples all UI modules.
 *
 * Flow:
 *   UI action → eventBus.emit(event) → all subscribers react independently
 *
 * No component calls another component directly.
 * Each module only knows about events, not about who else is listening.
 *
 * Usage:
 *   // Emit
 *   eventBus.emit({ type: "selection:changed", sheetId, range })
 *
 *   // Subscribe (in useEffect)
 *   const unsub = eventBus.on("selection:changed", (e) => { ... })
 *   return unsub
 */

import type {
  DrawingObject,
  DrawingRelationship,
  DrawingRevision,
  ReviewFinding,
  CopilotProposal,
  AgentActionType,
  AiContext,
} from "@/lib/types";

// ---------- Event map ----------

export interface BusEventMap {
  // Spreadsheet
  "selection:changed": {
    sheetId: string;
    range: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
  };
  "sheet:activated": { sheetId: string };
  "workbook:changed": { estimateId: string };

  // Drawing
  "drawing:activated": { drawingId: string };
  "drawing:uploaded": { drawingId: string; estimateId: string };
  "drawing:parsed": { drawingId: string; pageCount: number };
  "drawing:detected": { drawingId: string; objectCount: number };
  "object:selected": { object: DrawingObject | null };
  "object:hovered": { objectId: string | null };
  "object:highlighted": { objectIds: string[] };
  "viewport:changed": {
    drawingId: string;
    page: number;
    scale: number;
    scrollX: number;
    scrollY: number;
    activeTool: string;
    layer?: string;
    currentFloor?: string;
  };
  "layer:toggled": { drawingId: string; layerName: string; visible: boolean };
  "floor:changed": { floor: string };

  // Graph
  "graph:built": { drawingId: string; objectCount: number; relationshipCount: number };
  "relationship:discovered": { relationship: DrawingRelationship };

  // Revision
  "revision:uploaded": { drawingId: string; revision: DrawingRevision };
  "revision:compare:start": { drawingId: string; revisionIdA: string; revisionIdB: string };
  "revision:compare:done": { drawingId: string; addedCount: number; removedCount: number; changedCount: number };

  // AI Agent
  "agent:started": { action: AgentActionType; context: AiContext };
  "agent:done": { action: AgentActionType; proposalId?: string };
  "agent:failed": { action: AgentActionType; error: string };
  "proposal:ready": { proposal: CopilotProposal };
  "proposal:applied": { estimateId: string };
  "proposal:discarded": { estimateId: string };
  /** QS bấm "đo cột tròn" từ finding round-columns → bóc lại bản/vùng gần nhất + confirmRoundColumns. */
  "takeoff:confirm-round-columns": Record<string, never>;

  // Review
  "review:findings": { findings: ReviewFinding[] };
  "review:finding:selected": { findingId: string };

  // Jobs
  "job:started": { jobId: string; type: string };
  "job:progress": { jobId: string; progress: number; message?: string };
  "job:done": { jobId: string };
  "job:failed": { jobId: string; error: string };

  // Navigation
  "navigate:boq": { boqRef: string };
  "navigate:drawing:page": { drawingId: string; page: number };
  "navigate:drawing:object": { drawingId: string; objectId: string };

  // Context
  "context:updated": { context: AiContext };
}

export type BusEventType = keyof BusEventMap;
export type BusEvent<T extends BusEventType> = BusEventMap[T] & { type: T };

type AnyBusEvent = { [K in BusEventType]: BusEventMap[K] & { type: K } }[BusEventType];
type Listener<T extends BusEventType> = (event: BusEventMap[T] & { type: T }) => void;

// ---------- Implementation ----------

class EventBusClass {
  private listeners = new Map<BusEventType, Set<Listener<BusEventType>>>();

  emit<T extends BusEventType>(type: T, payload: BusEventMap[T]): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    const event = { ...payload, type } as AnyBusEvent;
    handlers.forEach((h) => {
      try {
        (h as Listener<T>)(event as BusEventMap[T] & { type: T });
      } catch (e) {
        console.error(`[EventBus] handler error for "${type}":`, e);
      }
    });
  }

  on<T extends BusEventType>(type: T, listener: Listener<T>): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener as Listener<BusEventType>);
    return () => { this.listeners.get(type)?.delete(listener as Listener<BusEventType>); };
  }

  once<T extends BusEventType>(type: T, listener: Listener<T>): void {
    const unsub = this.on(type, (e) => { unsub(); listener(e); });
  }

  /** Debug: log all events to console */
  debug(enabled = true) {
    if (!enabled) return;
    (Object.keys({} as BusEventMap) as BusEventType[]).forEach((type) => {
      this.on(type, (e) => console.debug(`[Bus] ${e.type}`, e));
    });
  }
}

export const eventBus = new EventBusClass();

// ---------- React hook ----------

import { useEffect } from "react";

export function useBusEvent<T extends BusEventType>(
  type: T,
  handler: Listener<T>,
  deps: unknown[] = []
): void {
  useEffect(() => {
    return eventBus.on(type, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
