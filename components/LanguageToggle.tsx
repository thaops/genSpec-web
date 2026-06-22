"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const LABEL: Record<Locale, string> = { vi: "VI", en: "EN" };

export function LanguageToggle() {
  const { locale, setLocale, t } = useT();
  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className="flex items-center rounded-full border border-zinc-800 bg-zinc-900/60 p-0.5"
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-accent-500/15 text-accent-200 ring-1 ring-inset ring-accent-500/30"
                : "text-zinc-500 hover:text-zinc-200"
            )}
          >
            {LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}
