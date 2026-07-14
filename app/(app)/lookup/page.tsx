"use client";

import { useCallback, useEffect, useState } from "react";
import {
  searchUnitPrice,
  getUnitPriceByCode,
  searchResourcePrice,
  ApiError,
  type UnitPriceResult,
  type ResourcePriceResult,
} from "@/lib/api";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Button";
import { Search, FileText, ExternalLink, BarChart3 } from "lucide-react";

// Chỉ 2 tỉnh đã nạp dữ liệu giá (canonical trùng backend).
const PROVINCE_OPTIONS = [
  { value: "Hà Nội", label: "Hà Nội" },
  { value: "TP. Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
];

const RESOURCE_CATEGORIES = [
  { value: "", label: "Tất cả tài nguyên" },
  { value: "material", label: "Vật liệu (VL)" },
  { value: "labor", label: "Nhân công (NC)" },
  { value: "equipment", label: "Ca máy (M)" },
];

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Có lỗi xảy ra, vui lòng thử lại.";
}

const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN");

// ── Nguồn (chống bịa) ──────────────────────────────────────────────────────

function SourceTag({ doc, origin }: { doc?: string; origin?: string }) {
  if (!doc && !origin) return <span className="text-zinc-600">—</span>;
  const url = origin?.startsWith("http") ? origin : undefined;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <FileText className="h-3 w-3 shrink-0 text-zinc-500" />
      <span className="truncate">{doc || origin}</span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-400 hover:text-accent-300"
          title="Mở nguồn"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </span>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500";
const td = "px-3 py-2 text-xs text-zinc-300 align-middle";

// ── A) Tra mã ───────────────────────────────────────────────────────────────

function UnitPriceLookup({ province, onAnalyze }: { province: string; onAnalyze: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UnitPriceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const run = useCallback(async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setTouched(true);
    try {
      setRows(await searchUnitPrice(q.trim(), province, 20));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [q, province]);

  return (
    <Card>
      <CardHeader
        title="Tra mã đơn giá"
        subtitle="Tìm theo mã hiệu (vd AF.615) hoặc từ khóa tên công tác. Mọi đơn giá đều kèm nguồn."
      />
      <CardBody className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <Input
            id="up-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mã hiệu hoặc tên công tác…"
            leftIcon={<Search className="h-4 w-4" />}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !q.trim()}
            className="shrink-0 rounded-xl bg-accent-500 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-400 disabled:opacity-50"
          >
            {busy ? <Spinner className="h-4 w-4" /> : "Tra"}
          </button>
        </form>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left">
              <thead className="bg-zinc-900/80">
                <tr>
                  <th className={th}>Mã</th>
                  <th className={th}>Tên công tác</th>
                  <th className={th}>ĐVT</th>
                  <th className={`${th} text-right`}>VL</th>
                  <th className={`${th} text-right`}>NC</th>
                  <th className={`${th} text-right`}>Máy</th>
                  <th className={`${th} text-right`}>Đơn giá</th>
                  <th className={th}>Nguồn</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {rows.map((r) => (
                  <tr key={`${r.code}-${r.province}`} className="hover:bg-zinc-900/40">
                    <td className={`${td} whitespace-nowrap font-mono text-accent-300`}>{r.code}</td>
                    <td className={`${td} max-w-xs whitespace-normal`}>
                      {r.name}
                      {r.splitConfident === false && (
                        <Badge tone="amber" className="ml-2">
                          tách VL/NC/M ước tính
                        </Badge>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{r.unit || "—"}</td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{vnd(r.material)}</td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{vnd(r.labor)}</td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{vnd(r.machine)}</td>
                    <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums text-zinc-100`}>
                      {vnd(r.unitPrice)}
                    </td>
                    <td className={`${td} max-w-[180px]`}>
                      <SourceTag doc={r.sourceDoc} origin={r.sourceOrigin} />
                    </td>
                    <td className={td}>
                      <button
                        onClick={() => onAnalyze(r.code)}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-accent-400 hover:text-accent-300"
                      >
                        <BarChart3 className="h-3.5 w-3.5" /> Phân tích
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {touched && !busy && rows.length === 0 && !error && (
          <p className="text-xs text-zinc-500">Không tìm thấy đơn giá khớp trong {province}.</p>
        )}
      </CardBody>
    </Card>
  );
}

// ── B) Phân tích đơn giá ─────────────────────────────────────────────────────

function CostBar({ item }: { item: UnitPriceResult }) {
  const total = item.material + item.labor + item.machine || item.unitPrice || 1;
  const seg = [
    { label: "VL", value: item.material, tone: "bg-sky-500" },
    { label: "NC", value: item.labor, tone: "bg-emerald-500" },
    { label: "Máy", value: item.machine, tone: "bg-amber-500" },
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-800">
        {seg.map((s) => (
          <div key={s.label} className={s.tone} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {seg.map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className={`h-2 w-2 rounded-full ${s.tone}`} />
              {s.label}
            </div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100">{vnd(s.value)}</div>
            <div className="text-[11px] text-zinc-500">{Math.round((s.value / total) * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceLookup({ province }: { province: string }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<ResourcePriceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const run = useCallback(async () => {
    if (!q.trim()) return;
    setBusy(true);
    setTouched(true);
    try {
      setRows(await searchResourcePrice(q.trim(), { province, category: category || undefined, limit: 20 }));
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [q, province, category]);

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <p className="text-xs font-medium text-zinc-400">
        Tra đơn giá tài nguyên (giá VL / NC / ca máy đã nạp — có nguồn)
      </p>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_180px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Input
          id="res-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tên tài nguyên (vd xi măng, thợ nề)…"
          leftIcon={<Search className="h-4 w-4" />}
          disabled={busy}
        />
        <Select
          id="res-cat"
          options={RESOURCE_CATEGORIES}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? <Spinner className="h-4 w-4" /> : "Tra"}
        </button>
      </form>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left">
            <thead className="bg-zinc-900/80">
              <tr>
                <th className={th}>Tên</th>
                <th className={th}>Loại</th>
                <th className={th}>ĐVT</th>
                <th className={`${th} text-right`}>Đơn giá</th>
                <th className={th}>Nguồn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {rows.map((r) => (
                <tr key={r.materialId + r.sourceId} className="hover:bg-zinc-900/40">
                  <td className={`${td} max-w-xs whitespace-normal`}>{r.name}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {r.category === "labor" ? "NC" : r.category === "equipment" ? "Máy" : "VL"}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{r.unit || "—"}</td>
                  <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums text-zinc-100`}>
                    {vnd(r.price)}
                  </td>
                  <td className={`${td} max-w-[180px]`}>
                    <SourceTag doc={r.documentNumber || r.sourceId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {touched && !busy && rows.length === 0 && (
        <p className="text-xs text-zinc-500">Không có giá tài nguyên khớp — để trống, không suy đoán.</p>
      )}
    </div>
  );
}

function CostAnalysis({ province, code }: { province: string; code: string }) {
  const [item, setItem] = useState<UnitPriceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code.trim()) {
      setItem(null);
      return;
    }
    let alive = true;
    setBusy(true);
    setError(null);
    getUnitPriceByCode(code.trim(), province)
      .then((r) => {
        if (!alive) return;
        setItem(r);
        if (!r) setError(`Không tìm thấy mã "${code}" trong ${province}.`);
      })
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [code, province]);

  return (
    <Card>
      <CardHeader
        title="Phân tích đơn giá"
        subtitle="Breakdown VL / NC / Máy của 1 mã công tác + tra giá tài nguyên tương ứng."
      />
      <CardBody className="space-y-4">
        {!code.trim() && (
          <p className="text-xs text-zinc-500">
            Chọn “Phân tích” trên một dòng ở bảng Tra mã, hoặc nhập mã trực tiếp bên trên.
          </p>
        )}
        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Spinner className="h-3.5 w-3.5" /> Đang tải…
          </span>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}

        {item && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-accent-300">{item.code}</span>
                  <Badge tone="zinc">{item.unit || "—"}</Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-200">{item.name}</p>
                <div className="mt-1.5">
                  <SourceTag doc={item.sourceDoc} origin={item.sourceOrigin} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-zinc-500">Tổng đơn giá</div>
                <div className="text-lg font-semibold tabular-nums text-zinc-100">{vnd(item.unitPrice)} ₫</div>
              </div>
            </div>

            {item.splitConfident === false && (
              <p className="text-xs text-amber-400">
                Lưu ý: phần tách VL/NC/Máy là ước tính; tổng đơn giá vẫn theo nguồn.
              </p>
            )}

            <CostBar item={item} />

            <ResourceLookup province={province} />
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LookupPage() {
  const [province, setProvince] = useState(PROVINCE_OPTIONS[0].value);
  const [tab, setTab] = useState<"search" | "analyze">("search");
  const [code, setCode] = useState("");

  const analyze = (c: string) => {
    setCode(c);
    setTab("analyze");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Tra mã & Phân tích đơn giá</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Tra cứu đơn giá công tác theo tỉnh từ dữ liệu đã nạp — mọi con số kèm nguồn, chống bịa.
          </p>
        </div>
        <div className="w-52">
          <Select
            id="province"
            label="Tỉnh / Thành phố"
            options={PROVINCE_OPTIONS}
            value={province}
            onChange={(e) => setProvince(e.target.value)}
          />
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/40 p-1 text-sm">
        {(["search", "analyze"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "rounded-lg bg-accent-500/15 px-4 py-1.5 font-medium text-accent-300"
                : "rounded-lg px-4 py-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
            }
          >
            {t === "search" ? "Tra mã" : "Phân tích đơn giá"}
          </button>
        ))}
      </div>

      {tab === "search" ? (
        <UnitPriceLookup province={province} onAnalyze={analyze} />
      ) : (
        <div className="space-y-4">
          <Input
            id="analyze-code"
            label="Mã hiệu"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Nhập mã hiệu, vd AF.61520…"
            leftIcon={<Search className="h-4 w-4" />}
          />
          <CostAnalysis province={province} code={code} />
        </div>
      )}
    </div>
  );
}
