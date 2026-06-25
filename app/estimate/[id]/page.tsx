"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Action, Estimate, ReviewFinding, Sheet } from "@/lib/types";
import { api, ApiError, triggerDownload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n/I18nProvider";
import { useToast } from "@/components/ui/Toast";
import { Button, Spinner } from "@/components/ui/Button";
import { EditorTopBar } from "@/components/estimate/EditorTopBar";
import {
  AgentConsole,
  readCopilotCollapsed,
} from "@/components/estimate/AgentConsole";
import type { AgentHandle } from "@/components/estimate/AgentConsole";
import WorkbookEditor from "@/components/estimate/WorkbookEditor";
import { takePendingPrompt } from "@/lib/pendingPrompt";
import { takePendingSheets } from "@/lib/pendingSheets";

export default function EstimateEditorPage() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [renamingSheetId, setRenamingSheetId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [selectedRange, setSelectedRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | undefined>(undefined);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const copilotRef = useRef<AgentHandle>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    setCollapsed(readCopilotCollapsed());
  }, []);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    let alive = true;
    api
      .getEstimate(id)
      .then((fetched) => {
        if (!alive) return;
        let e = fetched;

        // Check for locally-parsed sheets (from Excel import before server sync)
        const pending = takePendingSheets(e.id);
        if (pending) {
          // Inject parsed sheets immediately so the UI shows data right away
          e = { ...e, sheets: pending.sheets };
          // Sync to server in background — don't await, don't block UI
          api.importExcel(e.id, pending.file).catch(() => {/* silent, user already sees data */});
        }

        setEstimate(e);
        if (e.sheets && e.sheets.length > 0) {
          setActiveSheetId(e.sheets[0].id);
        } else {
          setActiveSheetId("");
        }
        if (
          (e.takeoff?.length ?? 0) === 0 &&
          (e.analyses?.length ?? 0) === 0 &&
          (e.materials?.length ?? 0) === 0
        ) {
          setCollapsed(false);
        }
      })
      .catch((e: ApiError) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!estimate || autoSentRef.current) return;
    const pending = takePendingPrompt(estimate.id);
    if (!pending) return;
    autoSentRef.current = true;
    setCollapsed(false);
    const timer = window.setTimeout(() => {
      copilotRef.current?.send(pending.message, pending.files);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [estimate]);

  const applyEstimate = (next: Estimate) => {
    setEstimate(next);
    if (next.sheets && next.sheets.length > 0 && !activeSheetId) {
      setActiveSheetId(next.sheets[0].id);
    }
  };

  async function apply(actions: Action[]) {
    if (!estimate) return;
    try {
      const res = await api.applyActions(estimate.id, actions, "manual");
      setEstimate(res.estimate);
      if (res.warnings?.length) {
        toast.error(t("copilot.failed"), res.warnings.join(", "));
      }
    } catch (err) {
      toast.error(t("copilot.failed"), (err as ApiError).message);
    }
  }

  async function onExport() {
    if (!estimate || exporting) return;
    setExporting(true);
    try {
      const blob = await api.exportF1(estimate.id);
      const safe =
        (estimate.name || "estimate").replace(/[^\w\-]+/g, "_") || "estimate";
      triggerDownload(blob, `${safe}_F1.xlsx`);
    } catch (err) {
      toast.error(t("editor.exportFailed"), (err as ApiError).message);
    } finally {
      setExporting(false);
    }
  }

  async function onRename(name: string) {
    setEstimate((prev) => (prev ? { ...prev, name } : prev));
    try {
      setEstimate(await api.renameEstimate(id, name));
    } catch {}
  }

  function handleAddSheet() {
    if (!estimate) return;
    const numSheets = estimate.sheets?.length ?? 0;
    const newSheet: Sheet = {
      id: `sheet-${Date.now()}`,
      name: `Sheet ${numSheets + 1}`,
      data: { cellData: {}, rowCount: 100, columnCount: 20 },
    };
    const nextSheets = [...(estimate.sheets ?? []), newSheet];
    apply([{ type: "set_sheets", sheets: nextSheets }]);
    setActiveSheetId(newSheet.id);
  }

  function handleDeleteSheet(sheetId: string) {
    if (!estimate) return;
    const nextSheets = (estimate.sheets ?? []).filter((s) => s.id !== sheetId);
    apply([{ type: "set_sheets", sheets: nextSheets }]);
    if (activeSheetId === sheetId) {
      if (nextSheets.length > 0) {
        setActiveSheetId(nextSheets[0].id);
      } else {
        setActiveSheetId("");
      }
    }
  }

  function handleRenameSheet(sheetId: string) {
    if (!estimate || !renameText.trim()) return;
    const nextSheets = (estimate.sheets ?? []).map((s) =>
      s.id === sheetId ? { ...s, name: renameText.trim() } : s
    );
    apply([{ type: "set_sheets", sheets: nextSheets }]);
    setRenamingSheetId(null);
    setRenameText("");
  }

  function handleSelectionChange(range: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }) {
    setSelectedRange(range);
  }

  function handleDataChange(updatedSheets: Sheet[]) {
    apply([{ type: "set_sheets", sheets: updatedSheets }]);
  }

  function handleConfirmSheetType(sheetId: string, sheetType: string) {
    if (!estimate) return;
    const nextSheets = (estimate.sheets ?? []).map((s) =>
      s.id === sheetId
        ? { ...s, metadata: { ...s.metadata, sheetType, confidence: 1.0 } }
        : s
    );
    apply([{ type: "set_sheets", sheets: nextSheets }]);
  }

  function handleFindings(newFindings: ReviewFinding[]) {
    setFindings(newFindings);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-rose-300">{t("editor.loadFailed")}</p>
        <p className="mt-1 text-xs text-zinc-500">{error}</p>
        <Link href="/" className="mt-5 inline-block">
          <Button variant="secondary">{t("editor.backToDashboard")}</Button>
        </Link>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const sheetsList = estimate.sheets ?? [];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
      <EditorTopBar
        estimate={estimate}
        onRename={onRename}
        onExport={onExport}
        exporting={exporting}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Explorer Sidebar */}
        <div className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-900/30 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Explorer
            </span>
            <button
              onClick={handleAddSheet}
              className="text-zinc-500 hover:text-zinc-200 text-xs font-bold"
            >
              + New Sheet
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
            <div className="text-[11px] font-medium text-zinc-600 px-2 py-1 uppercase tracking-wider">
              📁 {estimate.name}
            </div>
            {sheetsList.map((sheet) => (
              <div
                key={sheet.id}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  activeSheetId === sheet.id
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 cursor-pointer"
                }`}
                onClick={() => {
                  if (renamingSheetId !== sheet.id) {
                    setActiveSheetId(sheet.id);
                  }
                }}
              >
                {renamingSheetId === sheet.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => handleRenameSheet(sheet.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSheet(sheet.id);
                      if (e.key === "Escape") setRenamingSheetId(null);
                    }}
                    className="w-full bg-zinc-950 border border-accent-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="truncate flex items-center gap-1.5">
                      <span>📄</span>
                      <span className="truncate">{sheet.name}</span>
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingSheetId(sheet.id);
                          setRenameText(sheet.name);
                        }}
                        className="text-[11px] text-zinc-500 hover:text-zinc-300 px-1"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSheet(sheet.id);
                        }}
                        className="text-[11px] text-zinc-500 hover:text-rose-400 px-1"
                      >
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {sheetsList.length === 0 && (
              <div className="text-xs text-zinc-600 px-2 py-4 text-center">
                No sheets yet
              </div>
            )}
          </div>
        </div>

        {/* Main Area */}
        <div className="min-w-0 flex-1 overflow-hidden relative bg-zinc-950 flex flex-col">
          {activeSheetId ? (
            <>
              {(() => {
                const currentSheet = sheetsList.find((s) => s.id === activeSheetId);
                const sheetType = currentSheet?.metadata?.sheetType || "unknown";
                const confidence = currentSheet?.metadata?.confidence ?? 0;
                const showWarning = sheetType !== "unknown" && confidence > 0 && confidence < 0.9;
                if (!showWarning) return null;
                return (
                  <div className="bg-zinc-900 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                      <span>⚠️</span>
                      <span>
                        Hệ thống nhận diện đây là <strong>{sheetType === "material" ? "Bảng Giá vật tư" : "Bảng BOQ"}</strong> (Độ tin cậy: {Math.round(confidence * 100)}%).
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmSheetType(activeSheetId, sheetType)}
                        className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
                      >
                        Xác nhận
                      </button>
                      <select
                        onChange={(e) => handleConfirmSheetType(activeSheetId, e.target.value)}
                        className="bg-zinc-950 border border-zinc-700 text-zinc-300 rounded px-1.5 py-0.5"
                        defaultValue=""
                      >
                        <option value="" disabled>Thay đổi</option>
                        <option value="boq">Bảng BOQ</option>
                        <option value="material">Bảng Giá vật tư</option>
                        <option value="unknown">Không xác định</option>
                      </select>
                    </div>
                  </div>
                );
              })()}
              <div className="flex-1 min-h-0 relative">
                <WorkbookEditor
                  workbookData={{
                    id: estimate.id,
                    userId: estimate.userId,
                    name: estimate.name,
                    sheets: sheetsList,
                  }}
                  activeSheetId={activeSheetId}
                  onActiveSheetChange={setActiveSheetId}
                  onSelectionChange={handleSelectionChange}
                  onDataChange={handleDataChange}
                  findings={findings}
                />
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 space-y-3">
              <span className="text-4xl">📊</span>
              <p className="text-sm">Create a new sheet or select an existing one to begin</p>
              <Button onClick={handleAddSheet}>Create First Sheet</Button>
            </div>
          )}
        </div>

        {/* AI Sidebar */}
        <AgentConsole
          estimate={estimate}
          onEstimateUpdated={applyEstimate}
          controlRef={copilotRef}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          activeSheetId={activeSheetId}
          selectedRange={selectedRange}
          onFindings={handleFindings}
        />
      </div>
    </div>
  );
}
