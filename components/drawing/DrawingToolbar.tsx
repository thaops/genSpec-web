"use client";

import { MousePointer2, Hand, ZoomIn, Ruler, Hash, Square, Search, Layers, ArrowLeftRight, Sparkles } from "lucide-react";

export type DrawingTool =
  | "pointer"
  | "pan"
  | "zoom"
  | "measure"
  | "count"
  | "area"
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

const TOOLS: Tool[] = [
  { id: "pointer", Icon: MousePointer2,   label: "Pointer", shortcut: "V" },
  { id: "pan",     Icon: Hand,            label: "Pan",     shortcut: "H" },
  { id: "zoom",    Icon: ZoomIn,          label: "Zoom",    shortcut: "Z", dividerAfter: true },
  { id: "measure", Icon: Ruler,           label: "Measure", shortcut: "M" },
  { id: "count",   Icon: Hash,            label: "Count",   shortcut: "C" },
  { id: "area",    Icon: Square,          label: "Area",    shortcut: "A", dividerAfter: true },
  { id: "search",  Icon: Search,          label: "Search",  shortcut: "F" },
  { id: "layer",   Icon: Layers,          label: "Layers",  shortcut: "L" },
  { id: "compare", Icon: ArrowLeftRight,  label: "Compare", dividerAfter: true },
  { id: "ai",      Icon: Sparkles,        label: "AI Detect", shortcut: "⌘D" },
];

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  vertical?: boolean;
}

export function DrawingToolbar({ activeTool, onToolChange, vertical = true }: DrawingToolbarProps) {
  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-0.5 py-2 px-1 bg-zinc-950 border-r border-zinc-800 w-10 shrink-0">
        {TOOLS.map((tool) => (
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
      {TOOLS.map((tool) => (
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
