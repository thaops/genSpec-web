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
      const { Univer, UniverInstanceType } = await import("@univerjs/core");
      const { UniverDesignPlugin } = await import("@univerjs/design");
      const { UniverEngineRenderPlugin } = await import("@univerjs/engine-render");
      const { UniverEngineFormulaPlugin } = await import("@univerjs/engine-formula");
      const { UniverSheetsPlugin } = await import("@univerjs/sheets");
      const { UniverSheetsUIPlugin } = await import("@univerjs/sheets-ui");
      const { UniverUIPlugin } = await import("@univerjs/ui");
      const { FUniver } = await import("@univerjs/facade");

      await import("@univerjs/design/lib/index.css");
      await import("@univerjs/ui/lib/index.css");
      await import("@univerjs/sheets-ui/lib/index.css");

      if (isDestroyed) return;

      const univer = new Univer({
        theme: "dark",
      });

      univer.registerPlugin(UniverDesignPlugin);
      univer.registerPlugin(UniverEngineRenderPlugin);
      univer.registerPlugin(UniverEngineFormulaPlugin);
      univer.registerPlugin(UniverUIPlugin, {
        container: containerRef.current!,
        header: true,
        footer: true,
        sidebar: false,
      });
      univer.registerPlugin(UniverSheetsPlugin);
      univer.registerPlugin(UniverSheetsUIPlugin);

      univerRef.current = univer;

      const defaultSheets: Record<string, any> = {};
      if (workbookData.sheets && workbookData.sheets.length > 0) {
        workbookData.sheets.forEach((s) => {
          defaultSheets[s.id] = {
            id: s.id,
            name: s.name,
            cellData: s.data?.cellData ?? {},
            rowCount: s.data?.rowCount ?? 100,
            columnCount: s.data?.columnCount ?? 20,
          };
        });
      } else {
        defaultSheets["sheet-1"] = {
          id: "sheet-1",
          name: "Sheet 1",
          rowCount: 100,
          columnCount: 20,
          cellData: {},
        };
      }

      const instance = univer.createUniverInstance({
        id: workbookData.id || "workbook-default",
        type: UniverInstanceType.UNIVER_SHEET,
        name: workbookData.name || "GenSpec Workbook",
        sheets: defaultSheets,
      });

      workbookInstanceRef.current = instance;

      const fUniver = FUniver.newAPI(univer);
      const activeWorkbook = fUniver.getActiveWorkbook();

      if (activeWorkbook) {
        if (activeSheetId) {
          const targetSheet = activeWorkbook.getSheetById(activeSheetId);
          if (targetSheet) {
            activeWorkbook.setActiveSheet(targetSheet);
          }
        }

        activeWorkbook.onSheetActiveChanged((sheet) => {
          if (sheet) {
            onActiveSheetChange(sheet.getSheetId());
          }
        });

        activeWorkbook.onSelectionChanged((selections) => {
          if (selections && selections.length > 0) {
            const range = selections[0].range;
            onSelectionChange({
              startRow: range.startRow,
              startCol: range.startColumn,
              endRow: range.endRow,
              endCol: range.endColumn,
            });
          }
        });

        activeWorkbook.onValueChange(() => {
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
      }
    }

    initUniver();

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
        const targetSheet = activeWorkbook.getSheetById(activeSheetId);
        if (targetSheet) {
          activeWorkbook.setActiveSheet(targetSheet);
        }
      }
    }
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
