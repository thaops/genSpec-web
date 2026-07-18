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
  ChatSessionMeta,
  InsightItem,
  OfficialFeedItem,
  Action,
  RepricePlan,
  ApplyActionsResponse,
  ApiErrorBody,
  Drawing,
  DrawingObject,
  LayerRule,
  DrawingScene,
  RevisionDiff,
  AppNotification,
  BackgroundJob,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://genspec-api-production-9f98.up.railway.app";

// ── Types cho endpoint Building/MEP/Review/Rebar/Knowledge ─────────────────
export interface RebarDiameterSummary {
  diameter: number;
  unitWeightKgM: number;
  mainBarCount: number;
  stirrupCalloutCount: number;
  spacings: number[];
}
export interface RebarTakeoff {
  totalCallouts: number;
  diameters: RebarDiameterSummary[];
  note: string;
}
export interface RebarWeightRow {
  diameter: number;
  totalLengthM: number;
  unitWeightKgM: number;
  weightKg: number;
}
export interface RebarWeightResult {
  rows: RebarWeightRow[];
  totalKg: number;
  wasteFactor: number;
}
export interface RoomNode {
  stableId: string;
  name: string;
  floor?: string;
  objectCount: number;
  typeCounts: Record<string, number>;
  memberStableIds: string[];
}
export interface FloorNode {
  floor: string;
  objectCount: number;
  typeCounts: Record<string, number>;
  rooms: RoomNode[];
}
export interface BuildingGraph {
  floors: FloorNode[];
  unassignedFloorCount: number;
  totalObjects: number;
}
export interface MepRow {
  type: string;
  label: string;
  kind: "count" | "length";
  unit: string;
  quantity: number;
  floor?: string;
  unitPrice?: number;
  totalPrice?: number;
  priceSource?: string;
}
export interface ScopeGapFinding {
  severity: "high" | "medium" | "low";
  category: "missing_scope" | "consistency";
  code: string;
  scope: string;
  message: string;
  suggestion?: string;
}
export interface PriceSourceRef {
  sourceId: string;
  price: number;
  trust: number;
  effectiveDate: string;
  documentNumber?: string;
  province?: string | null;
}
export interface MaterialKnowledge {
  query: string;
  matched: boolean;
  name?: string;
  unit?: string;
  latest?: PriceSourceRef;
  sources: PriceSourceRef[];
  history: { effectiveDate: string; price: number; sourceId: string }[];
}
export interface SwapImpact {
  from: { query: string; name?: string; price?: number };
  to: { query: string; name?: string; price?: number };
  matched: boolean;
  unit?: string;
  quantity: number;
  deltaUnit?: number;
  deltaPercent?: number;
  totalDelta?: number;
}

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
  drawingContext?: { page?: number; scale?: number; activeTool?: string; layer?: string; objectType?: string },
  chatSessionId?: string
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
  if (chatSessionId) form.append("chatSessionId", chatSessionId);
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

  // ---------- Reprice (áp giá tỉnh) ----------
  // Trả proposal + coverage; KHÔNG tự apply. Caller preview rồi gọi applyActions.
  reprice: (id: string, province?: string) =>
    request<RepricePlan>(`/estimates/${id}/reprice`, {
      method: "POST",
      body: { province },
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
    drawingContext?: { page?: number; scale?: number; activeTool?: string; layer?: string; objectType?: string },
    chatSessionId?: string
  ): Promise<void> =>
    copilotStream(id, message, files, handlers, activeSheetId, selectedRange, activeDrawingId, selectedObjectId, drawingContext, chatSessionId),

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

  // ---------- Chat sessions (phiên chat độc lập) ----------
  listChatSessions: (id: string) =>
    request<ChatSessionMeta[]>(`/estimates/${id}/chat-sessions`),

  createChatSession: (id: string) =>
    request<ChatSessionMeta>(`/estimates/${id}/chat-sessions`, {
      method: "POST",
    }),

  getChatSession: (id: string, sid: string) =>
    request<ConversationMessage[]>(`/estimates/${id}/chat-sessions/${sid}`),

  saveChatSession: (id: string, sid: string, messages: ConversationMessage[]) =>
    request<{ ok: true }>(`/estimates/${id}/chat-sessions/${sid}`, {
      method: "PUT",
      body: { messages },
    }),

  deleteChatSession: (id: string, sid: string) =>
    request<{ ok: true }>(`/estimates/${id}/chat-sessions/${sid}`, {
      method: "DELETE",
    }),

  // ---------- Conversation (legacy — session mới nhất) ----------
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

  // Upload nhiều bản vẽ — loop từng file (mỗi file 1 job độc lập, an toàn hơn batch).
  uploadDrawings: async (estimateId: string, files: File[]): Promise<Drawing[]> => {
    const out: Drawing[] = [];
    for (const file of files) {
      out.push(await api.uploadDrawing(estimateId, file));
    }
    return out;
  },

  // Bóc lại bản vẽ bị kẹt/lỗi parse — reset 'parsing' + chạy lại pipeline.
  reparseDrawing: (estimateId: string, drawingId: string) =>
    request<Drawing>(
      `/estimates/${estimateId}/drawings/${drawingId}/reparse`,
      { method: "POST" }
    ),

  // User chỉnh tay bộ môn của bản vẽ.
  setDrawingDiscipline: (estimateId: string, drawingId: string, discipline: string) =>
    request<Drawing>(
      `/estimates/${estimateId}/drawings/${drawingId}/discipline`,
      { method: "PATCH", body: { discipline } }
    ),

  // Unified vector scene for the DrawingCanvas. 404 → ApiError (caller
  // falls back to the legacy DxfViewer / DwgCanvasViewer).
  getDrawingScene: (estimateId: string, drawingId: string) =>
    request<DrawingScene>(
      `/estimates/${estimateId}/drawings/${drawingId}/scene`
    ),

  // Lưu thumbnail (data-URI ảnh render từ scene) → hiện trên card home.
  saveDrawingThumbnail: (estimateId: string, drawingId: string, dataUrl: string) =>
    request<{ ok: true }>(
      `/estimates/${estimateId}/drawings/${drawingId}/thumbnail`,
      { method: "PATCH", body: { dataUrl } }
    ),

  detectDrawingObjects: (estimateId: string, drawingId: string) =>
    request<{ drawingId: string; objectCount: number; objects: DrawingObject[] }>(
      `/estimates/${estimateId}/drawings/${drawingId}/detect`,
      { method: "POST" }
    ),

  // Tier 3 — LLM resolve residual ambiguous/unknown objects
  aiResolveObjects: (estimateId: string, drawingId: string) =>
    request<{ drawingId: string; resolved: number; considered?: number; skipped?: number; objects?: DrawingObject[]; message?: string }>(
      `/estimates/${estimateId}/drawings/${drawingId}/detect/ai-resolve`,
      { method: "POST" }
    ),

  // Tier 4 — user corrects one object's type (durable across re-detect)
  correctObjectType: (estimateId: string, drawingId: string, stableId: string, type: string) =>
    request<{ object: DrawingObject; promoted: boolean }>(
      `/estimates/${estimateId}/drawings/${drawingId}/objects/${stableId}/type`,
      { method: "PATCH", body: { type } }
    ),

  // ── Building Graph / MEP / Review / Rebar / Knowledge (backend sprint endpoints) ──

  // Rebar takeoff — bóc cốt thép từ callout (%%C=Ø). Không suy kg (cần chiều dài).
  rebarTakeoff: (estimateId: string, drawingId: string) =>
    request<RebarTakeoff>(`/estimates/${estimateId}/drawings/${drawingId}/rebar`),

  // kg thép khi ĐÃ có chiều dài (từ bảng thống kê / cấu kiện).
  rebarWeight: (
    estimateId: string,
    drawingId: string,
    lengths: { diameter: number; totalLengthM: number }[],
    wasteFactor = 1.0,
  ) =>
    request<RebarWeightResult>(
      `/estimates/${estimateId}/drawings/${drawingId}/rebar/weight`,
      { method: "POST", body: { lengths, wasteFactor } },
    ),

  // Building Graph — cây Building→Floor→Room→Object.
  building: (estimateId: string, drawingId: string) =>
    request<BuildingGraph>(`/estimates/${estimateId}/drawings/${drawingId}/building`),

  // typeCounts theo từng tầng.
  buildingFloors: (estimateId: string, drawingId: string) =>
    request<Record<string, Record<string, number>>>(
      `/estimates/${estimateId}/drawings/${drawingId}/building/floors`,
    ),

  // "Tầng X bao nhiêu <type>?"
  buildingCount: (estimateId: string, drawingId: string, type: string, floor?: string) =>
    request<{ type: string; floor: string | null; count: number }>(
      `/estimates/${estimateId}/drawings/${drawingId}/building/count?type=${encodeURIComponent(type)}${floor ? `&floor=${encodeURIComponent(floor)}` : ""}`,
    ),

  // "Phòng nào chưa có <type>?"
  buildingRoomsMissing: (estimateId: string, drawingId: string, type: string) =>
    request<RoomNode[]>(
      `/estimates/${estimateId}/drawings/${drawingId}/building/rooms-missing?type=${encodeURIComponent(type)}`,
    ),

  // MEP takeoff — đếm thiết bị + đo tuyến; định giá theo tên nếu có location.
  buildingMep: (
    estimateId: string,
    drawingId: string,
    opts: { factor?: number; byFloor?: boolean; location?: string } = {},
  ) => {
    const q = new URLSearchParams();
    if (opts.factor != null) q.set("factor", String(opts.factor));
    if (opts.byFloor) q.set("byFloor", "true");
    if (opts.location) q.set("location", opts.location);
    const qs = q.toString();
    return request<MepRow[]>(
      `/estimates/${estimateId}/drawings/${drawingId}/building/mep${qs ? `?${qs}` : ""}`,
    );
  },

  // AI Review — phát hiện thiếu phạm vi (scope-gap).
  buildingReview: (estimateId: string, drawingId: string) =>
    request<ScopeGapFinding[]>(`/estimates/${estimateId}/drawings/${drawingId}/building/review`),

  // Knowledge Graph — tri thức 1 vật tư (nguồn + giá mới nhất + lịch sử).
  knowledgeMaterial: (name: string, province?: string) =>
    request<MaterialKnowledge>(
      `/data-hub/knowledge/material?name=${encodeURIComponent(name)}${province ? `&province=${encodeURIComponent(province)}` : ""}`,
    ),

  // Knowledge Graph — "Đổi A→B chênh bao nhiêu?" × khối lượng.
  knowledgeSwap: (from: string, to: string, quantity = 1, province?: string) => {
    const q = new URLSearchParams({ from, to, quantity: String(quantity) });
    if (province) q.set("province", province);
    return request<SwapImpact>(`/data-hub/knowledge/swap?${q.toString()}`);
  },

  // Tier 2 layer overrides (per-project)
  getLayerRules: (estimateId: string) =>
    request<LayerRule[]>(`/estimates/${estimateId}/drawings/layer-rules`),

  saveLayerRules: (estimateId: string, rules: LayerRule[]) =>
    request<LayerRule[]>(`/estimates/${estimateId}/drawings/layer-rules`, {
      method: "POST",
      body: { rules },
    }),

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

// ---------- Catalog import (M2.5 — định mức + công bố giá tỉnh) ----------
// NOTE: chưa có UI — trang Settings sẽ gọi các hàm này sau.

export interface CatalogImportSummary {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface CatalogNormComponent {
  kind: "material" | "labor" | "machine";
  refCode?: string;
  name: string;
  unit: string;
  norm: number;
}

export interface CatalogNormPreviewItem {
  code: string;
  name: string;
  unit: string;
  group: string;
  components: CatalogNormComponent[];
}

export interface CatalogPricePreviewItem {
  refCode?: string;
  name: string;
  unit: string;
  price: number;
  kind: "material" | "labor" | "machine";
}

export interface CatalogImportPreview<T> {
  dryRun: true;
  header: { headerRowIndex: number; columns: Record<string, number> } | null;
  detectedColumns: string[];
  total: number;
  preview: T[]; // 100 dòng đầu đã map
  errors: string[];
}

/** Import Excel định mức (TT12/2021...). dryRun=true → chỉ preview mapping. */
export function importNorms(
  file: File,
  opts?: { sourceDoc?: string; dryRun?: boolean }
): Promise<CatalogImportSummary | CatalogImportPreview<CatalogNormPreviewItem>> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.sourceDoc) form.append("sourceDoc", opts.sourceDoc);
  const qs = opts?.dryRun ? "?dryRun=true" : "";
  return request(`/catalog/import-norms${qs}`, { method: "POST", form });
}

/** BE trả về khi đã tồn tại bộ giá trùng (province, effectiveDate) và chưa overwrite */
export interface CatalogImportConflict {
  conflict: true;
  existing: {
    sourceDoc?: string;
    importedAt?: string;
    itemCount?: number;
  };
}

/** Import công bố giá tỉnh. meta.effectiveDate: ISO date string. overwrite=true → ghi đè bộ giá trùng. */
export function importPrices(
  file: File,
  meta: { province: string; effectiveDate: string; sourceDoc?: string },
  dryRun?: boolean,
  overwrite?: boolean
): Promise<
  CatalogImportSummary | CatalogImportPreview<CatalogPricePreviewItem> | CatalogImportConflict
> {
  const form = new FormData();
  form.append("file", file);
  form.append("province", meta.province);
  form.append("effectiveDate", meta.effectiveDate);
  if (meta.sourceDoc) form.append("sourceDoc", meta.sourceDoc);
  const params = new URLSearchParams();
  if (dryRun) params.set("dryRun", "true");
  if (overwrite) params.set("overwrite", "true");
  const qsStr = params.toString();
  const qs = qsStr ? `?${qsStr}` : "";
  return request(`/catalog/import-prices${qs}`, { method: "POST", form });
}

/** Xuất Bảng Tổng hợp dự toán chi phí xây dựng (THDT) dạng xlsx. */
export function exportTHDT(id: string): Promise<Blob> {
  return downloadBlob(`/estimates/${id}/export-thdt`);
}

export function exportTMDT(id: string): Promise<Blob> {
  return downloadBlob(`/estimates/${id}/export-tmdt`);
}

// ---------- Deterministic takeoff engine (⚡ Bóc toàn bộ) ----------
// Fast (<2s) geometry-based takeoff computed on the BE — returns a
// CopilotProposal (NOT applied); FE injects it into the chat as a pending
// ProposalCard the user applies like any AI proposal.

export interface TakeoffEngineAssumptions {
  /** Chiều cao tầng (m) */
  floorHeight: number;
  /** Chiều dày tường (m) */
  wallThickness: number;
  /** Chiều sâu dầm (m) */
  beamDepth: number;
}

export interface TakeoffEngineBody {
  drawingId: string;
  unitsPerDrawingUnit: number;
  assumptions: TakeoffEngineAssumptions;
  rejectedObjectIds?: string[];
  /** Vùng bóc (world coords): BE chỉ đo đối tượng có tâm bbox trong vùng */
  region?: { x: number; y: number; w: number; h: number };
  /** Bộ môn bản vẽ — tuỳ chọn; BE tự đọc từ drawing doc là chuẩn. */
  discipline?: string;
  /** Bật gán mã phổ thông + tra/ước lượng đơn giá (⚡ là hành động chỉnh sửa). */
  editPermission?: boolean;
  /** QS xác nhận vòng tròn ambiguous là cột tròn → BE đo πr²×H. */
  confirmRoundColumns?: boolean;
}

export function runTakeoffEngine(
  estimateId: string,
  body: TakeoffEngineBody
): Promise<CopilotProposal> {
  return request<CopilotProposal>(`/estimates/${estimateId}/takeoff-engine`, {
    method: "POST",
    body,
  });
}

// ---------- Tra mã & Phân tích đơn giá (QS lookup) ----------
// Đọc dữ liệu giá THẬT đã nạp (unit_prices + material_prices). Mọi kết quả có nguồn.

export interface UnitPriceResult {
  code: string;
  name: string;
  unit: string;
  material: number; // đơn giá VL
  labor: number; // đơn giá NC
  machine: number; // đơn giá Máy
  unitPrice: number; // tổng
  province: string;
  sourceDoc: string; // NGUỒN — vd "TT13/2021 - Đơn giá Hà Nội"
  sourceOrigin?: string; // vd "luatvietnam.vn"
  splitConfident?: boolean; // false = tách VL/NC/M là suy đoán (tổng vẫn chuẩn)
}

export interface ResourcePriceResult {
  materialId: string;
  name: string;
  category: "material" | "labor" | "equipment" | "fuel" | "transport";
  unit: string;
  price: number;
  province?: string;
  sourceId: string; // NGUỒN
  trust?: number;
  effectiveDate?: string;
  documentNumber?: string;
}

/** Tra đơn giá công tác theo mã hiệu hoặc từ khóa tên, lọc theo tỉnh. */
export function searchUnitPrice(
  q: string,
  province?: string,
  limit?: number
): Promise<UnitPriceResult[]> {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (province) p.set("province", province);
  if (limit) p.set("limit", String(limit));
  return request<UnitPriceResult[]>(`/catalog/unit-price/search?${p.toString()}`);
}

/** Tra 1 đơn giá công tác theo mã hiệu (prefix) — dùng cho phân tích đơn giá. */
export function getUnitPriceByCode(
  code: string,
  province?: string
): Promise<UnitPriceResult | null> {
  const p = new URLSearchParams();
  if (province) p.set("province", province);
  const qs = p.toString();
  return request<UnitPriceResult | null>(
    `/catalog/unit-price/${encodeURIComponent(code)}${qs ? `?${qs}` : ""}`
  );
}

/** Tra giá tài nguyên (VL/NC/ca máy) trong material_prices — có nguồn. */
export function searchResourcePrice(
  q: string,
  opts: { province?: string; category?: string; limit?: number } = {}
): Promise<ResourcePriceResult[]> {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (opts.province) p.set("province", opts.province);
  if (opts.category) p.set("category", opts.category);
  if (opts.limit) p.set("limit", String(opts.limit));
  return request<ResourcePriceResult[]>(
    `/catalog/resource-price/search?${p.toString()}`
  );
}

// ---------- Drawing Revision Compare V2 (M3-B) ----------
// Standalone (kept out of the `api` object so this file stays append-only).
// Compares `drawingId` (current/new) against `againstDrawingId` (base/old).
export function compareDrawingsV2(
  estimateId: string,
  drawingId: string,
  againstDrawingId: string
): Promise<import("./types").DrawingDiff> {
  return request<import("./types").DrawingDiff>(
    `/estimates/${estimateId}/drawings/${drawingId}/compare`,
    { method: "POST", body: { againstDrawingId } }
  );
}
