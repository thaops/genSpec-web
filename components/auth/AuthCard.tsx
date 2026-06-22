import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="mb-6 scale-110" />
          <h1 className="text-xl font-semibold tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur">
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">{footer}</p>
      </div>
    </div>
  );
}
