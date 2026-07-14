"use client";

import { BoxSelect, Layers, MousePointer2, Ruler, Search, Sparkles, SquareDashed } from "lucide-react";

export type DrawingTool =
  | "pointer"
  | "pan"
  | "zoom"
  | "measure"
  | "count"
  | "area"
  | "scope"
  | "ai"
  | "layer"
  | "search"
  | "compare";

interface Tool {
  id: DrawingTool;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  dividerAfter?: boolean;
}

// Measure/area/layer only have behavior on the unified DrawingCanvas —
// the parent gates them via `capabilities`.
const TOOLS: Tool[] = [
  { id: "pointer", Icon: MousePointer2,   label: "Pointer", shortcut: "V" },
  { id: "measure", Icon: Ruler,           label: "Measure", shortcut: "M" },
  { id: "area",    Icon: SquareDashed,    label: "Area",    shortcut: "A" },
  { id: "scope",   Icon: BoxSelect,       label: "Vùng bóc", shortcut: "S" },
  { id: "layer",   Icon: Layers,          label: "Layers",  shortcut: "L" },
  { id: "search",  Icon: Search,          label: "Search",  shortcut: "F", dividerAfter: true },
  { id: "ai",      Icon: Sparkles,        label: "AI Detect", shortcut: "⌘D" },
];

const DEFAULT_CAPABILITIES: DrawingTool[] = ["pointer", "ai"];

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  vertical?: boolean;
  // Only tools listed here are rendered. Defaults to pointer/search/ai;
  // the scene canvas additionally enables measure/area/layer.
  capabilities?: DrawingTool[];
}

export function DrawingToolbar({
  activeTool,
  onToolChange,
  vertical = true,
  capabilities = DEFAULT_CAPABILITIES,
}: DrawingToolbarProps) {
  const tools = TOOLS.filter((t) => capabilities.includes(t.id));
  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-0.5 py-2 px-1 bg-zinc-950 border-r border-zinc-800 w-10 shrink-0">
        {tools.map((tool) => (
          <div key={tool.id} className="flex flex-col items-center w-full">
            <button
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
              onClick={() => onToolChange(tool.id)}
              className={`w-8 h-8 flex items-center justify-center rounded text-sm transition-colors ${
                activeTool === tool.id
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <tool.Icon className="h-3.5 w-3.5" />
            </button>
            {tool.dividerAfter && (
              <div className="w-6 h-px bg-zinc-800 my-1" />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Horizontal layout
  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-950 border-b border-zinc-800 shrink-0">
      {tools.map((tool) => (
        <div key={tool.id} className="flex items-center">
          <button
            title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
            onClick={() => onToolChange(tool.id)}
            className={`h-7 w-7 flex items-center justify-center rounded text-sm transition-colors ${
              activeTool === tool.id
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            <tool.Icon className="h-3.5 w-3.5" />
          </button>
          {tool.dividerAfter && (
            <div className="h-5 w-px bg-zinc-800 mx-1" />
          )}
        </div>
      ))}
    </div>
  );
}
