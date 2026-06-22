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

// Traceable provenance for a price (sheet 05/06/07 source column).
export interface PriceSource {
  name?: string;
  date?: string;
  region?: string;
  confidence?: number; // 0-100
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

// Confidence per section + overall (0-100).
export interface Confidence {
  boq?: number;
  materials?: number;
  labor?: number;
  equipment?: number;
  overall?: number;
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
  // computed
  boq: BoqRow[];
  materialSummary: MaterialSummaryRow[];
  costSummary: CostSummary;
  costs: Costs;
  activityLog: ActivityEntry[]; // last 100
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
