import { getToken } from "./auth";
import type {
  AuthResponse,
  User,
  Estimate,
  EstimateListItem,
  CatalogItem,
  CopilotStep,
  CopilotProposal,
  Action,
  ApplyActionsResponse,
  ApiErrorBody,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://genspec-api.onrender.com";

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
  signal?: AbortSignal;
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
  handlers: CopilotStreamHandlers
): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const form = new FormData();
  form.append("message", message);
  for (const f of files) form.append("files", f);

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
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (frame.trim()) dispatchFrame(frame, handlers);
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

  // ---------- Copilot (SSE stream) ----------
  // POSTs message+files multipart and reads the SSE stream via getReader().
  // Dispatches `step`/`proposal`/`error` events to the supplied handlers.
  // Returns a promise that resolves when the stream ends.
  copilotStream: (
    id: string,
    message: string,
    files: File[],
    handlers: CopilotStreamHandlers
  ): Promise<void> =>
    copilotStream(id, message, files, handlers),

  // ---------- Catalog ----------
  catalog: (q: string) =>
    request<CatalogItem[]>(`/catalog?q=${encodeURIComponent(q)}`),

  // ---------- Export ----------
  exportF1: (id: string) => downloadBlob(`/estimates/${id}/export-f1`),
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
