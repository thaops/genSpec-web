// Module-level singleton store for the "first message" typed on the home page.
// Survives client-side navigation (home → editor) because it lives in memory.
// The editor reads it on mount, auto-sends to the copilot, then clears it.

export interface PendingPrompt {
  estimateId: string;
  message: string;
  files: File[];
}

let pending: PendingPrompt | null = null;

export function setPendingPrompt(p: PendingPrompt): void {
  pending = p;
}

// Returns the pending prompt for `estimateId` (if any) without clearing it.
export function peekPendingPrompt(estimateId: string): PendingPrompt | null {
  if (pending && pending.estimateId === estimateId) return pending;
  return null;
}

// Returns and clears the pending prompt for `estimateId` (one-shot).
export function takePendingPrompt(estimateId: string): PendingPrompt | null {
  if (pending && pending.estimateId === estimateId) {
    const p = pending;
    pending = null;
    return p;
  }
  return null;
}

export function clearPendingPrompt(): void {
  pending = null;
}
