"use client";

import type { DrawingObject } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  beam: "Dầm",
  column: "Cột",
  wall: "Tường",
  slab: "Sàn",
  door: "Cửa",
  window: "Cửa sổ",
  stair: "Cầu thang",
  roof: "Mái",
  unknown: "Không xác định",
};

const TYPE_ICONS: Record<string, string> = {
  beam: "⬛",
  column: "🟫",
  wall: "🧱",
  slab: "⬜",
  door: "🚪",
  window: "🪟",
  stair: "📶",
  roof: "🏠",
  unknown: "❓",
};

interface ObjectInspectorProps {
  object: DrawingObject | null;
  onClose?: () => void;
  onGenerateTakeoff?: (obj: DrawingObject) => void;
}

export function ObjectInspector({ object, onClose, onGenerateTakeoff }: ObjectInspectorProps) {
  if (!object) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2 p-6 text-center">
        <span className="text-3xl">🔍</span>
        <p className="text-xs">Click vào một đối tượng trong bản vẽ để xem thông tin</p>
      </div>
    );
  }

  const icon = TYPE_ICONS[object.type] ?? "❓";
  const label = TYPE_LABELS[object.type] ?? object.type;
  const confidencePct = Math.round(object.confidence * 100);
  const confidenceColor =
    object.confidence >= 0.8 ? "text-emerald-400" : object.confidence >= 0.5 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="text-sm font-medium text-zinc-100">{label}</div>
            <div className="text-[10px] text-zinc-500">Layer: {object.layer}</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xs">
            ✕
          </button>
        )}
      </div>

      {/* Confidence */}
      <div className="px-3 py-2 border-b border-zinc-800/50">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-zinc-500">Độ tin cậy AI</span>
          <span className={confidenceColor}>{confidencePct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              object.confidence >= 0.8 ? "bg-emerald-500" : object.confidence >= 0.5 ? "bg-amber-500" : "bg-rose-500"
            }`}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Thuộc tính
        </div>

        {/* Bounding box */}
        <PropertyRow label="Vị trí X" value={`${Math.round(object.boundingBox.x)}`} />
        <PropertyRow label="Vị trí Y" value={`${Math.round(object.boundingBox.y)}`} />
        <PropertyRow label="Chiều rộng" value={`${Math.round(object.boundingBox.w)}`} />
        <PropertyRow label="Chiều cao" value={`${Math.round(object.boundingBox.h)}`} />

        {/* Custom properties */}
        {Object.entries(object.properties).map(([k, v]) => (
          <PropertyRow key={k} label={k} value={String(v)} />
        ))}

        {/* BOQ link */}
        {object.boqRef && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <div className="text-[10px] text-zinc-500 mb-1">Liên kết BOQ</div>
            <div className="text-xs text-blue-400 font-mono">{object.boqRef}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-3 border-t border-zinc-800 space-y-2">
        <button
          onClick={() => onGenerateTakeoff?.(object)}
          className="w-full px-3 py-2 rounded-md bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors"
        >
          ✨ Generate Takeoff
        </button>
        <button className="w-full px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors">
          Thêm vào BOQ
        </button>
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs py-0.5">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-300 text-right font-mono">{value}</span>
    </div>
  );
}
