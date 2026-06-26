"use client";

import { useState } from "react";
import type { DrawingObject, DrawingRevision } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  beam: "Dầm", column: "Cột", wall: "Tường", slab: "Sàn",
  door: "Cửa", window: "Cửa sổ", stair: "Cầu thang", roof: "Mái",
  footing: "Móng băng", pile: "Cọc", opening: "Lỗ mở", ramp: "Dốc",
  elevator: "Thang máy",
  dimension: "Dimension", leader: "Leader", block: "Block",
  polyline: "Polyline", hatch: "Hatch", text: "Text",
  symbol: "Symbol", viewport: "Viewport", unknown: "Không xác định",
};

const TYPE_ICONS: Record<string, string> = {
  beam: "⬛", column: "🟫", wall: "🧱", slab: "⬜",
  door: "🚪", window: "🪟", stair: "📶", roof: "🏠",
  footing: "⚓", pile: "🔩", dimension: "↔", leader: "↗",
  block: "⬦", polyline: "〰", hatch: "▨", text: "T",
  symbol: "◈", viewport: "▭", unknown: "❓",
};

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
  onJumpToBoq?: (boqRef: string) => void;
}

export function ObjectInspector({
  object,
  revisions = [],
  onClose,
  onGenerateTakeoff,
  onJumpToBoq,
}: ObjectInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("summary");

  if (!object) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2 p-6 text-center">
        <span className="text-3xl">🔍</span>
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
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-xs shrink-0 ml-1">✕</button>
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
        {activeTab === "summary" && (
          <div className="p-3 space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-500">AI Confidence</span>
                <span className={confidenceColor}>{confidencePct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className={`h-full rounded-full ${confidenceBg}`} style={{ width: `${confidencePct}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <PropRow label="Type" value={label} />
              <PropRow label="Layer" value={object.layer} />
              <PropRow label="Page" value={String(object.boundingBox.page ?? 1)} />
              <PropRow label="BOQ Ref" value={object.boqRef ?? "—"} highlight={!!object.boqRef} />
              {object.specRef && <PropRow label="Spec" value={object.specRef} highlight />}
            </div>
            <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-2 space-y-1">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kích thước</div>
              <div className="grid grid-cols-2 gap-1">
                <PropRow label="W" value={`${Math.round(object.boundingBox.w)}`} />
                <PropRow label="H" value={`${Math.round(object.boundingBox.h)}`} />
                <PropRow label="X" value={`${Math.round(object.boundingBox.x)}`} />
                <PropRow label="Y" value={`${Math.round(object.boundingBox.y)}`} />
              </div>
            </div>
          </div>
        )}

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
                  onClick={() => onJumpToBoq?.(object.boqRef!)}
                  className="w-full px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                >
                  → Nhảy tới BOQ row
                </button>
              </>
            ) : (
              <div className="text-center py-4 space-y-2">
                <p className="text-xs text-zinc-600">Chưa liên kết BOQ</p>
                <button
                  onClick={() => onGenerateTakeoff?.(object)}
                  className="px-3 py-1.5 rounded bg-accent-600 hover:bg-accent-500 text-white text-xs transition-colors"
                >
                  ✨ Generate Takeoff
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
              className="w-full px-3 py-2 rounded bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors"
            >
              ✨ Generate Takeoff
            </button>
            <button className="w-full px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors">
              📋 Review AI findings
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
            className="w-full px-3 py-1.5 rounded bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors"
          >
            ✨ Generate Takeoff
          </button>
        </div>
      )}
    </div>
  );
}

function PropRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs py-0.5">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-right font-mono truncate max-w-[120px] ${highlight ? "text-emerald-400" : "text-zinc-300"}`}>{value}</span>
    </div>
  );
}
