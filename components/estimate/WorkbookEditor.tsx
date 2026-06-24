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
  const workbookInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let isDestroyed = false;

    async function initUniver() {
      const { Univer } = await import("@univerjs/core");
      const { UniverRenderEnginePlugin } = await import("@univerjs/engine-render");
      const { UniverFormulaEnginePlugin } = await import("@univerjs/engine-formula");
      const { UniverSheetsPlugin } = await import("@univerjs/sheets");
      const { UniverSheetsUIPlugin } = await import("@univerjs/sheets-ui");
      const { UniverUIPlugin } = await import("@univerjs/ui");
      const { FUniver } = await import("@univerjs/facade");

      await import("@univerjs/design/lib/index.css");
      await import("@univerjs/ui/lib/index.css");
      await import("@univerjs/sheets-ui/lib/index.css");

      if (isDestroyed) return;

      const univer = new Univer();

      // Order matters: Sheets core must be registered before UI plugins
      univer.registerPlugin(UniverRenderEnginePlugin);
      univer.registerPlugin(UniverFormulaEnginePlugin);
      univer.registerPlugin(UniverSheetsPlugin);
      univer.registerPlugin(UniverUIPlugin, {
        container: containerRef.current!,
        header: true,
        footer: true,
      });
      univer.registerPlugin(UniverSheetsUIPlugin);

      univerRef.current = univer;

      const defaultSheets: Record<string, any> = {};
      const sheetOrder: string[] = [];

      if (workbookData.sheets && workbookData.sheets.length > 0) {
        workbookData.sheets.forEach((s) => {
          defaultSheets[s.id] = {
            id: s.id,
            name: s.name,
            cellData: s.data?.cellData ?? {},
            rowCount: s.data?.rowCount ?? 100,
            columnCount: s.data?.columnCount ?? 20,
          };
          sheetOrder.push(s.id);
        });
      } else {
        defaultSheets["sheet-1"] = {
          id: "sheet-1",
          name: "Sheet 1",
          rowCount: 100,
          columnCount: 20,
          cellData: {},
        };
        sheetOrder.push("sheet-1");
      }

      console.log("[WorkbookEditor] creating workbook, sheets:", sheetOrder.length);

      const instance = univer.createUniverSheet({
        id: workbookData.id || "workbook-default",
        name: workbookData.name || "GenSpec Workbook",
        sheets: defaultSheets,
        sheetOrder,
      });

      console.log("[WorkbookEditor] workbook created:", !!instance);

      workbookInstanceRef.current = instance;

      const fUniver = FUniver.newAPI(univer);
      const activeWorkbook = fUniver.getActiveWorkbook();

      if (activeWorkbook) {
        if (activeSheetId) {
          const targetSheet = activeWorkbook.getSheetBySheetId(activeSheetId);
          if (targetSheet) {
            activeWorkbook.setActiveSheet(targetSheet);
          }
        }

        activeWorkbook.onCommandExecuted(() => {
          const currentSheet = activeWorkbook.getActiveSheet();
          if (currentSheet) {
            onActiveSheetChange(currentSheet.getSheetId());
          }
          const rawData = activeWorkbook.save();
          if (rawData && rawData.sheets) {
            const updatedSheets = Object.keys(rawData.sheets).map((key) => {
              const s = rawData.sheets[key];
              return {
                id: s.id || key,
                name: s.name || "Sheet",
                data: s,
              };
            });
            onDataChange(updatedSheets);
          }
        });

        activeWorkbook.onSelectionChange((selections) => {
          if (selections && selections.length > 0) {
            const range = selections[0];
            onSelectionChange({
              startRow: range.startRow,
              startCol: range.startColumn,
              endRow: range.endRow,
              endCol: range.endColumn,
            });
          }
        });
      }
    }

    initUniver().catch((err) => {
      console.error("[WorkbookEditor] init failed:", err);
    });

    return () => {
      isDestroyed = true;
      if (univerRef.current) {
        try {
          univerRef.current.dispose();
        } catch (_) {}
        univerRef.current = null;
        workbookInstanceRef.current = null;
      }
    };
  }, [workbookData.id]);

  useEffect(() => {
    if (!workbookInstanceRef.current || !univerRef.current) return;
    const { FUniver } = require("@univerjs/facade");
    const fUniver = FUniver.newAPI(univerRef.current);
    const activeWorkbook = fUniver.getActiveWorkbook();
    if (activeWorkbook && activeSheetId) {
      const activeSheet = activeWorkbook.getActiveSheet();
      if (activeSheet && activeSheet.getSheetId() !== activeSheetId) {
        const targetSheet = activeWorkbook.getSheetBySheetId(activeSheetId);
        if (targetSheet) {
          activeWorkbook.setActiveSheet(targetSheet);
        }
      }
    }
  }, [activeSheetId]);

  useEffect(() => {
    if (!workbookInstanceRef.current || !univerRef.current || !findings || findings.length === 0) return;
    const { FUniver } = require("@univerjs/facade");
    const fUniver = FUniver.newAPI(univerRef.current);
    const activeWorkbook = fUniver.getActiveWorkbook();
    if (activeWorkbook) {
      const activeSheet = activeWorkbook.getActiveSheet();
      if (activeSheet) {
        findings.forEach((f) => {
          if (f.sheetId === activeSheet.getSheetId() && f.row != null) {
            try {
              const range = activeSheet.getRange(f.row, 0, 1, 10);
              if (range) {
                range.setBackgroundColor(f.severity === "error" ? "#fecaca" : "#fef3c7");
              }
            } catch (_) {}
          }
        });
      }
    }
  }, [findings, activeSheetId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
