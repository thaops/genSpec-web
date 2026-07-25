"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import type { AdminVocabulary, Plan, PlanLimits, QuotaRule, QuotaWindow } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, Spinner } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ReasonDialog } from "@/components/admin/ReasonDialog";
import { Plus, Save, Trash2 } from "lucide-react";

const WINDOW_LABEL: Record<string, string> = {
  hour: "mỗi giờ",
  "4h": "mỗi 4 giờ",
  day: "mỗi ngày",
  week: "mỗi tuần",
  month: "mỗi tháng",
};

const BYTES_KEYS = new Set(["storage.bytes", "upload.maxBytes"]);

/** Ô nhập số cho phép rỗng = unlimited (null). Không tự đổi rỗng thành 0. */
function LimitInput({
  keyName,
  value,
  onChange,
}: {
  keyName: string;
  value: number | null | undefined;
  onChange: (v: number | null | undefined) => void;
}) {
  const isBytes = BYTES_KEYS.has(keyName);
  const shown =
    value === undefined ? "" : value === null ? "" : isBytes ? String(value / 1048576) : String(value);
  return (
    <div>
      <label className="mb-1 block text-[11px] text-zinc-500">
        {keyName}
        {isBytes && " (MB)"}
      </label>
      <div className="flex gap-1">
        <input
          type="number"
          min={0}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-100"
          placeholder={value === null ? "∞ unlimited" : "chưa đặt = cấm"}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(undefined);
            const n = Number(raw);
            onChange(isBytes ? Math.round(n * 1048576) : n);
          }}
        />
        <button
          type="button"
          title="Đặt unlimited"
          onClick={() => onChange(value === null ? undefined : null)}
          className={
            "rounded-lg border px-2 text-xs " +
            (value === null
              ? "border-accent-500/40 bg-accent-500/10 text-accent-300"
              : "border-zinc-700 text-zinc-500 hover:text-zinc-300")
          }
        >
          ∞
        </button>
      </div>
    </div>
  );
}

function PlanEditor({
  plan,
  vocab,
  onSaved,
}: {
  plan: Plan;
  vocab: AdminVocabulary;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Plan>(plan);
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => setDraft(plan), [plan]);

  const sellable = vocab.permissions.filter((p) => !p.adminOnly);
  const groups = [...new Set(sellable.map((p) => p.group))];

  function toggleFeature(key: string) {
    setDraft((d) => ({
      ...d,
      features: d.features.includes(key)
        ? d.features.filter((f) => f !== key)
        : [...d.features, key],
    }));
  }

  function setQuota(metric: string, window: QuotaWindow, limit: number | null | undefined) {
    setDraft((d) => {
      const rest = d.quotas.filter((q) => !(q.metric === metric && q.window === window));
      if (limit === undefined) return { ...d, quotas: rest };
      return { ...d, quotas: [...rest, { metric, window, limit } as QuotaRule] };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await adminApi.updatePlan(plan.id, {
        name: draft.name,
        description: draft.description,
        isActive: draft.isActive,
        sortOrder: draft.sortOrder,
        price: draft.price,
        trialDays: draft.trialDays,
        features: draft.features,
        limits: draft.limits,
        quotas: draft.quotas,
      });
      toast.success(`Đã lưu gói ${draft.name}`);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {draft.name}
            <Badge tone="zinc">{plan.slug}</Badge>
            {plan.isSystem && <Badge tone="amber">system</Badge>}
            {!draft.isActive && <Badge tone="rose">đã tắt</Badge>}
          </span>
        }
        subtitle={`${plan.subscriberCount ?? 0} user đang dùng`}
        action={
          <div className="flex gap-2">
            <Button size="sm" loading={saving} leftIcon={<Save className="h-3.5 w-3.5" />} onClick={save}>
              Lưu
            </Button>
            {!plan.isSystem && (
              <Button
                size="sm"
                variant="danger"
                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setConfirmOff(true)}
              >
                Tắt gói
              </Button>
            )}
          </div>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Input
            id={`name-${plan.id}`}
            label="Tên"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Input
            id={`price-${plan.id}`}
            label={`Giá (${draft.price?.currency ?? "VND"})`}
            type="number"
            value={String(draft.price?.amount ?? 0)}
            onChange={(e) =>
              setDraft({ ...draft, price: { ...draft.price, amount: Number(e.target.value) } })
            }
          />
          <Select
            label="Chu kỳ"
            value={draft.price?.interval ?? "free"}
            options={["free", "month", "year", "lifetime"].map((v) => ({ value: v, label: v }))}
            onChange={(e) =>
              setDraft({
                ...draft,
                price: { ...draft.price, interval: e.target.value as Plan["price"]["interval"] },
              })
            }
          />
          <Input
            id={`trial-${plan.id}`}
            label="Trial (ngày, rỗng = không)"
            type="number"
            value={draft.trialDays === null ? "" : String(draft.trialDays)}
            onChange={(e) =>
              setDraft({ ...draft, trialDays: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>

        {/* Limits */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-300">
            Giới hạn <span className="text-zinc-500">· rỗng = cấm · ∞ = không giới hạn</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {vocab.limitKeys.map((k) => (
              <LimitInput
                key={k}
                keyName={k}
                value={(draft.limits as Record<string, number | null | undefined>)[k]}
                onChange={(v) => {
                  const next: PlanLimits = { ...draft.limits };
                  if (v === undefined) delete (next as Record<string, unknown>)[k];
                  else (next as Record<string, unknown>)[k] = v;
                  setDraft({ ...draft, limits: next });
                }}
              />
            ))}
          </div>
        </div>

        {/* Quota matrix */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-300">
            Quota <span className="text-zinc-500">· rỗng = không giới hạn ở cửa sổ đó</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="pb-2 font-medium">metric</th>
                  {vocab.quotaWindows.map((w) => (
                    <th key={w} className="pb-2 font-medium">
                      {WINDOW_LABEL[w] ?? w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vocab.quotaMetrics.map((m) => (
                  <tr key={m} className="border-t border-zinc-800/60">
                    <td className="py-2 pr-3 text-zinc-300">{m}</td>
                    {vocab.quotaWindows.map((w) => {
                      const rule = draft.quotas.find((q) => q.metric === m && q.window === w);
                      return (
                        <td key={w} className="py-1.5 pr-2">
                          <input
                            type="number"
                            min={0}
                            placeholder="—"
                            className="w-24 rounded-lg border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-100"
                            value={rule ? (rule.limit === null ? "" : String(rule.limit)) : ""}
                            onChange={(e) =>
                              setQuota(m, w, e.target.value === "" ? undefined : Number(e.target.value))
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Permission matrix */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-300">
            Tính năng <span className="text-zinc-500">· quyền admin.* đến từ role, không bán</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">{g}</p>
                <div className="space-y-1">
                  {sellable
                    .filter((p) => p.group === g)
                    .map((p) => (
                      <label key={p.key} className="flex items-start gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-accent-500"
                          checked={draft.features.includes(p.key)}
                          onChange={() => toggleFeature(p.key)}
                        />
                        <span>
                          {p.label}
                          <span className="block text-[10px] text-zinc-600">{p.key}</span>
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardBody>

      <ReasonDialog
        open={confirmOff}
        title={`Tắt gói ${draft.name}`}
        description="Gói sẽ bị ẩn khỏi trang bán. BE chặn nếu còn user đang dùng."
        danger
        confirmLabel="Tắt gói"
        onClose={() => setConfirmOff(false)}
        onConfirm={async (r) => {
          await adminApi.deactivatePlan(plan.id, r);
          toast.success("Đã tắt gói");
          onSaved();
        }}
      />
    </Card>
  );
}

export default function AdminPlansPage() {
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [vocab, setVocab] = useState<AdminVocabulary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([adminApi.listPlans(), adminApi.vocabulary()]);
      setPlans(p);
      setVocab(v);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6 text-zinc-500" />
      </div>
    );
  }

  if (error || !vocab) {
    return (
      <div className="p-6">
        <Card>
          <CardBody className="text-sm text-zinc-400">
            <p className="text-zinc-200">Không mở được trang quản lý gói.</p>
            <p className="mt-1 text-xs">{error}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Trang này cần quyền <code>admin.plans</code> — chỉ <b>super_admin</b>.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Gói dịch vụ</h1>
          <p className="text-xs text-zinc-500">
            Sửa ở đây có hiệu lực ngay — không cần deploy lại.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                const res = await adminApi.expireOverdue();
                toast.success(`Đã hạ EXPIRED ${res.expired} subscription`);
                void load();
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            Quét gói hết hạn
          </Button>
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
            Tạo gói
          </Button>
        </div>
      </div>

      {plans.map((p) => (
        <PlanEditor key={p.id} plan={p} vocab={vocab} onSaved={load} />
      ))}

      <ReasonDialog
        open={creating}
        title="Tạo gói mới"
        description="Gói mới tạo ra trống quyền — tick tính năng và đặt quota sau khi tạo."
        confirmLabel="Tạo"
        extra={
          <>
            <Input
              id="new-slug"
              label="Slug (a-z0-9-_, không đổi được sau này)"
              placeholder="business"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
            />
            <Input
              id="new-name"
              label="Tên hiển thị"
              placeholder="Business"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </>
        }
        onClose={() => setCreating(false)}
        onConfirm={async () => {
          await adminApi.createPlan({
            slug: newSlug.trim().toLowerCase(),
            name: newName.trim() || newSlug.trim(),
            features: [],
            limits: {},
            quotas: [],
            sortOrder: (plans.at(-1)?.sortOrder ?? 0) + 10,
          });
          toast.success(`Đã tạo gói ${newSlug}`);
          setNewSlug("");
          setNewName("");
          void load();
        }}
      />
    </div>
  );
}
