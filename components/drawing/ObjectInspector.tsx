"use client";

import { useState } from "react";
import { Search, X, Sparkles, ClipboardList } from "lucide-react";
import type { DrawingObject, DrawingRevision } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  beam: "Dầm", column: "Cột", wall: "Tường", slab: "Sàn",
  door: "Cửa", window: "Cửa sổ", stair: "Cầu thang", roof: "Mái",
  footing: "Móng băng", pile: "Cọc", opening: "Lỗ mở", ramp: "Dốc",
  elevator: "Thang máy", axis: "Trục",
  dimension: "Dimension", leader: "Leader", block: "Block",
  polyline: "Polyline", hatch: "Hatch", text: "Text",
  symbol: "Symbol", viewport: "Viewport", unknown: "Không xác định",
};

const TYPE_ICONS: Record<string, string> = {
  beam: "⬛", column: "🟫", wall: "🧱", slab: "⬜",
  door: "🚪", window: "🪟", stair: "📶", roof: "🏠",
  footing: "⚓", pile: "🔩", axis: "╋", dimension: "↔", leader: "↗",
  block: "⬦", polyline: "〰", hatch: "▨", text: "T",
  symbol: "◈", viewport: "▭", unknown: "❓",
};

// ACI index → readable name + hex color
const ACI_COLORS: Record<number, { name: string; hex: string }> = {
  1: { name: "Red",     hex: "#ff4444" }, 2: { name: "Yellow",  hex: "#ffff44" },
  3: { name: "Green",   hex: "#44ee44" }, 4: { name: "Cyan",    hex: "#44ffff" },
  5: { name: "Blue",    hex: "#4466ff" }, 6: { name: "Magenta", hex: "#ff44ff" },
  7: { name: "White",   hex: "#cccccc" }, 8: { name: "Gray",    hex: "#808080" },
  9: { name: "Lt Gray", hex: "#aaaaaa" },
  256: { name: "ByLayer", hex: "#888" },
  0:   { name: "ByBlock", hex: "#666" },
};

// Lineweight index → mm (AutoCAD standard)
const LW_MM: Record<number, string> = {
  0: "0.00", 5: "0.05", 9: "0.09", 13: "0.13", 15: "0.15", 18: "0.18",
  20: "0.20", 25: "0.25", 30: "0.30", 35: "0.35", 40: "0.40", 50: "0.50",
  53: "0.53", 60: "0.60", 70: "0.70", 80: "0.80", 90: "0.90", 100: "1.00",
  106: "1.06", 120: "1.20", 140: "1.40", 158: "1.58", 200: "2.00", 211: "2.11",
  29: "ByLayer",
};

function computeLength(geometry: number[][]): number {
  if (geometry.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < geometry.length; i++) {
    const dx = geometry[i][0] - geometry[i-1][0];
    const dy = geometry[i][1] - geometry[i-1][1];
    len += Math.sqrt(dx*dx + dy*dy);
  }
  return len;
}

function computeArea(geometry: number[][]): number {
  if (geometry.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = geometry.length - 1; i < geometry.length; j = i++) {
    area += (geometry[j][0] + geometry[i][0]) * (geometry[j][1] - geometry[i][1]);
  }
  return Math.abs(area) / 2;
}

// Specification stub (will be replaced by API data)
interface SpecClause {
  code: string;
  title: string;
  description: string;
  standard: string;   // "TCVN 9386", "22TCN 272"
  url?: string;
}

const SPEC_MAP: Record<string, SpecClause[]> = {
  beam: [
    { code: "TCVN 5574:2018", title: "Kết cấu bê tông và bê tông cốt thép", description: "Tiêu chuẩn thiết kế dầm bê tông cốt thép", standard: "TCVN" },
  ],
  column: [
    { code: "TCVN 5574:2018", title: "Kết cấu bê tông và bê tông cốt thép", description: "Tiêu chuẩn thiết kế cột bê tông cốt thép", standard: "TCVN" },
  ],
  wall: [
    { code: "TCVN 5308:1991", title: "Quy phạm kỹ thuật an toàn trong xây dựng", description: "Yêu cầu kỹ thuật tường xây", standard: "TCVN" },
  ],
};

type InspectorTab = "summary" | "properties" | "boq" | "specification" | "ai" | "revision" | "history";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "summary",       label: "Summary" },
  { id: "properties",    label: "Props" },
  { id: "boq",           label: "BOQ" },
  { id: "specification", label: "Spec" },
  { id: "ai",            label: "AI" },
  { id: "revision",      label: "Rev" },
  { id: "history",       label: "History" },
];

interface ObjectInspectorProps {
  object: DrawingObject | null;
  revisions?: DrawingRevision[];
  onClose?: () => void;
  onGenerateTakeoff?: (obj: DrawingObject) => void;
  // Agent task in-flight → disable takeoff triggers
  takeoffBusy?: boolean;
  // Jump to the takeoff row traced to this object (token/boqRef/type-based lookup upstream)
  onJumpToBoq?: (obj: DrawingObject) => void;
}

export function ObjectInspector({
  object,
  revisions = [],
  onClose,
  onGenerateTakeoff,
  takeoffBusy = false,
  onJumpToBoq,
}: ObjectInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("summary");

  if (!object) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2 p-6 text-center">
        <Search className="h-8 w-8 text-zinc-600" />
        <p className="text-xs">Click vào đối tượng trong bản vẽ để xem</p>
      </div>
    );
  }

  const icon = TYPE_ICONS[object.type] ?? "❓";
  const label = TYPE_LABELS[object.type] ?? object.type;
  const confidencePct = Math.round(object.confidence * 100);
  const confidenceColor = object.confidence >= 0.8 ? "text-emerald-400" : object.confidence >= 0.5 ? "text-amber-400" : "text-rose-400";
  const confidenceBg = object.confidence >= 0.8 ? "bg-emerald-500" : object.confidence >= 0.5 ? "bg-amber-500" : "bg-rose-500";
  const specs = SPEC_MAP[object.type] ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-100 truncate">{label}</div>
            <div className="text-[10px] text-zinc-500 truncate">{object.layer}</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 shrink-0 ml-1"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 shrink-0 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap transition-colors border-b-2 ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "summary" && (() => {
          const props = object.properties ?? {};
          const handle = String(props.handle ?? "—");
          const rawType = String(object.rawType ?? props.rawType ?? "—");
          const colorIdx = Number(props.colorIndex ?? 256);
          const aciInfo = ACI_COLORS[colorIdx] ?? { name: `ACI ${colorIdx}`, hex: "#888" };
          const lwRaw = Number(props.lineweight ?? props.lineWeight ?? 29);
          const lwLabel = LW_MM[lwRaw] ?? `${lwRaw}`;
          const lineType = String(props.lineType ?? props.linetype ?? "").trim() || "Continuous";
          const geo = object.geometry ?? [];
          const length = computeLength(geo);
          const area = computeArea(geo);
          const { w, h, x, y } = object.boundingBox;
          return (
            <div className="p-3 space-y-3">
              {/* AI Semantic */}
              <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-2 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-zinc-400 uppercase tracking-wider">Semantic</span>
                  <span className={confidenceColor}>{confidencePct}%</span>
                </div>
                <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className={`h-full rounded-full ${confidenceBg}`} style={{ width: `${confidencePct}%` }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base">{icon}</span>
                  <div>
                    <div className="text-xs font-semibold text-zinc-100">{label}</div>
                    <div className="text-[10px] text-zinc-500">{object.detectionReason ?? ""}</div>
                  </div>
                </div>
              </div>

              {/* Entity identity */}
              <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-2 space-y-1">
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Entity</div>
                <PropRow label="Handle" value={handle} mono />
                <PropRow label="Type"   value={rawType} />
                <PropRow label="Layer"  value={object.layer} />
                <PropRow label="Page"   value={String(object.boundingBox.page ?? 1)} />
              </div>

              {/* Visual properties */}
              <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-2 space-y-1">
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Appearance</div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-zinc-500 shrink-0">Color</span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-sm border border-zinc-700" style={{ background: aciInfo.hex }} />
                    <span className="font-mono text-zinc-300">{aciInfo.name} ({colorIdx})</span>
                  </span>
                </div>
                <PropRow label="Lineweight" value={lwLabel === "ByLayer" ? "ByLayer" : `${lwLabel} mm`} />
                <PropRow label="Linetype"   value={lineType} />
              </div>

              {/* Geometry */}
              <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-2 space-y-1">
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Geometry</div>
                {length > 0 && <PropRow label="Length" value={`${length.toFixed(0)} mm`} />}
                {area > 0    && <PropRow label="Area"   value={`${(area / 1e6).toFixed(4)} m²`} />}
                <PropRow label="W" value={`${Math.round(w)}`} />
                <PropRow label="H" value={`${Math.round(h)}`} />
                <PropRow label="X" value={`${Math.round(x)}`} />
                <PropRow label="Y" value={`${Math.round(y)}`} />
              </div>

              {/* BOQ link */}
              {object.boqRef && (
                <div className="rounded-md bg-emerald-950/30 border border-emerald-800/30 p-2">
                  <div className="text-[10px] text-emerald-500 mb-0.5">BOQ Ref</div>
                  <div className="text-xs font-mono text-emerald-300">{object.boqRef}</div>
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === "properties" && (
          <div className="p-3 space-y-1">
            {Object.keys(object.properties).length === 0 ? (
              <p className="text-xs text-zinc-600 py-4 text-center">Không có thuộc tính</p>
            ) : (
              Object.entries(object.properties).map(([k, v]) => (
                <PropRow key={k} label={k} value={String(v)} />
              ))
            )}
          </div>
        )}

        {activeTab === "boq" && (
          <div className="p-3 space-y-3">
            {object.boqRef ? (
              <>
                <div className="rounded-md bg-emerald-950/30 border border-emerald-800/30 p-2">
                  <div className="text-[10px] text-emerald-500 mb-1">Đã liên kết BOQ</div>
                  <div className="text-xs font-mono text-emerald-300">{object.boqRef}</div>
                </div>
                <button
                  onClick={() => onJumpToBoq?.(object)}
                  className="w-full px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                >
                  → Nhảy tới BOQ row
                </button>
              </>
            ) : (
              <div className="text-center py-4 space-y-2">
                <p className="text-xs text-zinc-600">Chưa liên kết BOQ</p>
                {onJumpToBoq && (
                  <button
                    onClick={() => onJumpToBoq(object)}
                    className="w-full px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                  >
                    → Nhảy tới BOQ
                  </button>
                )}
                <button
                  onClick={() => onGenerateTakeoff?.(object)}
                  disabled={takeoffBusy}
                  className="px-3 py-1.5 rounded bg-accent-600 hover:bg-accent-500 text-white text-xs transition-colors disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3 mr-1 inline" /> {takeoffBusy ? "Đang bóc…" : "Generate Takeoff"}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "specification" && (
          <div className="p-3 space-y-3">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Tiêu chuẩn kỹ thuật
            </div>
            {specs.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-4">
                Chưa có tiêu chuẩn áp dụng
              </p>
            ) : (
              specs.map((spec) => (
                <div key={spec.code} className="rounded-md bg-zinc-900/60 border border-zinc-800 p-2.5 space-y-1">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[10px] font-mono text-blue-400 shrink-0">{spec.code}</span>
                    <span className="text-[9px] text-zinc-600 shrink-0">{spec.standard}</span>
                  </div>
                  <div className="text-xs font-medium text-zinc-200">{spec.title}</div>
                  <div className="text-[10px] text-zinc-500 leading-relaxed">{spec.description}</div>
                  {spec.url && (
                    <a href={spec.url} target="_blank" rel="noreferrer"
                      className="text-[10px] text-blue-500 hover:text-blue-400">
                      Xem tài liệu →
                    </a>
                  )}
                </div>
              ))
            )}
            {object.specRef && (
              <div className="rounded-md bg-amber-950/20 border border-amber-800/30 p-2">
                <div className="text-[10px] text-amber-500 mb-0.5">Liên kết spec</div>
                <div className="text-xs font-mono text-amber-300">{object.specRef}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === "ai" && (
          <div className="p-3 space-y-2">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">AI Analysis</div>
            <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-2">
              <div className="text-xs text-zinc-400 leading-relaxed">
                {label} được phát hiện với độ tin cậy {confidencePct}%.
                {object.confidence < 0.7 && " Cần xác nhận thủ công."}
                {object.confidence >= 0.7 && object.confidence < 0.9 && " Độ chính xác trung bình."}
                {object.confidence >= 0.9 && " Độ chính xác cao."}
              </div>
            </div>
            <button
              onClick={() => onGenerateTakeoff?.(object)}
              disabled={takeoffBusy}
              className="w-full px-3 py-2 rounded bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3 mr-1 inline" /> {takeoffBusy ? "Đang bóc…" : "Generate Takeoff"}
            </button>
            <button className="w-full px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors">
              <ClipboardList className="h-3 w-3 mr-1 inline" /> Review AI findings
            </button>
          </div>
        )}

        {activeTab === "revision" && (
          <div className="p-3 space-y-2">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Lịch sử Revision
            </div>
            {revisions.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-4">Chưa có revision</p>
            ) : (
              revisions.map((rev) => (
                <div key={rev.id} className="rounded-md bg-zinc-900/60 border border-zinc-800 p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-200">
                      {rev.label ?? `Rev ${rev.version}`}
                    </span>
                    <span className="text-[9px] text-zinc-600">
                      {new Date(rev.createdAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  {rev.summary && (
                    <div className="text-[10px] text-zinc-500">{rev.summary}</div>
                  )}
                  <div className="flex gap-2 text-[10px]">
                    <span className="text-emerald-400">+{rev.diff.added.length}</span>
                    <span className="text-rose-400">-{rev.diff.removed.length}</span>
                    <span className="text-amber-400">~{rev.diff.changed.length}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="p-3">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Drawing History
            </div>
            <p className="text-xs text-zinc-600 text-center py-4">Chưa có lịch sử</p>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      {(activeTab === "summary" || activeTab === "ai") && !object.boqRef && (
        <div className="px-3 py-2 border-t border-zinc-800 shrink-0">
          <button
            onClick={() => onGenerateTakeoff?.(object)}
            disabled={takeoffBusy}
            className="w-full px-3 py-1.5 rounded bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            ✨ {takeoffBusy ? "Đang bóc…" : "Generate Takeoff"}
          </button>
        </div>
      )}
    </div>
  );
}

function PropRow({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs py-0.5">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-right truncate max-w-[160px] ${mono ? "font-mono text-[10px]" : ""} ${highlight ? "text-emerald-400" : "text-zinc-300"}`}>{value}</span>
    </div>
  );
}
