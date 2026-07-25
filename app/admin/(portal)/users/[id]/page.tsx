"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/admin-api";
import type {
  AdminUserDetail,
  Plan,
  QuotaStateItem,
  SubscriptionStatus,
  UserStatus,
} from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, Spinner } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ReasonDialog } from "@/components/admin/ReasonDialog";
import { ArrowLeft, KeyRound, LogOut, Plus, RotateCcw } from "lucide-react";

const WINDOW_LABEL: Record<string, string> = {
  hour: "mỗi giờ",
  "4h": "mỗi 4 giờ",
  day: "mỗi ngày",
  week: "mỗi tuần",
  month: "mỗi tháng",
};

const STATUS_TONE: Record<string, "emerald" | "amber" | "rose" | "zinc"> = {
  ACTIVE: "emerald",
  LIFETIME: "emerald",
  TRIAL: "sky" as never,
  SUSPENDED: "rose",
  BANNED: "rose",
  DISABLED: "amber",
  EXPIRED: "amber",
  CANCELLED: "zinc",
};

function fmtNum(n: number | null | undefined) {
  if (n === null) return "∞";
  if (n === undefined) return "—";
  return n.toLocaleString("vi-VN");
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Thanh quota: chỉ hiện số THẬT, không suy diễn. */
function QuotaBar({ item }: { item: QuotaStateItem }) {
  const cap = item.limit === null ? null : item.limit + item.adjusted;
  const pct = cap && cap > 0 ? Math.min(100, (item.used / cap) * 100) : 0;
  const danger = pct >= 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-zinc-300">
          {item.metric} <span className="text-zinc-500">· {WINDOW_LABEL[item.window]}</span>
        </span>
        <span className={danger ? "text-rose-400" : "text-zinc-400"}>
          {fmtNum(item.used)} / {fmtNum(cap)}
          {item.adjusted !== 0 && (
            <span className="ml-1 text-accent-300">
              ({item.adjusted > 0 ? "+" : ""}
              {fmtNum(item.adjusted)})
            </span>
          )}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={danger ? "h-full bg-rose-500" : "h-full bg-accent-500"}
          style={{ width: `${item.limit === null ? 0 : pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">reset {fmtDate(item.resetAt)}</p>
    </div>
  );
}

type DialogKind =
  | { kind: "force-logout" }
  | { kind: "reset-password" }
  | { kind: "status"; status: UserStatus }
  | { kind: "sub-status"; status: SubscriptionStatus }
  | { kind: "change-plan" }
  | { kind: "extend" }
  | { kind: "quota-adjust"; item: QuotaStateItem }
  | { kind: "quota-reset"; item: QuotaStateItem }
  | null;

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogKind>(null);

  // Field phụ của dialog
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("30");
  const [amount, setAmount] = useState("10000");

  const load = useCallback(async () => {
    try {
      setData(await adminApi.userDetail(id));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
    // Gói chỉ super_admin đọc được → admin thường vẫn xem được trang này,
    // chỉ là không đổi gói. Không coi lỗi này là lỗi trang.
    adminApi.listPlans().then(setPlans).catch(() => setPlans([]));
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6 text-zinc-500" />
      </div>
    );
  }
  if (!data) {
    return <div className="p-8 text-sm text-zinc-400">Không tìm thấy user.</div>;
  }

  const { user, subscription, entitlement, quota, aiUsage, quotaAdjustments } = data;

  async function run(fn: () => Promise<unknown>, ok: string) {
    await fn();
    toast.success(ok);
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Danh sách user
      </Link>

      {/* ── Account ── */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {user.name}
              <Badge tone={STATUS_TONE[user.status] ?? "zinc"}>{user.status}</Badge>
              <Badge tone={user.role === "user" ? "zinc" : "accent"}>{user.role}</Badge>
            </span>
          }
          subtitle={`${user.email} · tạo ${fmtDate(user.createdAt)} · đăng nhập gần nhất ${fmtDate(user.lastLoginAt)}`}
        />
        <CardBody className="flex flex-wrap gap-2">
          <Select
            aria-label="Trạng thái account"
            className="max-w-[180px]"
            value={user.status}
            options={(["ACTIVE", "DISABLED", "BANNED", "DELETED"] as UserStatus[]).map((s) => ({
              value: s,
              label: s,
            }))}
            onChange={(e) => setDialog({ kind: "status", status: e.target.value as UserStatus })}
          />
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<LogOut className="h-3.5 w-3.5" />}
            onClick={() => setDialog({ kind: "force-logout" })}
          >
            Force logout ({user.tokenVersion})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<KeyRound className="h-3.5 w-3.5" />}
            onClick={() => setDialog({ kind: "reset-password" })}
          >
            Reset mật khẩu
          </Button>
          {user.mustChangePassword && <Badge tone="amber">phải đổi mật khẩu</Badge>}
        </CardBody>
      </Card>

      {/* ── Gói ── */}
      <Card>
        <CardHeader
          title="Gói dịch vụ"
          subtitle={
            subscription
              ? `${subscription.planName ?? subscription.planSlug} · hết hạn ${fmtDate(subscription.endAt)}`
              : "Chưa có subscription — đang áp gói free"
          }
          action={
            <Badge tone={STATUS_TONE[entitlement.subscriptionStatus] ?? "zinc"}>
              {entitlement.subscriptionStatus}
            </Badge>
          }
        />
        <CardBody className="space-y-3">
          {entitlement.denyAll && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              Đang bị chặn toàn bộ ({entitlement.reason})
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={plans.length === 0}
              onClick={() => {
                setPlanId(plans[0]?.id ?? "");
                setDialog({ kind: "change-plan" });
              }}
            >
              Đổi gói
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "extend" })}>
              Gia hạn
            </Button>
            {(["SUSPENDED", "ACTIVE", "CANCELLED", "LIFETIME"] as SubscriptionStatus[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === "SUSPENDED" ? "danger" : "ghost"}
                onClick={() => setDialog({ kind: "sub-status", status: s })}
              >
                {s}
              </Button>
            ))}
          </div>
          {plans.length === 0 && (
            <p className="text-[11px] text-zinc-500">
              Không đọc được danh sách gói — cần quyền <code>admin.plans</code> (super_admin).
            </p>
          )}

          <div className="grid gap-2 pt-2 text-xs sm:grid-cols-3">
            {Object.entries(entitlement.limits).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-zinc-800 px-3 py-2">
                <p className="text-zinc-500">{k}</p>
                <p className="font-medium text-zinc-200">
                  {k === "storage.bytes" || k === "upload.maxBytes"
                    ? v === null
                      ? "∞"
                      : `${Math.round(Number(v) / 1048576)} MB`
                    : fmtNum(v)}
                </p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ── Quota ── */}
      <Card>
        <CardHeader
          title="Quota"
          subtitle={
            quota.length === 0
              ? "Gói này không giới hạn quota (hoặc đang bị chặn toàn bộ)"
              : "Số liệu lấy từ counter thật, không ước lượng"
          }
        />
        <CardBody className="space-y-4">
          {quota.map((item) => (
            <div key={`${item.metric}-${item.window}`} className="space-y-2">
              <QuotaBar item={item} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Plus className="h-3 w-3" />}
                  onClick={() => {
                    setAmount("10000");
                    setDialog({ kind: "quota-adjust", item });
                  }}
                >
                  Cấp thêm / trừ
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<RotateCcw className="h-3 w-3" />}
                  onClick={() => setDialog({ kind: "quota-reset", item })}
                >
                  Reset
                </Button>
              </div>
            </div>
          ))}

          <div className="border-t border-zinc-800 pt-3 text-xs text-zinc-400">
            <p className="mb-1 font-medium text-zinc-300">Token AI đã tiêu (toàn thời gian)</p>
            <p>
              {fmtNum(aiUsage?.totals?.totalTokens)} token · {fmtNum(aiUsage?.totals?.requests)}{" "}
              request ·{" "}
              {aiUsage?.totals?.costUsd !== undefined
                ? `$${Number(aiUsage.totals.costUsd).toFixed(4)}`
                : "—"}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* ── Ledger + history ── */}
      <Card>
        <CardHeader title="Lịch sử can thiệp" subtitle="Ai làm gì, lúc nào, vì sao" />
        <CardBody className="space-y-2 text-xs">
          {quotaAdjustments.length === 0 && (subscription?.history?.length ?? 0) === 0 && (
            <p className="text-zinc-500">Chưa có can thiệp nào.</p>
          )}
          {quotaAdjustments.map((a) => (
            <div key={a._id} className="flex gap-3 border-b border-zinc-800/60 pb-2">
              <Badge tone={a.kind === "deduct" ? "rose" : a.kind === "reset" ? "amber" : "emerald"}>
                {a.kind}
              </Badge>
              <span className="text-zinc-300">
                {a.metric} {a.window ? `· ${WINDOW_LABEL[a.window]}` : ""}{" "}
                <b>{a.delta > 0 ? `+${fmtNum(a.delta)}` : fmtNum(a.delta)}</b>
              </span>
              <span className="ml-auto text-zinc-500">{a.reason}</span>
            </div>
          ))}
          {subscription?.history?.slice().reverse().map((h, i) => (
            <div key={i} className="flex gap-3 border-b border-zinc-800/60 pb-2">
              <Badge tone="zinc">{h.action}</Badge>
              <span className="text-zinc-400">{fmtDate(h.at)}</span>
              {h.source && <span className="text-zinc-500">via {h.source}</span>}
              <span className="ml-auto text-zinc-500">{h.reason ?? "—"}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* ── Dialogs ── */}
      <ReasonDialog
        open={dialog?.kind === "force-logout"}
        title="Đăng xuất mọi thiết bị"
        description="Mọi token đang dùng của user sẽ hết hiệu lực ngay."
        onClose={() => setDialog(null)}
        onConfirm={(r) => run(() => adminApi.forceLogout(id, r), "Đã đăng xuất mọi thiết bị")}
      />

      <ReasonDialog
        open={dialog?.kind === "reset-password"}
        title="Reset mật khẩu"
        description="Mật khẩu tạm chỉ hiện MỘT LẦN. User bị buộc đổi ở lần đăng nhập sau."
        danger
        onClose={() => setDialog(null)}
        onConfirm={async (r) => {
          const res = await adminApi.resetPassword(id, r);
          toast.success(`Mật khẩu tạm: ${res.temporaryPassword}`);
          await load();
        }}
      />

      <ReasonDialog
        open={dialog?.kind === "status"}
        title={`Đổi trạng thái account → ${dialog?.kind === "status" ? dialog.status : ""}`}
        description="Trạng thái khác ACTIVE sẽ cắt session ngay và chặn toàn bộ tính năng."
        danger
        onClose={() => setDialog(null)}
        onConfirm={(r) =>
          run(
            () => adminApi.updateUserStatus(id, (dialog as { status: UserStatus }).status, r),
            "Đã đổi trạng thái",
          )
        }
      />

      <ReasonDialog
        open={dialog?.kind === "sub-status"}
        title={`Đổi trạng thái gói → ${dialog?.kind === "sub-status" ? dialog.status : ""}`}
        description="Bước chuyển không hợp lệ sẽ bị BE từ chối."
        onClose={() => setDialog(null)}
        onConfirm={(r) =>
          run(
            () =>
              adminApi.setSubscriptionStatus(
                id,
                (dialog as { status: SubscriptionStatus }).status,
                r,
              ),
            "Đã đổi trạng thái gói",
          )
        }
      />

      <ReasonDialog
        open={dialog?.kind === "change-plan"}
        title="Đổi gói"
        extra={
          <Select
            label="Gói mới"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            options={plans.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.slug})${p.isActive ? "" : " — đã tắt"}`,
            }))}
          />
        }
        onClose={() => setDialog(null)}
        onConfirm={(r) => run(() => adminApi.changePlan(id, { planId, reason: r }), "Đã đổi gói")}
      />

      <ReasonDialog
        open={dialog?.kind === "extend"}
        title="Gia hạn gói"
        extra={
          <Input
            id="days"
            label="Số ngày"
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        }
        onClose={() => setDialog(null)}
        onConfirm={(r) =>
          run(() => adminApi.extendSubscription(id, Number(days), r), `Đã gia hạn ${days} ngày`)
        }
      />

      <ReasonDialog
        open={dialog?.kind === "quota-adjust"}
        title="Cấp thêm / trừ quota"
        description="Ghi vào ledger, không sửa số đã dùng."
        extra={
          <Input
            id="amount"
            label="Số lượng (số âm = trừ)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        }
        onClose={() => setDialog(null)}
        onConfirm={(r) => {
          const item = (dialog as { item: QuotaStateItem }).item;
          const n = Number(amount);
          return run(
            () =>
              adminApi.adjustQuota(id, {
                metric: item.metric,
                window: item.window,
                delta: Math.abs(n),
                kind: n < 0 ? "deduct" : "grant",
                reason: r,
              }),
            "Đã ghi điều chỉnh quota",
          );
        }}
      />

      <ReasonDialog
        open={dialog?.kind === "quota-reset"}
        title="Reset quota cửa sổ này"
        description="Số đã dùng được giữ để truy vết; quota khả dụng về đúng hạn mức gói."
        onClose={() => setDialog(null)}
        onConfirm={(r) => {
          const item = (dialog as { item: QuotaStateItem }).item;
          return run(() => adminApi.resetQuota(id, item.metric, item.window, r), "Đã reset quota");
        }}
      />
    </div>
  );
}
