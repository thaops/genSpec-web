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
  | { type: "clear" };

export interface CopilotSource {
  title?: string;
  uri?: string;
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
  timestamp: string;
}

// ---------- Drawing Workspace ----------

export type DrawingFileType = "pdf" | "dwg" | "dxf" | "image";

export interface Drawing {
  id: string;
  estimateId: string;
  name: string;
  type: DrawingFileType;
  url: string;
  thumbnail?: string;
  version: number;
  pageCount?: number;
  createdAt: string;
}

export type DrawingObjectType =
  | "beam" | "column" | "wall" | "slab"
  | "door" | "window" | "stair" | "roof" | "unknown";

export interface DrawingObject {
  id: string;
  drawingId: string;
  type: DrawingObjectType;
  geometry: number[][];
  confidence: number;
  layer: string;
  boundingBox: { x: number; y: number; w: number; h: number; page?: number };
  properties: Record<string, string | number>;
  boqRef?: string; // matched BOQ row id
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
  diff: RevisionDiff;
  createdAt: string;
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

export type JobStatus = "queued" | "processing" | "done" | "failed";

export interface BackgroundJob {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  message?: string;
  estimateId?: string;
  createdAt: string;
}

// ---------- AI Context ----------

export interface AiContext {
  workspaceId: string;
  sheetId?: string;
  selection?: { startRow: number; startCol: number; endRow: number; endCol: number };
  drawingId?: string;
  objectId?: string;
  revisionId?: string;
}
