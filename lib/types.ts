// Mirror of CONTRACT2.md — GenSpec v3 resource-based QS estimate (9 sheets).

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

// ---------- Editable state ----------

export interface ProjectInfo {
  name?: string;
  location?: string;
  investor?: string;
  dateCreated?: string;
  preparedBy?: string;
  normVersion?: string;
  priceVersion?: string;
  buildingType?: string;
  floors?: number;
  area?: string;
  note?: string;
}

export type SourceType =
  | "government"
  | "supplier"
  | "market"
  | "forum"
  | "ai_estimate"
  | "manual";

// Traceable provenance for a price (sheet 05/06/07 source column).
export interface PriceSource {
  name?: string;
  date?: string;
  region?: string;
  type?: SourceType; // loại nguồn — drives reliability deterministically
  confidence?: number; // 0-100 (derived from type)
  url?: string;
}

// 05 Giá vật liệu
export interface Material {
  id: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  source?: PriceSource;
}

// 06 Giá nhân công
export interface Labor {
  id: string;
  grade: string; // bậc thợ
  name: string; // mô tả
  dayRate: number; // lương ngày
  source?: PriceSource;
}

// 07 Giá ca máy
export interface Equipment {
  id: string;
  code: string;
  name: string;
  unit: string;
  shiftRate: number; // đơn giá ca
  source?: PriceSource;
}

export type ResourceKind = "material" | "labor" | "equipment";

export interface AnalysisComponent {
  kind: ResourceKind;
  ref: string; // resource code / grade
  name?: string;
  unit?: string;
  norm: number; // định mức
}

// 04 Phân tích đơn giá
export interface UnitPriceAnalysis {
  id: string;
  code: string;
  name: string;
  unit: string;
  components: AnalysisComponent[];
}

// 02 Bóc tách khối lượng
export interface TakeoffItem {
  id: string;
  group?: string;
  code: string;
  name: string;
  unit: string;
  length?: number;
  width?: number;
  height?: number;
  count?: number;
  formula?: string;
  note?: string; // diễn giải — human-readable description of what was measured
  quantity: number;
}

export interface Markups {
  overheadPct: number; // chi phí chung
  profitPct: number; // thu nhập chịu thuế tính trước (TNCTTT)
  vatPct: number;
  contingencyPct: number; // dự phòng
}

// ---------- Computed (read-only) ----------

// 03 BOQ
export interface BoqRow {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  material: number;
  labor: number;
  machine: number;
  unitPrice: number;
  total: number;
}

// 08 Tổng hợp vật tư
export interface MaterialSummaryRow {
  kind: ResourceKind;
  ref: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  amount: number;
}

// 09 Tổng hợp kinh phí
export interface CostSummary {
  directMaterial: number;
  directLabor: number;
  directMachine: number;
  directTotal: number; // A
  overhead: number; // B
  profit: number; // C
  preTax: number;
  vat: number; // D
  contingency: number; // E
  total: number; // F
}

export interface Costs {
  material: number;
  labor: number;
  machine: number;
  total: number;
}

// ---------- Change log & confidence ----------

// One entry in the estimate's change log (AI- or manual-driven).
export interface ActivityEntry {
  at: string; // ISO
  source: "ai" | "manual";
  kind: string; // action type
  label: string;
  detail?: string; // e.g. "17.000 → 22.000"
}

export interface PatchChange {
  op: "update" | "insert" | "delete";
  sheetId?: string;
  cell?: string;
  path?: string;
  entityId?: string;
  oldValue: any;
  newValue: any;
}

export interface Patch {
  id: string;
  actor: "ai" | "manual";
  timestamp: string;
  description: string;
  changes: PatchChange[];
}

// Confidence per section + overall (0-100), with the basis for the score.
export interface Confidence {
  boq?: number;
  materials?: number;
  labor?: number;
  equipment?: number;
  overall?: number;
  reasons?: string[]; // căn cứ tăng độ tin (vd "Diện tích sàn đầy đủ")
  missing?: string[]; // dữ liệu còn thiếu (vd "Bản vẽ kết cấu")
  uncertaintyPct?: number; // sai số ước lượng ±%
}

// ---------- Trace engine (auditable derivation per BOQ item) ----------

export interface QuantityTraceLine {
  takeoffId: string;
  note?: string;
  group?: string;
  formula?: string;
  dims?: { length?: number; width?: number; height?: number; count?: number };
  quantity: number;
}

export interface UnitPriceComponentTrace {
  kind: ResourceKind;
  ref: string;
  name: string;
  unit?: string;
  norm: number;
  price: number;
  amount: number;
  source?: PriceSource;
}

export interface TraceItem {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  material: number;
  labor: number;
  machine: number;
  total: number;
  assumptions: string[];
  quantityTrace: QuantityTraceLine[];
  components: UnitPriceComponentTrace[];
}

// ---------- Validation & consistency (AI self-check) ----------

export interface Benchmark {
  metric: "total" | "perM2";
  low: number;
  high: number;
  mid?: number;
  source?: { name?: string; url?: string; date?: string };
  basis?: string;
}

export type ValidationStatus = "reasonable" | "warning" | "unrealistic";

export type ValidationArea =
  | "quantity"
  | "unitPrice"
  | "total"
  | "missing"
  | "benchmark"
  | "source";

export interface ValidationFinding {
  id: string;
  severity: "info" | "warn" | "error";
  area: ValidationArea;
  title: string;
  detail: string;
  refCode?: string;
  expected?: string;
  actual?: string;
  deviationPct?: number;
}

export type ConsistencyKind =
  | "orphan_takeoff"
  | "unresolved_ref"
  | "empty_analysis"
  | "zero_price"
  | "sum_mismatch";

export interface ConsistencyIssue {
  id: string;
  severity: "warn" | "error";
  kind: ConsistencyKind;
  message: string;
  refCode?: string;
}

export interface ValidationReport {
  status: ValidationStatus;
  score: number; // 0-100
  benchmark?: Benchmark;
  deviationPct?: number;
  findings: ValidationFinding[];
  consistency: ConsistencyIssue[];
}

// Preview of what a proposal would change before it is applied.
export interface ProposalCount {
  kind: string;
  added: number;
  updated: number;
  removed: number;
}

export interface ProposalDiff {
  ref: string;
  field: string;
  from: string;
  to: string;
}

export interface ProposalPreview {
  counts: ProposalCount[];
  costBefore: number;
  costAfter: number;
  costDelta: number;
  diffs: ProposalDiff[];
}

export interface UnmatchedResource {
  kind: "material" | "labor" | "equipment";
  ref: string;
  name: string;
}

/** Kết quả áp giá tỉnh — proposal chưa apply, kèm coverage & preview. */
export interface RepricePlan {
  province: string | null;
  effectiveDate: string | null;
  sourceDoc: string | null;
  coverage: { matched: number; total: number };
  unmatched: UnmatchedResource[];
  actions: Action[];
  preview: ProposalPreview | null;
  message: string;
}

export interface Sheet {
  id: string;
  name: string;
  metadata?: Record<string, any>;
  data: any;
}

export interface EntityMap {
  entityId: string;
  sheetId: string;
  semanticPath: string;
}

export interface Workbook {
  id: string;
  userId: string;
  name: string;
  sheets: Sheet[];
  entityMaps?: EntityMap[];
  activityLog?: ActivityEntry[];
}

export interface Estimate {
  id: string;
  userId: string;
  name: string;
  // editable state
  projectInfo: ProjectInfo;
  takeoff: TakeoffItem[];
  analyses: UnitPriceAnalysis[];
  materials: Material[];
  labor: Labor[];
  equipment: Equipment[];
  markups: Markups;
  sheets?: Sheet[];
  entityMaps?: EntityMap[];
  // computed
  boq: BoqRow[];
  materialSummary: MaterialSummaryRow[];
  costSummary: CostSummary;
  costs: Costs;
  validation: ValidationReport; // self-check (status, score, benchmark, findings, consistency)
  trace: TraceItem[]; // auditable derivation per BOQ line
  activityLog: ActivityEntry[]; // last 100
  patchHistory?: Patch[];
  conversationMessages?: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

// Summary returned by GET /estimates (list).
export interface EstimateListItem {
  id: string;
  name: string;
  projectInfo: ProjectInfo;
  costs: Costs;
  itemCount: number;
  takeoffCount: number;
  drawingCount: number;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItem {
  code: string;
  name: string;
  unit: string;
  group: string;
  material: number;
  labor: number;
  machine: number;
}

// ---------- Actions (Copilot output AND manual-edit payloads) ----------

export type Action =
  | { type: "set_project_info"; patch: Partial<ProjectInfo> }
  | { type: "set_markups"; patch: Partial<Markups> }
  | {
      type: "upsert_material";
      id?: string;
      code: string;
      name: string;
      unit: string;
      price: number;
      source?: PriceSource;
    }
  | { type: "delete_material"; id: string }
  | {
      type: "upsert_labor";
      id?: string;
      grade: string;
      name: string;
      dayRate: number;
    }
  | { type: "delete_labor"; id: string }
  | {
      type: "upsert_equipment";
      id?: string;
      code: string;
      name: string;
      unit: string;
      shiftRate: number;
    }
  | { type: "delete_equipment"; id: string }
  | {
      type: "upsert_analysis";
      id?: string;
      code: string;
      name: string;
      unit: string;
      components: AnalysisComponent[];
    }
  | { type: "delete_analysis"; id: string }
  | {
      type: "upsert_takeoff";
      id?: string;
      group?: string;
      code: string;
      name: string;
      unit: string;
      length?: number;
      width?: number;
      height?: number;
      count?: number;
      formula?: string;
      note?: string;
      quantity?: number;
    }
  | { type: "delete_takeoff"; id: string }
  | {
      type: "update_cells";
      sheetId: string;
      cell: string;
      oldValue: string;
      newValue: string;
      entityId?: string;
    }
  | { type: "set_sheets"; sheets: Sheet[] }
  | {
      type: "format_sheet";
      sheetId: string;
      columnWidths?: Record<string, number>;
      cells?: Array<{ cell: string; s: Record<string, unknown> }>;
    }
  | { type: "clear" };

export interface CopilotSource {
  title?: string;
  uri?: string;
  /** Nguồn giá: "government" | "catalog" | "web" | "ai_estimate"... — thiếu = không rõ */
  type?: string;
}

// ---------- Copilot SSE stream events ----------

// `event: step` — emitted live as the AI reasons.
export interface CopilotStep {
  text: string;
}

// `event: proposal` — final proposal (NOT applied). FE shows preview → confirm.
export interface CopilotProposal {
  thinking: string[];
  message: string;
  confidence?: Confidence;
  actions: Action[];
  sources: CopilotSource[];
  preview: ProposalPreview;
  validation: ValidationReport; // AI self-check on the prospective state
  trace: TraceItem[]; // auditable derivation per BOQ line (prospective state)
}

export interface ApplyActionsResponse {
  estimate: Estimate;
  applied: number;
  warnings: string[];
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// ---------- Project Intelligence ----------

export interface InsightItem {
  title: string;
  detail: string;
  type: "cost" | "risk" | "saving" | "data" | "formula";
  impact?: string;
}

export interface OfficialFeedItem {
  title: string;
  region: string;
  source: string;
  issuedDate: string | null;
  effectiveDate: string | null;
  type: "price_notification" | "regulation" | "circular" | "decision";
  trustScore: number;
  url: string | null;
  imageUrl?: string | null;
  summary?: string | null;
}

// ---------- Agent Console ----------

export type ReviewSeverity = "info" | "warning" | "critical";

export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  area: string; // 'workbook' | 'formula' | 'material' | 'boq' | 'qs' | 'source'
  message: string;
  suggestion?: string;
  sheetId?: string;
  cellRef?: string;
  code?: string;
}

export type ConversationKind = "user" | "assistant" | "proposal" | "review" | "error";

export interface ConversationMessage {
  id: string;
  kind: ConversationKind;
  text?: string;
  proposal?: CopilotProposal;
  proposalState?: "pending" | "applied" | "discarded";
  appliedCount?: number;
  findings?: ReviewFinding[];
  /** Patch created when this message's actions were applied — enables per-message undo */
  patchId?: string;
  /** True after the user rolled back this message's patch */
  undone?: boolean;
  /** Gemini thought summary streamed during this reply — shown collapsed in the bubble */
  thinking?: string;
  timestamp: string;
}

/** Meta của một phiên chat (không kèm messages) — GET /estimates/:id/chat-sessions */
export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

// ---------- Applied actions record (cell "Vì sao?" popover) ----------

// One cell edit persisted from an applied `update_cells` action.
export interface AppliedCellEdit {
  sheetId: string;
  cell: string;
  oldValue: string;
  newValue: string;
}

// Emitted by AgentConsole after actions are applied successfully — lets the
// page track which cells the AI just edited (trust popover + undo per patch).
export interface AppliedActionsRecord {
  /** Patch created by this apply — undefined when the server returned no history */
  patchId?: string;
  msgId: string;
  appliedAt: string;
  /** Proposal message truncated to 200 chars */
  message: string;
  sources: CopilotSource[];
  cells: AppliedCellEdit[];
}

// ---------- Drawing Domain ----------

export type DrawingFileType = "pdf" | "dwg" | "dxf" | "image";

export interface Drawing {
  id: string;
  estimateId: string;
  name: string;
  type: DrawingFileType;
  discipline?: string; // 'KT' | 'KC' | 'DIEN' | 'NUOC' | 'KHAC'
  url: string;
  convertedUrl?: string;
  thumbnail?: string;
  version: number;
  pageCount?: number;
  parseStatus?: "pending" | "converting" | "parsing" | "ready" | "failed";
  parseError?: string;
  parseStartedAt?: string;
  createdAt: string;
}

// Một trang trong bản vẽ PDF/DWG
export interface DrawingPage {
  id: string;
  drawingId: string;
  pageNumber: number;
  label?: string;        // "Tầng 1", "Mặt bằng kết cấu"
  scale?: number;        // tỷ lệ trang
  width?: number;        // điểm PDF/DXF unit
  height?: number;
  thumbnail?: string;
}

// Layer trong DXF/DWG (hoặc nhóm đối tượng trong PDF)
export interface DrawingLayer {
  id: string;
  drawingId: string;
  name: string;          // "BEAM", "COLUMN", "0"
  color?: string;        // hex
  visible: boolean;
  locked: boolean;
  objectCount: number;
}

// Đối tượng kiến trúc/kết cấu được detect
export type DrawingObjectType =
  // Kết cấu
  | "beam" | "column" | "wall" | "slab" | "stair" | "roof" | "footing" | "pile"
  // Kiến trúc
  | "door" | "window" | "opening" | "ramp" | "elevator"
  // CAD entities
  | "dimension" | "leader" | "block" | "polyline" | "hatch" | "text" | "symbol" | "viewport"
  | "axis" | "ignored" | "unknown";

/** Per-project layer override rule (Tier 2). Undefined discriminator = match any. */
export interface LayerRule {
  layer: string;
  color?: number;
  lineType?: string;
  type: DrawingObjectType;
}

export interface DrawingObject {
  id: string;
  // stableId persists across revisions — same physical object = same stableId.
  // Used by Revision Compare to track identity without depending on id.
  stableId: string;
  drawingId: string;
  pageId?: string;
  layerId?: string;
  type: DrawingObjectType;
  rawType?: string;        // original DXF/DWG entity type (LINE, LWPOLYLINE, etc.)
  geometry: number[][];
  confidence: number;
  detectionReason?: string; // human-readable explanation from detector
  // Multi-hypothesis from geometry (Tier 1). `type` = argmax; when `ambiguous` the
  // object is unresolved — show candidates for review, don't treat `type` as final.
  candidates?: { type: DrawingObjectType; prob: number }[];
  ambiguous?: boolean;
  layer: string;
  boundingBox: { x: number; y: number; w: number; h: number; page?: number };
  properties: Record<string, string | number>;
  boqRef?: string;       // matched BOQ row id
  specRef?: string;      // linked specification clause
  markupIds?: string[];  // annotations on this object
  floor?: string;        // "Tầng 1", "Móng", "Mái" — set by Graph Builder
}

// ---------- Drawing Graph ----------

export type RelationshipType =
  | "supports"       // column supports beam
  | "supported_by"   // beam supported_by column
  | "contains"       // slab contains opening
  | "adjacent_to"    // wall adjacent_to wall
  | "belongs_to"     // object belongs_to floor/zone
  | "connects"       // beam connects column to column
  | "references";    // dimension references object

export interface DrawingRelationship {
  id: string;
  drawingId: string;
  fromObjectId: string;  // stableId preferred
  toObjectId: string;    // stableId preferred
  type: RelationshipType;
  confidence: number;    // 0-1 (AI-inferred or rule-based)
  properties?: Record<string, string | number>;
  createdAt: string;
}

// Structural graph for one drawing — nodes + edges
export interface DrawingGraph {
  drawingId: string;
  objects: DrawingObject[];
  relationships: DrawingRelationship[];
  builtAt: string;       // when graph was last computed
}

// Markup / redline do user vẽ lên
export type MarkupType = "arrow" | "rect" | "circle" | "freehand" | "callout" | "cloud";
export type MarkupColor = "red" | "green" | "blue" | "yellow" | "orange";

export interface DrawingMarkup {
  id: string;
  drawingId: string;
  pageNumber: number;
  type: MarkupType;
  color: MarkupColor;
  points: number[][];   // geometry
  text?: string;
  createdBy: string;
  createdAt: string;
  resolved: boolean;
}

// Comment / annotation gắn với markup hoặc object
export interface DrawingAnnotation {
  id: string;
  drawingId: string;
  markupId?: string;
  objectId?: string;
  pageNumber: number;
  text: string;
  author: string;
  createdAt: string;
  replies?: DrawingAnnotationReply[];
}

export interface DrawingAnnotationReply {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

// Full-text search index entry (pre-built by parser)
export interface DrawingIndexEntry {
  drawingId: string;
  pageNumber: number;
  kind: "layer" | "text" | "dimension" | "block" | "object";
  value: string;         // text nội dung có thể tìm
  objectId?: string;
  boundingBox?: { x: number; y: number; w: number; h: number };
}

export interface RevisionDiff {
  added: DrawingObject[];
  removed: DrawingObject[];
  changed: DrawingObject[];
}

export interface DrawingRevision {
  id: string;
  drawingId: string;
  version: number;
  label?: string;        // "Rev A", "IFC 2024-01-15"
  diff: RevisionDiff;
  summary?: string;      // AI-generated summary of changes
  uploadedBy: string;
  createdAt: string;
}

// ---------- Drawing vector scene (unified DrawingCanvas) ----------
// Contract: GET /estimates/:id/drawings/:drawingId/scene
// CAD coordinates, Y-up (viewer flips when rendering).

export interface SceneLine {
  t: "line";
  layer: string;
  color?: string | null;
  p: [number, number, number, number]; // x1,y1,x2,y2
}

export interface ScenePolyline {
  t: "pline";
  layer: string;
  color?: string | null;
  closed: boolean;
  pts: number[]; // x,y,x,y,...
}

export interface SceneArc {
  t: "arc";
  layer: string;
  color?: string | null;
  cx: number; cy: number; r: number;
  a0: number; a1: number; // radians, CCW in CAD space
}

export interface SceneCircle {
  t: "circle";
  layer: string;
  color?: string | null;
  cx: number; cy: number; r: number;
}

export interface SceneText {
  t: "text";
  layer: string;
  color?: string | null;
  x: number; y: number;
  h: number;    // text height in drawing units
  rot: number;  // rotation
  s: string;    // content
}

export type SceneEntity = SceneLine | ScenePolyline | SceneArc | SceneCircle | SceneText;

export interface SceneLayer {
  name: string;
  color?: string | null;
  entityCount: number;
}

export interface DrawingScene {
  version: 1;
  units: "mm" | "m" | "inch" | "unknown";
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  layers: SceneLayer[];
  entities: SceneEntity[];
  truncated?: boolean;
}

// Calibration: real-world units per drawing unit (persisted per drawing)
export interface DrawingCalibration {
  unitsPerDrawingUnit: number;
  unitLabel: string;
  /** true = tự nhận từ đơn vị bản vẽ ($INSUNITS) — không persist, user hiệu chỉnh sẽ ghi đè */
  auto?: boolean;
  /** User đã xác nhận dùng tỉ lệ auto này (gate ⚡ không hỏi lại) — persist theo bản vẽ */
  confirmed?: boolean;
}

// ---------- Assets ----------

export interface Asset {
  id: string;
  estimateId: string;
  name: string;
  type: string;
  url: string;
  size: number;
  createdAt: string;
}

// ---------- Workspace Preferences ----------

export interface WorkspacePreference {
  province: string;
  currency: string;
  priceSource: string;
  regulation: string;
  unit: string;
  taxRate: number;
  aiModel?: string;
}

// ---------- Notifications ----------

export type NotificationType =
  | "price_updated" | "review_done" | "proposal_ready"
  | "drawing_parsed" | "export_done" | "job_failed";

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  estimateId?: string;
  read: boolean;
  createdAt: string;
}

// ---------- Background Jobs ----------

export type JobStatus = "queued" | "processing" | "done" | "failed" | "cancelled";

export interface JobLogEntry {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface BackgroundJob {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;      // 0-100
  message?: string;
  estimateId?: string;
  drawingId?: string;
  logs?: JobLogEntry[];
  durationMs?: number;   // set when done/failed
  retryCount?: number;
  canRetry?: boolean;
  canCancel?: boolean;
  createdAt: string;
}

// ---------- Proposal Engine ----------

export type ProposalItemType =
  | 'upsert_takeoff' | 'delete_takeoff'
  | 'update_cells'
  | 'upsert_material' | 'update_price'
  | 'set_project_info';

export interface ProposalItem {
  id: string;
  type: ProposalItemType;
  label: string;
  detail?: string;
  before?: Record<string, unknown>;
  after: Record<string, unknown>;
  sourceDrawingId?: string;
  sourceObjectId?: string;  // stableId
  sourceSheetId?: string;
  sourceCellRef?: string;
  confidence: number;
  requiresConfirmation: boolean;
  // Items that must be applied first (structural dependency)
  dependencies?: string[];
  applyOrder?: number;       // set by topological sort in ProposalEngine
}

export interface ProposalSetFE {
  id: string;
  agentRunId: string;
  estimateId: string;
  action: AgentActionType;
  summary: string;
  items: ProposalItem[];
  costBefore?: number;
  costAfter?: number;
  costDelta?: number;
  status: 'pending' | 'partially_applied' | 'applied' | 'discarded';
  appliedItemIds: string[];
  createdAt: string;
}

// ---------- Revision Engine ----------

export type RevisionStatus =
  | 'added' | 'removed' | 'changed'
  | 'moved' | 'renamed' | 'split' | 'merged'
  | 'unchanged';

export interface RevisionMapping {
  stableId: string;
  status: RevisionStatus;
  oldProperties?: Record<string, unknown>;
  newProperties?: Record<string, unknown>;
  changedFields?: string[];
  moveDistance?: number;
  relatedStableIds?: string[];
}

export interface RevisionDiffResult {
  drawingId: string;
  mappings: RevisionMapping[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
  significantChanges: string[];  // AI-summarized change descriptions
}

// ---------- Agent Entities (audit / replay / multi-agent) ----------

// Một lần chạy Agent (có thể retry)
export interface AgentRun {
  id: string;
  estimateId: string;
  action: AgentActionType;
  status: "pending" | "running" | "done" | "failed";
  contextSnapshot: AiContext;
  inputPrompt: string;
  outputProposal?: string;   // proposal id
  durationMs?: number;
  tokensUsed?: number;
  createdAt: string;
}

// Nhóm proposals liên quan một AgentRun
export interface ProposalSet {
  id: string;
  agentRunId: string;
  estimateId: string;
  proposals: CopilotProposal[];
  appliedAt?: string;
  discardedAt?: string;
}

// Review run (review_workbook / review_drawing)
export interface ReviewRun {
  id: string;
  estimateId: string;
  type: "workbook" | "drawing";
  drawingId?: string;
  findings: ReviewFinding[];
  resolvedIds: string[];
  createdAt: string;
}

// Audit log cho mọi action user + AI
export interface ActionLog {
  id: string;
  estimateId: string;
  actor: "user" | "ai";
  action: string;
  payload?: Record<string, unknown>;
  resultSummary?: string;
  revertible: boolean;
  createdAt: string;
}

// ---------- Standardized AI Actions ----------

export type AgentActionType =
  | "review_workbook"
  | "review_drawing"
  | "generate_takeoff"
  | "generate_boq"
  | "find_missing"
  | "compare_revision"
  | "explain_code"
  | "update_price"
  | "optimize_cost";

export interface AgentActionPayload {
  action: AgentActionType;
  estimateId: string;
  // generate_takeoff / review_drawing
  drawingId?: string;
  objectId?: string;
  pageNumber?: number;
  // find_missing / compare_revision
  revisionIdA?: string;
  revisionIdB?: string;
  // explain_code / update_price
  code?: string;
  sheetId?: string;
  cellRef?: string;
}

// ---------- AI Context Engine ----------

export interface AiContext {
  workspaceId: string;
  // Spreadsheet context
  sheetId?: string;
  selection?: { startRow: number; startCol: number; endRow: number; endCol: number };
  // Drawing context
  drawingId?: string;
  objectId?: string;
  hoveredObjectId?: string;
  revisionId?: string;
  // Viewport
  currentPage?: number;
  currentFloor?: string;  // "Tầng 1", "Mái", "Móng"
  scale?: number;
  activeTool?: string;
  layer?: string;
  mousePosition?: { x: number; y: number };
  // Timestamp for cache invalidation
  capturedAt?: string;
}

// ---------- BOQ ↔ Drawing traceability (M3-A) ----------
// Structured token the AI writes into the "Ghi chú" column of takeoff rows:
//   [obj:<drawingObjectId>]   — row generated from one specific object
//   [nhóm:<DrawingObjectType>] — row generated from a full-takeoff type group
export interface BoqTraceToken {
  objectId?: string;
  groupType?: string;
}

// Request to focus/pan the drawing canvas onto an object (BOQ → drawing jump).
// nonce retriggers the focus even when the target is unchanged.
export interface DrawingFocusRequest {
  objectId?: string;
  groupType?: string;
  nonce: number;
}

// ---------- AI Knowledge Graph ----------
// Unified graph that AI reads — connects all domain entities.
// Built incrementally as data arrives, never recomputed from scratch.

export type KnowledgeNodeType =
  | "estimate"
  | "sheet"
  | "takeoff_item"
  | "boq_row"
  | "material"
  | "drawing"
  | "drawing_object"
  | "specification"
  | "price_source"
  | "revision";

export interface KnowledgeNode {
  id: string;             // entity id from its own domain
  type: KnowledgeNodeType;
  label: string;          // human-readable display
  estimateId: string;
  properties?: Record<string, string | number>;
}

export type KnowledgeEdgeType =
  | "has_sheet"
  | "has_drawing"
  | "has_takeoff"
  | "references_boq"      // drawing_object → boq_row
  | "priced_by"           // boq_row → material
  | "specified_by"        // drawing_object → specification
  | "supported_by"        // drawing graph relationship
  | "revised_from"        // drawing_object → revision
  | "sourced_from";       // price → price_source

export interface KnowledgeEdge {
  fromId: string;
  toId: string;
  type: KnowledgeEdgeType;
  weight?: number;        // relevance score for AI ranking
}

export interface KnowledgeGraph {
  estimateId: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  builtAt: string;
}

// ---------- Agent Registry ----------
// Declarative definition of every AI agent in the system.
// Adding a new agent = adding one entry here + implementing the handler.

export type AgentPermission =
  | "read_workbook"
  | "write_workbook"
  | "read_drawing"
  | "read_price"
  | "write_notification"
  | "write_job";

export interface AgentDefinition {
  id: string;             // matches AgentActionType
  name: string;           // "Generate Takeoff"
  description: string;
  icon: string;
  permissions: AgentPermission[];
  model: string;          // "openrouter/google/gemma-3-27b-it" | "gpt-4o-mini" etc.
  inputSchema: string;    // JSON schema id for input validation
  outputSchema: string;   // JSON schema id for output validation
  streaming: boolean;
  maxTokens?: number;
  // FE display
  visibleInToolbar: boolean;
  shortcut?: string;
  category: "analysis" | "generation" | "comparison" | "explanation" | "optimization";
}

// ---------- Drawing Revision Compare V2 (M3-B) ----------
// Contract: POST /estimates/:id/drawings/:drawingId/compare { againstDrawingId }
// drawingId = current (new) drawing; againstDrawingId = base (old) drawing.
// Matching on BE: exact stableId first, fallback same type + bbox IoU > 0.7.

export interface DrawingDiffChangedPair {
  before: DrawingObject; // object in base (old) drawing
  after: DrawingObject;  // object in current (new) drawing
  changedFields: string[]; // property keys; includes "boundingBox" when moved/resized
  iou: number;
  matchedBy: "stableId" | "iou";
}

export interface DrawingDiff {
  drawingId: string;        // current (new)
  againstDrawingId: string; // base (old)
  added: DrawingObject[];   // in current, unmatched in base
  removed: DrawingObject[]; // in base, unmatched in current
  changed: DrawingDiffChangedPair[];
  unchangedCount: number;
  summary: { addedCount: number; removedCount: number; changedCount: number };
}

// ---------- Agent task feedback (floating pill) ----------
// Mirrors a silent runTask()'s lifecycle so the page can render visible
// progress outside the (possibly collapsed) agent sidebar.
export interface AgentTaskState {
  label: string;
  step: string;
  status: "running" | "done" | "error";
  proposalMsgId?: string;
}
