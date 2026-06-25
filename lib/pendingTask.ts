// Structured task that navigates to a workspace and shows a Task Card in the Agent Console.
// Unlike pendingPrompt (immediate fire), pendingTask shows a pre-configured card
// that the user reviews and launches with [Run].

export type TaskType =
  | "review"
  | "price_update"
  | "code_lookup"
  | "boq_analysis"
  | "optimize"
  | "legal";

export interface PendingTask {
  estimateId: string;
  type: TaskType;
  params?: Record<string, string | string[]>;
}

let pending: PendingTask | null = null;

export function setPendingTask(t: PendingTask): void {
  pending = t;
}

export function takePendingTask(estimateId: string): PendingTask | null {
  if (pending && pending.estimateId === estimateId) {
    const t = pending;
    pending = null;
    return t;
  }
  return null;
}

export function clearPendingTask(): void {
  pending = null;
}
