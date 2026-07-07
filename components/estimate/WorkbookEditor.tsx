
"use client";

import { useEffect, useRef } from "react";
import type { Sheet, Workbook } from "@/lib/types";
import { useTheme } from "@/lib/theme";

/**
 * Imperative handle the AI agent uses to drive the spreadsheet live —
 * activating sheets, moving the selection and writing cells so the user
 * watches the edit happen instead of getting a silent full reload.
 * Between beginDrive/endDrive the editor suppresses its own persistence
 * (the agent persists once via the actions endpoint).
 */
export interface WorkbookDriver {
  beginDrive: () => void;
  endDrive: () => void;
  /** Returns true when the cell was actually focused (Univer ready + sheet found). */
  focusCell: (sheetId: string, row: number, col: number) => boolean;
  writeCell: (sheetId: string, row: number, col: number, value: string | number) => void;
  flashCell: (sheetId: string, row: number, col: number) => void;
  /** Đổi mức zoom của sheet (1 = 100%). Best-effort — no-op nếu Univer chưa sẵn. */
  zoomTo?: (sheetId: string, ratio: number) => void;
  /**
   * Types the value into the cell in meaningful milestones (Copilot-style).
   * Partial formula milestones are written as raw text ({ v }) so Univer never
   * parses a half-typed formula; only the final milestone is a real setValue.
   * `shouldAbort` is polled between milestones — on abort the full value is
   * written immediately (never leaves a half-typed cell) before returning.
   */
  typeCell: (
    sheetId: string,
    row: number,
    col: number,
    value: string | number,
    opts?: { msPerStep?: number; shouldAbort?: () => boolean }
  ) => Promise<void>;
}

const driveSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Milestones for a formula: break after "(", ")" and operators — e.g.
 *  "=SUM(C2:C28)/1000" → ["=", "=SUM(", "=SUM(C2:C28)", "=SUM(C2:C28)/1000"]. */
function formulaMilestones(formula: string): string[] {
  const marks: string[] = ["="];
  let buf = "";
  for (const ch of formula) {
    buf += ch;
    if ("()+-*/,".includes(ch) && buf.length > 1) marks.push(buf);
  }
  if (marks[marks.length - 1] !== formula) marks.push(formula);
  // Dedupe + cap so pathological formulas can't blow the time budget
  const uniq = [...new Set(marks)];
  if (uniq.length <= 6) return uniq;
  return [...uniq.slice(0, 5), formula];
}

/** Milestones for plain text/number: short values land in one shot,
 *  medium text in 2 steps, long text (>40 chars) in 3 steps. */
function textMilestones(value: string): string[] {
  if (value.length < 6) return [value];
  if (value.length > 40) {
    return [
      value.slice(0, Math.ceil(value.length / 3)),
      value.slice(0, Math.ceil((2 * value.length) / 3)),
      value,
    ];
  }
  return [value.slice(0, Math.ceil(value.length / 2)), value];
}

/** Number of typing milestones typeCell will use — lets callers budget time. */
export function estimateTypeSteps(value: string | number): number {
  const str = String(value);
  return typeof value === "string" && str.startsWith("=")
    ? formulaMilestones(str).length
    : textMilestones(str).length;
}

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
  onSaveStateChange?: (s: "dirty" | "saving" | "saved") => void;
  findings?: any[];
  reinitKey?: number;
  driverRef?: React.MutableRefObject<WorkbookDriver | null>;
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
  onSaveStateChange,
  findings = [],
  reinitKey = 0,
  driverRef,
}: Props) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<any>(null);
  const univerAPIRef = useRef<any>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const themeRef = useRef(theme);
  // Deduplicate: only call onDataChange when cell data actually changes
  const lastCellHashRef = useRef<string>("");
  // Track sheets shown in Univer for diff animation after AI reinit
  const lastSheetsRef = useRef<Sheet[]>([]);
  const dataDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending debounced payload — flushed synchronously on unmount so edits aren't lost
  const pendingSheetsRef = useRef<Sheet[] | null>(null);
  // True while the AI agent is driving edits — suppress self-persistence
  const drivingRef = useRef(false);
  // Keep the latest onDataChange for the beforeunload flush
  const onDataChangeRef = useRef(onDataChange);
  useEffect(() => { onDataChangeRef.current = onDataChange; }, [onDataChange]);

  // Flush pending debounced edits before the tab closes so they aren't lost;
  // the browser prompt is only a safety net after the synchronous flush.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!pendingSheetsRef.current || drivingRef.current) return;
      const pending = pendingSheetsRef.current;
      pendingSheetsRef.current = null;
      if (dataDebounceRef.current) {
        clearTimeout(dataDebounceRef.current);
        dataDebounceRef.current = null;
      }
      onDataChangeRef.current(pending);
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Sheets + style-registry đang hiển thị, để re-apply màu khi đổi sheet (Explorer).
  const styledSheetsRef = useRef<Sheet[]>([]);
  const collectedStylesRef = useRef<Record<string, any>>({});

  /**
   * Ép áp inline cell-style (nền/chữ/đậm) vào Univer qua Facade — Univer không tự
   * render cellData.s khi import/đổi sheet → phải set tay để hiện màu. onlySheetId
   * để re-apply đúng 1 sheet khi user chuyển tab. drivingRef chặn auto-save.
   */
  function applyInlineStyles(onlySheetId?: string) {
    const wb = univerAPIRef.current?.getActiveWorkbook?.();
    if (!wb) return;
    const prevDriving = drivingRef.current;
    drivingRef.current = true;
    try {
      for (const s of styledSheetsRef.current) {
        if (onlySheetId && s.id !== onlySheetId) continue;
        const ws = wb.getSheetBySheetId?.(s.id);
        if (!ws) continue;
        const cd = (s.data?.cellData ?? {}) as Record<string, Record<string, any>>;
        for (const [rStr, cols] of Object.entries(cd)) {
          for (const [cStr, cell] of Object.entries(cols)) {
            let st = (cell as any)?.s;
            if (typeof st === "string") st = collectedStylesRef.current[st];
            if (!st || typeof st !== "object") continue;
            try {
              const range = ws.getRange?.(Number(rStr), Number(cStr), 1, 1);
              if (!range) continue;
              if (st.bg?.rgb) range.setBackgroundColor(st.bg.rgb);
              if (st.cl?.rgb) range.setFontColor(st.cl.rgb);
              if (st.bl) range.setFontWeight?.("bold");
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      console.warn("[WorkbookEditor] applyInlineStyles failed", e);
    } finally {
      drivingRef.current = prevDriving;
    }
  }

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

  // Univer cell canvas stays light (gray-50) in both themes → cell text is dark,
  // so agent highlights must be LIGHT tints. Slightly stronger in dark for parity.
  function agentFlashColor(): string {
    return themeRef.current === "dark" ? "#93c5fd" : "#bfdbfe";
  }

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

      // Collect workbook-level styles stored on the first sheet after import
      const collectedStyles: Record<string, any> = {};
      for (const s of (workbookData.sheets ?? [])) {
        if (s.data?._styles) Object.assign(collectedStyles, s.data._styles);
      }

      // Build sheets — spread full Univer sheet data so columnData/rowData/mergeData survive reload
      const sheets: Record<string, any> = {};
      const sheetOrder: string[] = [];

      if (workbookData.sheets && workbookData.sheets.length > 0) {
        for (const s of workbookData.sheets) {
          const { _styles, ...univerSheetData } = s.data ?? {};
          void _styles; // collected above, don't pass into Univer sheet config
          sheets[s.id] = {
            ...univerSheetData,
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
        styles: collectedStyles,
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

      // Ép áp inline cell-style (nền/chữ/đậm) qua Facade API — Univer không render
      // cellData.s khi import → "mất màu khi load/chuyển tab". Re-apply đảm bảo màu.
      styledSheetsRef.current = workbookData.sheets ?? [];
      collectedStylesRef.current = collectedStyles;
      applyInlineStyles();

      // Highlight cells that changed vs previous Univer snapshot (AI edit animation)
      const prevSheets = lastSheetsRef.current;
      if (prevSheets.length > 0) {
        const newSheets = workbookData.sheets ?? [];
        const changedCells: Array<{ sheetId: string; row: number; col: number }> = [];
        for (const newSheet of newSheets) {
          const oldSheet = prevSheets.find((s) => s.id === newSheet.id);
          if (!oldSheet) continue;
          const oldCells = (oldSheet.data?.cellData ?? {}) as Record<string, Record<string, any>>;
          const newCells = (newSheet.data?.cellData ?? {}) as Record<string, Record<string, any>>;
          for (const [rowStr, cols] of Object.entries(newCells)) {
            const oldRow = oldCells[rowStr] ?? {};
            for (const [colStr, cell] of Object.entries(cols)) {
              if ((cell as any)?.v !== oldRow[colStr]?.v) {
                changedCells.push({ sheetId: newSheet.id, row: Number(rowStr), col: Number(colStr) });
              }
            }
          }
        }
        if (changedCells.length > 0) {
          for (const { sheetId, row, col } of changedCells) {
            const univSheet = wb.getSheetBySheetId?.(sheetId);
            if (!univSheet) continue;
            try {
              univSheet.getRange?.(row, col, 1, 1)?.setBackgroundColor(agentFlashColor());
              setTimeout(() => {
                try { univSheet.getRange?.(row, col, 1, 1)?.setBackgroundColor(""); } catch (_) {}
              }, 1500);
            } catch (_) {}
          }
        }
      }
      lastSheetsRef.current = workbookData.sheets ?? [];

      wb.onCommandExecuted((command: any) => {
        // Agent-driven writes are persisted once via the actions endpoint —
        // skip the editor's own save path to avoid double-posting.
        if (drivingRef.current) return;
        const cur = wb.getActiveSheet();
        if (cur) onActiveSheetChange(cur.getSheetId());

        // Skip the expensive wb.save()+stringify for commands that can't
        // mutate cell data (selection/scroll/hover spam while typing).
        // CommandType.OPERATION === 1 (UI-only); mutations/commands fall through.
        const cmdId: string = command?.id ?? "";
        if (/selection|scroll|hover|active-operation|set-zoom/i.test(cmdId)) return;
        if (typeof command?.type === "number" && command.type === 1) return;

        const raw = wb.save() as any;
        if (!raw?.sheets) return;
        // Persist workbook-level styles in first sheet so they survive save/load cycle
        const sheetKeys = Object.keys(raw.sheets);
        if (sheetKeys.length > 0 && raw.styles && Object.keys(raw.styles).length > 0) {
          raw.sheets[sheetKeys[0]]._styles = raw.styles;
        }
        const updated: Sheet[] = sheetKeys.map((key) => {
          const s = raw.sheets[key];
          return { id: s.id || key, name: s.name || "Sheet", data: s };
        });

        // Only save if cell data actually changed (skip scroll/selection commands)
        const hash = JSON.stringify(updated.map((s) => s.data?.cellData ?? {}));
        if (hash === lastCellHashRef.current) return;
        lastCellHashRef.current = hash;
        lastSheetsRef.current = updated; // track what's shown in Univer

        // Debounce rapid keystrokes — flush after 700ms of inactivity
        onSaveStateChange?.("dirty");
        pendingSheetsRef.current = updated;
        if (dataDebounceRef.current) clearTimeout(dataDebounceRef.current);
        dataDebounceRef.current = setTimeout(() => {
          pendingSheetsRef.current = null;
          onDataChange(updated);
          dataDebounceRef.current = null;
        }, 700);
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
      if (dataDebounceRef.current) {
        clearTimeout(dataDebounceRef.current);
        dataDebounceRef.current = null;
      }
      // Flush pending edits synchronously so they aren't silently lost.
      // Skip while the agent is driving: the pending snapshot predates the
      // AI's writes and would overwrite them with stale data (the drive
      // persists once via the actions endpoint anyway).
      if (pendingSheetsRef.current && !drivingRef.current) {
        const pending = pendingSheetsRef.current;
        pendingSheetsRef.current = null;
        onDataChange(pending);
      }
      pendingSheetsRef.current = null;
      try { univerRef.current?.dispose(); } catch (_) { }
      univerRef.current = null;
      univerAPIRef.current = null;
    };
  }, [workbookData.id, reinitKey]);

  // Expose the agent driver handle (re-assigned every render; refs stay stable)
  useEffect(() => {
    if (!driverRef) return;
    const getSheet = (sheetId: string) => {
      const wb = univerAPIRef.current?.getActiveWorkbook?.();
      if (!wb) return null;
      const sheet = wb.getSheetBySheetId?.(sheetId);
      if (!sheet) return null;
      if (wb.getActiveSheet?.()?.getSheetId?.() !== sheetId) wb.setActiveSheet(sheet);
      return sheet;
    };
    driverRef.current = {
      beginDrive: () => {
        // Flush any user edits queued before the drive — persist them now so
        // the snapshot (which predates the AI's writes) can never be flushed
        // later and overwrite what the AI wrote.
        if (dataDebounceRef.current) {
          clearTimeout(dataDebounceRef.current);
          dataDebounceRef.current = null;
        }
        if (pendingSheetsRef.current) {
          const pending = pendingSheetsRef.current;
          pendingSheetsRef.current = null;
          onDataChange(pending);
        }
        drivingRef.current = true;
      },
      endDrive: () => {
        drivingRef.current = false;
        // Resync the change hash so the debounced save doesn't re-post AI writes
        const wb = univerAPIRef.current?.getActiveWorkbook?.();
        const raw = wb?.save?.() as any;
        if (raw?.sheets) {
          const updated: Sheet[] = Object.keys(raw.sheets).map((key) => {
            const s = raw.sheets[key];
            return { id: s.id || key, name: s.name || "Sheet", data: s };
          });
          lastCellHashRef.current = JSON.stringify(updated.map((s) => s.data?.cellData ?? {}));
          lastSheetsRef.current = updated;
        }
      },
      focusCell: (sheetId, row, col) => {
        try {
          const range = getSheet(sheetId)?.getRange?.(row, col, 1, 1);
          if (!range) return false;
          range.activate?.();
          return true;
        } catch (_) {
          return false;
        }
      },
      writeCell: (sheetId, row, col, value) => {
        try {
          getSheet(sheetId)?.getRange?.(row, col, 1, 1)?.setValue?.(value);
        } catch (_) {}
      },
      typeCell: async (sheetId, row, col, value, opts) => {
        const msPerStep = opts?.msPerStep ?? 90;
        let range: any = null;
        try {
          range = getSheet(sheetId)?.getRange?.(row, col, 1, 1);
        } catch (_) {}
        if (!range) return;
        const setFinal = () => {
          try { range.setValue?.(value); } catch (_) {}
        };
        const str = String(value);
        const isFormula = typeof value === "string" && str.startsWith("=");
        const steps = isFormula ? formulaMilestones(str) : textMilestones(str);
        for (let i = 0; i < steps.length - 1; i++) {
          if (opts?.shouldAbort?.()) {
            setFinal();
            return;
          }
          try {
            // Partial formula as raw text via ICellData — never formula-parsed
            if (isFormula) range.setValue?.({ v: steps[i] });
            else range.setValue?.(steps[i]);
          } catch (_) {}
          await driveSleep(msPerStep);
        }
        setFinal();
      },
      flashCell: (sheetId, row, col) => {
        try {
          const range = getSheet(sheetId)?.getRange?.(row, col, 1, 1);
          range?.setBackgroundColor?.(agentFlashColor());
          setTimeout(() => {
            try { range?.setBackgroundColor?.(""); } catch (_) {}
          }, 1200);
        } catch (_) {}
      },
      zoomTo: (sheetId, ratio) => {
        try {
          const sheet = getSheet(sheetId);
          // Univer facade FWorksheet: zoom(ratio) hoặc setZoomRatio tuỳ bản.
          (sheet as any)?.zoom?.(ratio) ?? (sheet as any)?.setZoomRatio?.(ratio);
        } catch (_) {}
      },
    };
    return () => {
      driverRef.current = null;
    };
  }, [driverRef, reinitKey, workbookData.id]);

  useEffect(() => {
    const wb = univerAPIRef.current?.getActiveWorkbook?.();
    if (!wb || !activeSheetId) return;
    const cur = wb.getActiveSheet?.();
    if (cur?.getSheetId() !== activeSheetId) {
      const target = wb.getSheetBySheetId?.(activeSheetId);
      if (target) wb.setActiveSheet(target);
    }
    // Re-apply màu cho sheet vừa chuyển tới (Explorer → sheet làm mất màu vì
    // Univer render lại sheet từ cellData không kèm style).
    applyInlineStyles(activeSheetId);
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
