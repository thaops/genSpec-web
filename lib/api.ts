import { getToken } from "./auth";
import type {
  AuthResponse,
  User,
  Estimate,
  EstimateListItem,
  CatalogItem,
  CopilotStep,
  CopilotProposal,
  ConversationMessage,
  InsightItem,
  OfficialFeedItem,
  Action,
  ApplyActionsResponse,
  ApiErrorBody,
  Drawing,
  DrawingObject,
  RevisionDiff,
  WorkspacePreference,
  AppNotification,
  BackgroundJob,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://genspec-api-production-9f98.up.railway.app";

export class ApiError extends Error {
  statusCode: number;
  body?: ApiErrorBody;
  constructor(message: string, statusCode: number, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // when set, body is sent as-is (e.g. FormData) without JSON headers
  form?: FormData;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, auth = true } = opts;
  const headers: Record<string, string> = {};

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: payload,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Network error — is the backend running?", 0);
  }

  if (res.status === 401 && auth) {
    if (typeof window !== "undefined") {
      const { logout } = await import("./auth");
      logout();
    }
  }

  if (!res.ok) {
    let parsed: ApiErrorBody | undefined;
    let message = `Request failed (${res.status})`;
    try {
      parsed = (await res.json()) as ApiErrorBody;
      if (parsed?.message) {
        message = Array.isArray(parsed.message)
          ? parsed.message.join(", ")
          : parsed.message;
      }
    } catch {
      // non-json error
    }
    throw new ApiError(message, res.status, parsed);
  }

  if (res.status === 204) return undefined as T;

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

// Download a binary endpoint as a Blob (e.g. xlsx export).
async function downloadBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers, cache: "no-store" });
  } catch {
    throw new ApiError("Network error — is the backend running?", 0);
  }
  if (!res.ok) {
    throw new ApiError(`Download failed (${res.status})`, res.status);
  }
  return res.blob();
}

// ---------- Copilot SSE streaming ----------

export interface CopilotStreamHandlers {
  onStep: (s: CopilotStep) => void;
  onProposal: (p: CopilotProposal) => void;
  onError: (message: string) => void;
  onToken?: (text: string) => void;
  onThinking?: (text: string) => void;
  signal?: AbortSignal;
  editPermission?: boolean;
}

// Parse one SSE frame ("event:" / "data:" lines) and dispatch to handlers.
function dispatchFrame(frame: string, handlers: CopilotStreamHandlers): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const raw of frame.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith(":")) continue; // comment / keep-alive
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return;
  const data = dataLines.join("\n");
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return; // ignore unparseable frames
  }
  if (event === "token") {
    handlers.onToken?.((parsed as { text?: string })?.text ?? "");
  } else if (event === "thinking") {
    handlers.onThinking?.((parsed as { text?: string })?.text ?? "");
  } else if (event === "step") {
    handlers.onStep(parsed as CopilotStep);
  } else if (event === "proposal") {
    handlers.onProposal(parsed as CopilotProposal);
  } else if (event === "error") {
    const msg = (parsed as { message?: string })?.message;
    handlers.onError(msg ?? "Copilot error");
  }
}

async function copilotStream(
  id: string,
  message: string,
  files: File[],
  handlers: CopilotStreamHandlers,
  activeSheetId?: string,
  selectedRange?: { startRow: number; startCol: number; endRow: number; endCol: number },
  activeDrawingId?: string,
  selectedObjectId?: string,
  drawingContext?: { page?: number; scale?: number; activeTool?: string; layer?: string; objectType?: string }
): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const form = new FormData();
  form.append("message", message);
  for (const f of files) form.append("files", f);
  if (activeSheetId) form.append("activeSheetId", activeSheetId);
  if (selectedRange) form.append("selectedRange", JSON.stringify(selectedRange));
  if (activeDrawingId) form.append("drawingId", activeDrawingId);
  if (selectedObjectId) form.append("objectId", selectedObjectId);
  if (drawingContext) form.append("drawingContext", JSON.stringify(drawingContext));
  if (handlers.editPermission !== undefined) {
    form.append("editPermission", String(handlers.editPermission));
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/estimates/${id}/copilot/stream`, {
      method: "POST",
      headers,
      body: form,
      cache: "no-store",
      signal: handlers.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    handlers.onError("Network error — is the backend running?");
    return;
  }

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      const { logout } = await import("./auth");
      logout();
    }
  }

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.message) {
        msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      }
    } catch {
      /* non-json */
    }
    handlers.onError(msg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      // Collect all frames from this chunk first, then dispatch with a yield
      // between each so React can render intermediate states (avoids the
      // "all text at once" effect when multiple token frames arrive in one packet).
      const frames: string[] = [];
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (frame.trim()) frames.push(frame);
      }
      for (const frame of frames) {
        dispatchFrame(frame, handlers);
        // Yield to the macrotask queue so React flushes between tokens.
        // Without this, batched setState calls produce a single render showing
        // all text at once instead of the typewriter effect.
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
    // Flush any trailing frame.
    buffer += decoder.decode();
    if (buffer.trim()) dispatchFrame(buffer, handlers);
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      handlers.onError((err as Error)?.message ?? "Stream error");
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

export const api = {
  // ---------- Auth ----------
  register: (data: { name: string; email: string; password: string }) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: data,
      auth: false,
    }),

  login: (data: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: data,
      auth: false,
    }),

  me: () => request<User>("/auth/me"),

  // ---------- Estimates ----------
  listEstimates: () => request<EstimateListItem[]>("/estimates"),

  createEstimate: (name: string) =>
    request<Estimate>("/estimates", { method: "POST", body: { name } }),

  getEstimate: (id: string) => request<Estimate>(`/estimates/${id}`),

  renameEstimate: (id: string, name: string) =>
    request<Estimate>(`/estimates/${id}`, { method: "PATCH", body: { name } }),

  deleteEstimate: (id: string) =>
    request<{ ok: true }>(`/estimates/${id}`, { method: "DELETE" }),

  // ---------- Actions (ALL mutations) ----------
  // Manual grid edits (source:'manual') AND AI-confirmed proposals (source:'ai')
  // both flow here; the caller refreshes from the returned `estimate`.
  applyActions: (
    id: string,
    actions: Action[],
    source: "ai" | "manual" = "manual"
  ) =>
    request<ApplyActionsResponse>(`/estimates/${id}/actions`, {
      method: "POST",
      body: { actions, source },
    }),

  rollback: (id: string, patchId: string) =>
    request<Estimate>(`/estimates/${id}/rollback`, {
      method: "POST",
      body: { patchId },
    }),

  // ---------- Copilot (SSE stream) ----------
  // POSTs message+files multipart and reads the SSE stream via getReader().
  // Dispatches `step`/`proposal`/`error` events to the supplied handlers.
  // Returns a promise that resolves when the stream ends.
  copilotStream: (
    id: string,
    message: string,
    files: File[],
    handlers: CopilotStreamHandlers,
    activeSheetId?: string,
    selectedRange?: { startRow: number; startCol: number; endRow: number; endCol: number },
    activeDrawingId?: string,
    selectedObjectId?: string,
    drawingContext?: { page?: number; scale?: number; activeTool?: string; layer?: string; objectType?: string }
  ): Promise<void> =>
    copilotStream(id, message, files, handlers, activeSheetId, selectedRange, activeDrawingId, selectedObjectId, drawingContext),

  // ---------- Catalog ----------
  catalog: (q: string) =>
    request<CatalogItem[]>(`/catalog?q=${encodeURIComponent(q)}`),

  // ---------- Import ----------
  importExcel: async (id: string, file: File): Promise<Estimate> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/estimates/${id}/import-excel`, {
      method: "POST",
      headers,
      body: form,
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = `Import failed (${res.status})`;
      try {
        const b = (await res.json()) as ApiErrorBody;
        if (b?.message) msg = Array.isArray(b.message) ? b.message.join(", ") : b.message;
      } catch { /* ignore */ }
      throw new ApiError(msg, res.status);
    }
    return res.json() as Promise<Estimate>;
  },

  // ---------- Conversation ----------
  getConversation: (id: string) =>
    request<ConversationMessage[]>(`/estimates/${id}/conversation`),

  saveConversation: (id: string, messages: ConversationMessage[]) =>
    request<{ ok: true }>(`/estimates/${id}/conversation`, {
      method: "POST",
      body: { messages },
    }),

  // ---------- Project Intelligence ----------
  getInsights: (id: string) =>
    request<InsightItem[]>(`/estimates/${id}/insights`),

  // ---------- Home Feed ----------
  getHomeFeed: () => request<OfficialFeedItem[]>("/home/feed"),

  // ---------- Export ----------
  exportF1: (id: string) => downloadBlob(`/estimates/${id}/export-f1`),

  // ---------- Drawings ----------
  listDrawings: (estimateId: string) =>
    request<Drawing[]>(`/estimates/${estimateId}/drawings`),

  getDrawing: (estimateId: string, drawingId: string) =>
    request<Drawing & { objects: DrawingObject[] }>(
      `/estimates/${estimateId}/drawings/${drawingId}`
    ),

  uploadDrawing: async (estimateId: string, file: File): Promise<Drawing> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/estimates/${estimateId}/drawings`, {
      method: "POST",
      headers,
      body: form,
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = `Upload failed (${res.status})`;
      try {
        const b = (await res.json()) as ApiErrorBody;
        if (b?.message) msg = Array.isArray(b.message) ? b.message.join(", ") : b.message;
      } catch { /* ignore */ }
      throw new ApiError(msg, res.status);
    }
    return res.json() as Promise<Drawing>;
  },

  detectDrawingObjects: (estimateId: string, drawingId: string) =>
    request<{ objects: DrawingObject[] }>(
      `/estimates/${estimateId}/drawings/${drawingId}/detect`,
      { method: "POST" }
    ),

  compareDrawings: (
    estimateId: string,
    drawingIdA: string,
    drawingIdB: string
  ) =>
    request<RevisionDiff>(
      `/estimates/${estimateId}/drawings/compare`,
      { method: "POST", body: { drawingIdA, drawingIdB } }
    ),

  deleteDrawing: (estimateId: string, drawingId: string) =>
    request<{ ok: true }>(
      `/estimates/${estimateId}/drawings/${drawingId}`,
      { method: "DELETE" }
    ),

  // ---------- Workspace Preferences ----------
  getPreferences: (estimateId: string) =>
    request<WorkspacePreference>(`/estimates/${estimateId}/preferences`),

  savePreferences: (estimateId: string, prefs: Partial<WorkspacePreference>) =>
    request<WorkspacePreference>(`/estimates/${estimateId}/preferences`, {
      method: "PUT",
      body: prefs,
    }),

  // ---------- Notifications ----------
  getNotifications: () => request<AppNotification[]>("/notifications"),

  markNotificationRead: (id: string) =>
    request<{ ok: true }>(`/notifications/${id}/read`, { method: "PATCH" }),

  // ---------- Background Jobs ----------
  getJob: (jobId: string) => request<BackgroundJob>(`/jobs/${jobId}`),
};

// Trigger a browser download for a fetched Blob.
export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
