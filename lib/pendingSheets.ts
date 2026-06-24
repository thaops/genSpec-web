import type { Sheet } from "./types";

interface PendingSheets {
  estimateId: string;
  sheets: Sheet[];
  file: File; // kept for background server sync
}

let pending: PendingSheets | null = null;

export function setPendingSheets(p: PendingSheets): void {
  pending = p;
}

export function takePendingSheets(estimateId: string): PendingSheets | null {
  if (pending?.estimateId === estimateId) {
    const p = pending;
    pending = null;
    return p;
  }
  return null;
}
