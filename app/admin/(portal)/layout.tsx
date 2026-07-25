"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAdminAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Cpu, ScrollText, ArrowLeft, LogOut, Package } from "lucide-react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/plans", label: "Gói dịch vụ", icon: Package },
  { href: "/admin/ai-usage", label: "AI Usage", icon: Cpu },
  { href: "/admin/audit-logs", label: "Audit Log", icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, ready, isAuthenticated, signOut } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/admin/login");
    }
  }, [ready, isAuthenticated, user, router]);

  if (!ready || !isAuthenticated || user?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 py-4">
        <div className="px-4 pb-4">
          <p className="text-sm font-semibold text-zinc-100">GenSpec Admin</p>
          <p className="text-[11px] text-zinc-500">Operations Portal</p>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent-500/15 text-accent-300"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-zinc-800 px-2 pt-3">
          {/* Tab mới: workspace là session khác, không nên rời portal. */}
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Về workspace
          </Link>
          <button
            type="button"
            onClick={() => {
              signOut();
              router.replace("/admin/login");
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-rose-300"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
