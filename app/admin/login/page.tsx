"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { saveSession, getToken } from "@/lib/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Đã có session admin → vào portal luôn.
  useEffect(() => {
    if (getToken("admin")) router.replace("/admin");
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // BE (`/auth/admin/login`) chỉ cấp token cho account role admin —
      // FE không tự phán quyền, chỉ lưu vào session admin.
      const res = await api.adminLogin({ email, password });
      saveSession(res.accessToken, res.user, "admin");
      router.replace("/admin");
    } catch (err) {
      setError((err as ApiError).message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-100">
            GenSpec Admin
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Operations Portal — chỉ dành cho tài khoản admin
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur">
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              id="admin-email"
              type="email"
              label="Email admin"
              placeholder="admin@genspec.vn"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              id="admin-password"
              type="password"
              label="Mật khẩu"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error ?? undefined}
            />
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Đăng nhập
            </Button>
          </form>
        </div>

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Đăng nhập người dùng
        </Link>
      </div>
    </div>
  );
}
