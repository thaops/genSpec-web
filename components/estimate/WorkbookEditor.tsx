
"use client";

import { useEffect, useRef } from "react";
import type { Sheet, Workbook } from "@/lib/types";
import { useTheme } from "@/lib/theme";

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

// Both modes keep 50=lightest → 900=darkest (Univer's expected direction).
// Dark: navy palette where toolbar bg is gray-800/900 (very dark).
// Light: steel-blue light palette where tab bg is gray-50 (very light steel blue).
const UNIVER_COLORS = {
  dark: {
    gray: {
      50: "#f3f6fb", 100: "#e6edf7", 200: "#cdd8e8", 300: "#aebacd",
      400: "#8a99b0", 500: "#6b7d99", 600: "#475a78", 700: "#2a3a57",
      800: "#1b2740", 900: "#111a2e",
    },
  },
  light: {
    gray: {
      50: "#f0f4fb", 100: "#e4ecf7", 200: "#d0dced", 300: "#b2c4dc",
      400: "#7e99bb", 500: "#5c7899", 600: "#435878", 700: "#2a3f60",
      800: "#1a2e4a", 900: "#111a2e",
    },
  },
} as const;

export default function WorkbookEditor({
  workbookData,
  activeSheetId,
  onActiveSheetChange,
  onSelectionChange,
  onDataChange,
  findings = [],
}: Props) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<any>(null);
  const univerAPIRef = useRef<any>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const themeRef = useRef(theme);

  // isDark can be explicitly passed (effect ordering fix: child effects run BEFORE
  // parent ThemeProvider updates html class, so reading classList here would be stale).
  function applyUniverColors(isDark?: boolean) {
    const root = document.documentElement;
    const dark = isDark !== undefined ? isDark : !root.classList.contains("light");
    const { gray } = UNIVER_COLORS[dark ? "dark" : "light"];
    for (const [n, v] of Object.entries(gray)) {
      root.style.setProperty(`--univer-gray-${n}`, v);
    }
    root.style.setProperty("--univer-primary-400", "#22d3ee");
    root.style.setProperty("--univer-primary-500", "#3b82f6");
    root.style.setProperty("--univer-primary-600", "#2563eb");
  }

  // Keep themeRef in sync so MutationObserver callback always has correct value
  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Re-apply when app theme changes — pass isDark explicitly (don't read classList here)
  useEffect(() => {
    if (!univerAPIRef.current) return;
    const isDark = theme === "dark";
    univerAPIRef.current.toggleDarkMode(isDark);
    applyUniverColors(isDark);
    const raf = requestAnimationFrame(() => applyUniverColors(isDark));
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let destroyed = false;

    async function init() {
      const { createUniver, LocaleType } = await import("@univerjs/presets");
      const { UniverSheetsCorePreset } = await import("@univerjs/preset-sheets-core");
      await import("@univerjs/preset-sheets-core/lib/index.css");
      const enUS = (await import("@univerjs/preset-sheets-core/locales/en-US")).default;

      if (destroyed || !containerRef.current) return;

      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: enUS },
        presets: [UniverSheetsCorePreset({ container: containerRef.current })],
      });

      univerRef.current = univer;
      univerAPIRef.current = univerAPI;

      const initIsDark = themeRef.current === "dark";
      univerAPI.toggleDarkMode(initIsDark);

      // Watch <head> for Univer's injectThemeToHead() and re-override immediately.
      observerRef.current = new MutationObserver(() => {
        applyUniverColors(themeRef.current === "dark");
      });
      observerRef.current.observe(document.head, { childList: true });

      // Apply now (before Univer's useLayoutEffect) and after (after it fires)
      applyUniverColors(initIsDark);
      requestAnimationFrame(() => applyUniverColors(themeRef.current === "dark"));

      // Build sheets
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

      // Re-apply after workbook creation (may trigger another theme injection)
      requestAnimationFrame(() => applyUniverColors(themeRef.current === "dark"));

      const wb = univerAPI.getActiveWorkbook();
      if (!wb) return;

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
      observerRef.current?.disconnect();
      observerRef.current = null;
      try { univerRef.current?.dispose(); } catch (_) { }
      univerRef.current = null;
      univerAPIRef.current = null;
    };
  }, [workbookData.id]);

  useEffect(() => {
    const wb = univerAPIRef.current?.getActiveWorkbook?.();
    if (!wb || !activeSheetId) return;
    const cur = wb.getActiveSheet?.();
    if (cur?.getSheetId() !== activeSheetId) {
      const target = wb.getSheetBySheetId?.(activeSheetId);
      if (target) wb.setActiveSheet(target);
    }
  }, [activeSheetId]);

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
        } catch (_) { }
      }
    }
  }, [findings, activeSheetId]);

  return (
    <div className="relative h-full w-full overflow-hidden border-t border-zinc-800">
      <div ref={containerRef} data-univer className="absolute inset-0" />
    </div>
  );
}
