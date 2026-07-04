"use client";

import { useState } from "react";
import type { TakeoffEngineAssumptions } from "@/lib/api";

// Giả định hình học cho engine bóc khối lượng deterministic.
// Persist per-drawing trong localStorage — hỏi 1 lần đầu, các lần sau dùng lại.

export const DEFAULT_TAKEOFF_ASSUMPTIONS: TakeoffEngineAssumptions = {
  floorHeight: 3.3,
  wallThickness: 0.2,
  beamDepth: 0.4,
};

const storageKey = (drawingId: string) => `genspec_takeoff_assump_${drawingId}`;

export function loadTakeoffAssumptions(
  drawingId: string
): TakeoffEngineAssumptions | null {
  try {
    const raw = localStorage.getItem(storageKey(drawingId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<TakeoffEngineAssumptions>;
    if (
      typeof p.floorHeight === "number" &&
      typeof p.wallThickness === "number" &&
      typeof p.beamDepth === "number"
    ) {
      return p as TakeoffEngineAssumptions;
    }
  } catch {
    /* corrupt entry → treat as unset */
  }
  return null;
}

export function saveTakeoffAssumptions(
  drawingId: string,
  a: TakeoffEngineAssumptions
) {
  try {
    localStorage.setItem(storageKey(drawingId), JSON.stringify(a));
  } catch {
    /* quota */
  }
}

const FIELDS: {
  key: keyof TakeoffEngineAssumptions;
  label: string;
  step: number;
}[] = [
  { key: "floorHeight", label: "Cao tầng (m)", step: 0.1 },
  { key: "wallThickness", label: "Dày tường (m)", step: 0.05 },
  { key: "beamDepth", label: "Sâu dầm (m)", step: 0.05 },
];

interface Props {
  drawingId: string;
  /** Save + run — Enter trong input hoặc nút "Bóc ngay" */
  onRun: (a: TakeoffEngineAssumptions) => void;
  onClose: () => void;
}

/** Popover nhỏ cạnh nút ⚡ — 3 input số nằm ngang, Enter là chạy ngay.
    Parent chịu trách nhiệm định vị (render trong container `relative`). */
export function TakeoffAssumptionsPopover({ drawingId, onRun, onClose }: Props) {
  const [values, setValues] = useState<TakeoffEngineAssumptions>(
    () => loadTakeoffAssumptions(drawingId) ?? DEFAULT_TAKEOFF_ASSUMPTIONS
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    saveTakeoffAssumptions(drawingId, values);
    onRun(values);
  }

  return (
    <form
      onSubmit={submit}
      className="absolute right-0 top-full z-40 mt-1.5 w-max rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 shadow-xl animate-slide-up"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <p className="mb-2 text-[11px] font-medium text-zinc-300">
        Giả định hình học (lưu cho bản vẽ này)
      </p>
      <div className="flex items-end gap-2">
        {FIELDS.map((f, i) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">{f.label}</span>
            <input
              type="number"
              autoFocus={i === 0}
              min={0.01}
              step="any"
              value={values[f.key]}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [f.key]: Number(e.target.value),
                }))
              }
              className="w-20 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-200 outline-none focus:border-accent-500"
            />
          </label>
        ))}
        <button
          type="submit"
          className="rounded bg-accent-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-accent-500"
        >
          Bóc ngay
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 py-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Đóng
        </button>
      </div>
    </form>
  );
}
