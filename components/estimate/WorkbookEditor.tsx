"use client";

import { useEffect, useRef } from "react";
import type { Sheet, Workbook } from "@/lib/types";

interface Props {
  workbookData: Workbook;
  activeSheetId: string;
  onActiveSheetChange: (id: string) => void;
  onSelectionChange: (range: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }) => void;
  onDataChange: (sheets: Sheet[]) => void;
  findings?: any[];
}

export default function WorkbookEditor({
  workbookData,
  activeSheetId,
  onActiveSheetChange,
  onSelectionChange,
  onDataChange,
  findings = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<any>(null);
  const univerAPIRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let destroyed = false;

    async function init() {
      const { createUniver } = await import("@univerjs/presets");
      const { UniverSheetsCorePreset } = await import("@univerjs/preset-sheets-core");
      await import("@univerjs/preset-sheets-core/lib/index.css");

      if (destroyed || !containerRef.current) return;

      const { univer, univerAPI } = createUniver({
        presets: [
          UniverSheetsCorePreset({
            container: containerRef.current,
          }),
        ],
      });

      univerRef.current = univer;
      univerAPIRef.current = univerAPI;

      // Build sheets map
      const sheets: Record<string, any> = {};
      const sheetOrder: string[] = [];

      if (workbookData.sheets && workbookData.sheets.length > 0) {
        for (const s of workbookData.sheets) {
          sheets[s.id] = {
            id: s.id,
            name: s.name,
            cellData: s.data?.cellData ?? {},
            rowCount: s.data?.rowCount ?? 100,
            columnCount: s.data?.columnCount ?? 20,
          };
          sheetOrder.push(s.id);
        }
      } else {
        const sid = "sheet-1";
        sheets[sid] = { id: sid, name: "Sheet 1", rowCount: 100, columnCount: 20, cellData: {} };
        sheetOrder.push(sid);
      }

      univerAPI.createWorkbook({
        id: workbookData.id || "wb",
        name: workbookData.name || "GenSpec",
        sheets,
        sheetOrder,
      });

      const wb = univerAPI.getActiveWorkbook();
      if (!wb) return;

      // Set active sheet
      if (activeSheetId) {
        const target = wb.getSheetBySheetId(activeSheetId);
        if (target) wb.setActiveSheet(target);
      }

      wb.onCommandExecuted(() => {
        const cur = wb.getActiveSheet();
        if (cur) onActiveSheetChange(cur.getSheetId());

        const raw = wb.save();
        if (raw?.sheets) {
          const updated: Sheet[] = Object.keys(raw.sheets).map((key) => {
            const s = raw.sheets[key];
            return { id: s.id || key, name: s.name || "Sheet", data: s };
          });
          onDataChange(updated);
        }
      });

      wb.onSelectionChange((selections: any[]) => {
        if (selections?.length > 0) {
          const r = selections[0];
          onSelectionChange({
            startRow: r.startRow,
            startCol: r.startColumn,
            endRow: r.endRow,
            endCol: r.endColumn,
          });
        }
      });
    }

    init().catch((err) => console.error("[WorkbookEditor]", err));

    return () => {
      destroyed = true;
      try { univerRef.current?.dispose(); } catch (_) {}
      univerRef.current = null;
      univerAPIRef.current = null;
    };
  }, [workbookData.id]);

  // Sync active sheet from outside
  useEffect(() => {
    const wb = univerAPIRef.current?.getActiveWorkbook?.();
    if (!wb || !activeSheetId) return;
    const cur = wb.getActiveSheet?.();
    if (cur?.getSheetId() !== activeSheetId) {
      const target = wb.getSheetBySheetId?.(activeSheetId);
      if (target) wb.setActiveSheet(target);
    }
  }, [activeSheetId]);

  // Highlight findings
  useEffect(() => {
    if (!findings?.length) return;
    const wb = univerAPIRef.current?.getActiveWorkbook?.();
    if (!wb) return;
    const sheet = wb.getActiveSheet?.();
    if (!sheet) return;
    for (const f of findings) {
      if (f.sheetId === sheet.getSheetId() && f.row != null) {
        try {
          sheet.getRange(f.row, 0, 1, 10)?.setBackgroundColor(
            f.severity === "error" ? "#fecaca" : "#fef3c7"
          );
        } catch (_) {}
      }
    }
  }, [findings, activeSheetId]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
