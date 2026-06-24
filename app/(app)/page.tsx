"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TKey } from "@/lib/i18n/dictionaries";
import { setPendingPrompt } from "@/lib/pendingPrompt";
import { HomeComposer } from "@/components/home/HomeComposer";
import { NewProjectModal } from "@/components/home/NewProjectModal";
import { SparkleIcon } from "@/components/ui/icons";

const SUGGESTIONS: TKey[] = [
  "home.suggest1",
  "home.suggest2",
  "home.suggest3",
  "home.suggest4",
];

// Derive a readable project name from the first message.
function deriveName(message: string, fallback: string): string {
  const firstSentence = message.split(/[.\n!?]/)[0].trim() || message.trim();
  const trimmed = firstSentence.slice(0, 60).trim();
  return trimmed || fallback;
}

export default function HomePage() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  async function createProject(name: string, file: File | null) {
    if (creating) return;
    setCreating(true);
    try {
      const est = await api.createEstimate(name || t("home.defaultName"));
      if (file) {
        await api.importExcel(est.id, file);
      }
      router.push(`/estimate/${est.id}`);
    } catch (err) {
      toast.error(t("dashboard.createFailed"), (err as ApiError).message);
      setCreating(false);
      setModalOpen(false);
    }
  }

  async function start(message: string, files: File[]) {
    if (creating) return;
    if (!message.trim() && files.length === 0) return;
    setCreating(true);
    try {
      const name = deriveName(message, t("home.defaultName"));
      const est = await api.createEstimate(name);
      // Stash the first message + files so the editor auto-sends them.
      setPendingPrompt({ estimateId: est.id, message, files });
      router.push(`/estimate/${est.id}`);
    } catch (err) {
      toast.error(t("dashboard.createFailed"), (err as ApiError).message);
      setCreating(false);
    }
  }

  return (
    <>
    <NewProjectModal
      open={modalOpen}
      loading={creating}
      onClose={() => setModalOpen(false)}
      onSubmit={createProject}
    />
    <div className="flex min-h-[70vh] flex-col justify-center">
      <div className="animate-slide-up mx-auto w-full max-w-2xl">
        <div className="mb-7 text-center">
          <span className="animate-float-glow mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500/20 to-accent-600/10 text-accent-300 ring-1 ring-inset ring-accent-500/25">
            <SparkleIcon className="h-6 w-6" />
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-[2rem]">
            {t("home.heading")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-zinc-500">
            {t("home.subheading")}
          </p>
        </div>

        <HomeComposer onSubmit={start} loading={creating} />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {SUGGESTIONS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={creating}
              onClick={() => start(t(key), [])}
              className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3.5 py-1.5 text-[12.5px] text-zinc-400 transition-all hover:-translate-y-px hover:border-accent-500/40 hover:bg-accent-500/10 hover:text-accent-200 disabled:opacity-50"
            >
              {t(key)}
            </button>
          ))}
          <button
            type="button"
            disabled={creating}
            onClick={() => setModalOpen(true)}
            className="rounded-full border border-emerald-800/60 bg-emerald-900/20 px-3.5 py-1.5 text-[12.5px] text-emerald-400 transition-all hover:-translate-y-px hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-50"
          >
            📥 {t("home.newProject")}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
