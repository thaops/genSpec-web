"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Action, Estimate } from "@/lib/types";
import { api, ApiError, triggerDownload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n/I18nProvider";
import { useToast } from "@/components/ui/Toast";
import { Button, Spinner } from "@/components/ui/Button";
import {
  SheetTabs,
  type SheetKey,
  type TabKey,
} from "@/components/estimate/SheetTabs";
import { OverviewDashboard } from "@/components/estimate/overview/OverviewDashboard";
import { EditorTopBar } from "@/components/estimate/EditorTopBar";
import {
  CopilotPanel,
  readCopilotCollapsed,
} from "@/components/estimate/CopilotPanel";
import type { CopilotHandle } from "@/components/estimate/Copilot";
import type { SheetProps } from "@/components/estimate/sheets/shell";
import { InfoSheet } from "@/components/estimate/sheets/InfoSheet";
import { TakeoffSheet } from "@/components/estimate/sheets/TakeoffSheet";
import { BoqSheet } from "@/components/estimate/sheets/BoqSheet";
import { AnalysisSheet } from "@/components/estimate/sheets/AnalysisSheet";
import { MaterialsSheet } from "@/components/estimate/sheets/MaterialsSheet";
import { LaborSheet } from "@/components/estimate/sheets/LaborSheet";
import { EquipmentSheet } from "@/components/estimate/sheets/EquipmentSheet";
import { MaterialSummarySheet } from "@/components/estimate/sheets/MaterialSummarySheet";
import { CostSheet } from "@/components/estimate/sheets/CostSheet";
import { takePendingPrompt } from "@/lib/pendingPrompt";

const SHEETS: Record<SheetKey, (p: SheetProps) => React.ReactNode> = {
  info: InfoSheet,
  takeoff: TakeoffSheet,
  boq: BoqSheet,
  analysis: AnalysisSheet,
  materials: MaterialsSheet,
  labor: LaborSheet,
  equipment: EquipmentSheet,
  matSummary: MaterialSummarySheet,
  cost: CostSheet,
};

// A take-off/analysis/resource-empty estimate auto-opens the copilot once.
function isEmpty(e: Estimate): boolean {
  return (
    (e.takeoff?.length ?? 0) === 0 &&
    (e.analyses?.length ?? 0) === 0 &&
    (e.materials?.length ?? 0) === 0
  );
}

export default function EstimateEditorPage() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TabKey>("overview");
  const [exporting, setExporting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const copilotRef = useRef<CopilotHandle>(null);
  const autoSentRef = useRef(false);

  // Hydrate the persisted collapsed state on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readCopilotCollapsed());
  }, []);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    let alive = true;
    api
      .getEstimate(id)
      .then((e) => {
        if (!alive) return;
        setEstimate(e);
        if (isEmpty(e)) setCollapsed(false); // empty → show the panel
      })
      .catch((e: ApiError) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  // Pick up the pending prompt from home → open chat + auto-send.
  useEffect(() => {
    if (!estimate || autoSentRef.current) return;
    const pending = takePendingPrompt(estimate.id);
    if (!pending) return;
    autoSentRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(false); // auto-expand the panel
    const timer = window.setTimeout(() => {
      copilotRef.current?.send(pending.message, pending.files);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [estimate]);

  // Single state updater the AI panel calls after applying a proposal.
  const applyEstimate = (next: Estimate) => setEstimate(next);

  // Every manual edit funnels through here as Action[] (source:'manual').
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
    setEstimate((prev) => (prev ? { ...prev, name } : prev)); // optimistic
    try {
      setEstimate(await api.renameEstimate(id, name));
    } catch {
      /* keep optimistic name; reconciles on next load */
    }
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

  const Sheet = active === "overview" ? null : SHEETS[active as SheetKey];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
      <EditorTopBar
        estimate={estimate}
        onRename={onRename}
        onExport={onExport}
        exporting={exporting}
      />

      <SheetTabs active={active} onSelect={setActive} />

      {/* Main editor (fluid) + docked AI panel (right) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          {Sheet ? (
            <Sheet estimate={estimate} apply={apply} />
          ) : (
            <OverviewDashboard estimate={estimate} />
          )}
        </div>

        <CopilotPanel
          estimate={estimate}
          onEstimateUpdated={applyEstimate}
          controlRef={copilotRef}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
        />
      </div>
    </div>
  );
}
