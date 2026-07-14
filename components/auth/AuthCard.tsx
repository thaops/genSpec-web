import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ScanLine, Coins, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: ScanLine, text: "Nhận diện KT / KC / MEP tự động từ bản vẽ DWG" },
  { icon: Coins, text: "Đơn giá tỉnh có nguồn, truy vết tới từng ô" },
  { icon: ShieldCheck, text: "Engine tính khối lượng — không bịa số" },
];

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
    <div className="flex min-h-screen bg-zinc-950">
      {/* ── Brand panel (trái) — chỉ hiện màn rộng ── */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex">
        {/* Gradient blobs động */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-8 h-80 w-80 rounded-full bg-accent-600/30 blur-3xl animate-blob" />
          <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl animate-blob" style={{ animationDelay: "-5s" }} />
          <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-indigo-600/20 blur-3xl animate-blob" style={{ animationDelay: "-10s" }} />
        </div>
        {/* Lưới blueprint pan nhẹ */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12] animate-grid-pan"
          style={{
            backgroundImage:
              "linear-gradient(rgba(59,130,246,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Fade viền để hoà vào form */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-r from-transparent to-zinc-950" />

        <div className="relative animate-fade-in">
          <Logo className="scale-110" />
        </div>

        <div className="relative max-w-md animate-slide-up">
          <h2 className="text-[2rem] font-bold leading-tight text-white">
            Bóc tách khối lượng &amp;
            <br />
            lập dự toán bằng AI
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Từ bản vẽ DWG → BOQ → dự toán. Đơn giá có nguồn, khối lượng do engine tính —
            AI hỗ trợ, không quyết định thay bạn.
          </p>
          <ul className="mt-7 space-y-3">
            {FEATURES.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-3 text-sm text-zinc-300 animate-slide-up"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent-500/30 bg-accent-500/10 text-accent-300">
                  <f.icon className="h-4 w-4" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-zinc-600">© GenSpec — Cursor cho dự toán</p>
      </div>

      {/* ── Form (phải) ── */}
      <div className="relative flex w-full flex-col items-center justify-center px-4 py-10 lg:w-1/2">
        <div className="absolute right-4 top-4">
          <LanguageToggle />
        </div>

        <div className="w-full max-w-sm animate-slide-up">
          {/* Logo trên mobile */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo className="scale-110" />
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur">
            {children}
          </div>

          <p className="mt-6 text-center text-sm text-zinc-500 lg:text-left">{footer}</p>
        </div>
      </div>
    </div>
  );
}
