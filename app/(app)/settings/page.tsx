"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  importNorms,
  importPrices,
  ApiError,
  type CatalogImportSummary,
  type CatalogImportPreview,
  type CatalogNormPreviewItem,
  type CatalogPricePreviewItem,
  type CatalogImportConflict,
} from "@/lib/api";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button, Spinner } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { FileSpreadsheet, Upload, Eye, Database } from "lucide-react";

const PROVINCES = [
  "TP.HCM",
  "Hà Nội",
  "Đà Nẵng",
  "Bình Dương",
  "Đồng Nai",
  "Hải Phòng",
  "Cần Thơ",
  "Khánh Hòa",
  "Bà Rịa - Vũng Tàu",
  "Long An",
];

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Có lỗi xảy ra, vui lòng thử lại.";
}

// ---------- shared pieces ----------

function FilePicker({
  file,
  onPick,
  disabled,
  id,
}: {
  file: File | null;
  onPick: (f: File | null) => void;
  disabled?: boolean;
  id: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-zinc-400">
        File Excel (.xlsx / .xls)
      </label>
      <input
        ref={ref}
        id={id}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/60 px-3.5 py-2.5 text-left text-sm transition-colors hover:border-accent-500/50 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-zinc-500" />
        {file ? (
          <span className="truncate text-zinc-100">
            {file.name}
            <span className="ml-2 text-xs text-zinc-500">
              {(file.size / 1024).toFixed(0)} KB
            </span>
          </span>
        ) : (
          <span className="text-zinc-500">Chọn file định dạng Excel…</span>
        )}
      </button>
    </div>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-3.5 py-2.5">
      <p className="mb-1 text-xs font-medium text-rose-400">
        Lỗi khi đọc file ({errors.length})
      </p>
      <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-rose-300/80">
        {errors.slice(0, 20).map((e, i) => (
          <li key={i}>• {e}</li>
        ))}
        {errors.length > 20 && (
          <li className="text-rose-400/60">… và {errors.length - 20} lỗi khác</li>
        )}
      </ul>
    </div>
  );
}

function PreviewShell<T>({
  preview,
  children,
}: {
  preview: CatalogImportPreview<T>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-500">Cột nhận diện được:</span>
        {preview.detectedColumns.length ? (
          preview.detectedColumns.map((c) => (
            <Badge key={c} tone="sky">
              {c}
            </Badge>
          ))
        ) : (
          <Badge tone="rose">Không nhận diện được cột nào</Badge>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        Tổng <span className="font-semibold text-zinc-200">{preview.total}</span>{" "}
        dòng — xem trước {Math.min(20, preview.preview.length)} dòng đầu đã map.
      </p>
      {preview.preview.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          {children}
        </div>
      )}
      <ErrorList errors={preview.errors} />
    </div>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500";
const td = "px-3 py-1.5 text-xs text-zinc-300 whitespace-nowrap";

function ResultLine({ summary }: { summary: CatalogImportSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5 text-xs">
      <span className="font-medium text-emerald-400">Import hoàn tất:</span>
      <Badge tone="emerald">{summary.inserted} thêm mới</Badge>
      <Badge tone="sky">{summary.updated} cập nhật</Badge>
      <Badge tone="zinc">{summary.skipped} bỏ qua</Badge>
    </div>
  );
}

// ---------- Card 1: Bộ định mức ----------

function NormsCard() {
  const toast = useToast();
  const [sourceDoc, setSourceDoc] = useState("TT12/2021");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] =
    useState<CatalogImportPreview<CatalogNormPreviewItem> | null>(null);
  const [summary, setSummary] = useState<CatalogImportSummary | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setSummary(null);
    setError(null);
  };

  const canPreview = !!file && !busy;
  const canImport =
    !!file && !busy && !!preview && preview.preview.length > 0;

  const doPreview = async () => {
    if (!file || busy) return;
    setBusy("preview");
    setError(null);
    setSummary(null);
    try {
      const res = (await importNorms(file, {
        sourceDoc: sourceDoc || undefined,
        dryRun: true,
      })) as CatalogImportPreview<CatalogNormPreviewItem>;
      setPreview(res);
      if (!res.preview.length)
        setError("Không map được dòng nào — kiểm tra lại định dạng file.");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    if (!file || busy || !preview) return;
    setBusy("import");
    setError(null);
    try {
      const res = (await importNorms(file, {
        sourceDoc: sourceDoc || undefined,
      })) as CatalogImportSummary;
      setSummary(res);
      toast.success(
        "Import định mức thành công",
        `${res.inserted} thêm mới, ${res.updated} cập nhật, ${res.skipped} bỏ qua.`
      );
    } catch (e) {
      setError(errMsg(e));
      toast.error("Import định mức thất bại", errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Bộ định mức"
        subtitle="Nạp file Excel định mức chính thống — TT12/2021, QĐ 425… Dữ liệu dùng để AI tra mã hiệu và hao phí."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="norms-source"
            label="Văn bản nguồn (sourceDoc)"
            value={sourceDoc}
            onChange={(e) => setSourceDoc(e.target.value)}
            placeholder="TT12/2021"
            disabled={!!busy}
          />
          <FilePicker id="norms-file" file={file} onPick={pickFile} disabled={!!busy} />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canPreview}
            loading={busy === "preview"}
            leftIcon={<Eye className="h-3.5 w-3.5" />}
            onClick={doPreview}
          >
            Xem trước
          </Button>
          <Button
            size="sm"
            disabled={!canImport}
            loading={busy === "import"}
            leftIcon={<Upload className="h-3.5 w-3.5" />}
            onClick={doImport}
          >
            Import
          </Button>
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Spinner className="h-3.5 w-3.5" /> Đang xử lý…
            </span>
          )}
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        {preview && (
          <PreviewShell preview={preview}>
            <table className="w-full text-left">
              <thead className="bg-zinc-900/80">
                <tr>
                  <th className={th}>Mã hiệu</th>
                  <th className={th}>Tên công tác</th>
                  <th className={th}>Đơn vị</th>
                  <th className={th}>Hao phí</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {preview.preview.slice(0, 20).map((row, i) => (
                  <tr key={`${row.code}-${i}`} className="hover:bg-zinc-900/40">
                    <td className={`${td} font-mono text-accent-300`}>{row.code}</td>
                    <td className={`${td} max-w-xs truncate whitespace-normal`}>
                      {row.name}
                    </td>
                    <td className={td}>{row.unit}</td>
                    <td className={td}>{row.components.length} thành phần</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PreviewShell>
        )}

        {summary && <ResultLine summary={summary} />}
      </CardBody>
    </Card>
  );
}

// ---------- Card 2: Đơn giá tỉnh ----------

const priceKindLabel: Record<CatalogPricePreviewItem["kind"], string> = {
  material: "Vật liệu",
  labor: "Nhân công",
  machine: "Máy",
};

function PricesCard() {
  const toast = useToast();
  const [province, setProvince] = useState("TP.HCM");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [sourceDoc, setSourceDoc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] =
    useState<CatalogImportPreview<CatalogPricePreviewItem> | null>(null);
  const [summary, setSummary] = useState<CatalogImportSummary | null>(null);
  const [conflict, setConflict] = useState<CatalogImportConflict | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setSummary(null);
    setConflict(null);
    setError(null);
  };

  const metaOk = !!province.trim() && !!effectiveDate;
  const canPreview = !!file && metaOk && !busy;
  const canImport = !!file && metaOk && !busy && !!preview && preview.preview.length > 0;

  const meta = () => ({
    province: province.trim(),
    effectiveDate,
    sourceDoc: sourceDoc.trim() || undefined,
  });

  const doPreview = async () => {
    if (!canPreview || !file) return;
    setBusy("preview");
    setError(null);
    setSummary(null);
    setConflict(null);
    try {
      const res = (await importPrices(file, meta(), true)) as
        CatalogImportPreview<CatalogPricePreviewItem>;
      setPreview(res);
      if (!res.preview.length)
        setError("Không map được dòng nào — kiểm tra lại định dạng file.");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (overwrite = false) => {
    if (!file || busy) return;
    if (!overwrite && !canImport) return;
    setBusy("import");
    setError(null);
    if (overwrite) setConflict(null);
    try {
      const raw = await importPrices(file, meta(), false, overwrite);
      if ("conflict" in raw && raw.conflict) {
        setConflict(raw);
        return;
      }
      const res = raw as CatalogImportSummary;
      setConflict(null);
      setSummary(res);
      toast.success(
        "Import đơn giá thành công",
        `${province}: ${res.inserted} thêm mới, ${res.updated} cập nhật, ${res.skipped} bỏ qua.`
      );
    } catch (e) {
      // Backend signals an existing price set as HTTP 409 with the conflict body
      const body = (e as ApiError)?.body as unknown as CatalogImportConflict | undefined;
      if ((e as ApiError)?.statusCode === 409 && body?.conflict) {
        setConflict(body);
        return;
      }
      setError(errMsg(e));
      toast.error("Import đơn giá thất bại", errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Đơn giá tỉnh"
        subtitle="Nạp công bố giá vật liệu / nhân công / ca máy theo tỉnh và ngày hiệu lực."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="price-province"
              className="mb-1.5 block text-xs font-medium text-zinc-400"
            >
              Tỉnh / Thành phố
            </label>
            <input
              id="price-province"
              list="province-options"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              placeholder="Chọn hoặc nhập tên tỉnh…"
              disabled={!!busy}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-accent-500/50 focus:outline-none focus:ring-2 focus:ring-accent-500/50 disabled:opacity-50"
            />
            <datalist id="province-options">
              {PROVINCES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <Input
            id="price-date"
            type="date"
            label="Ngày hiệu lực"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            disabled={!!busy}
            className="[color-scheme:dark]"
          />
          <Input
            id="price-source"
            label="Văn bản nguồn (tuỳ chọn)"
            value={sourceDoc}
            onChange={(e) => setSourceDoc(e.target.value)}
            placeholder="CBG 04/2025-SXD…"
            disabled={!!busy}
          />
        </div>

        <FilePicker id="price-file" file={file} onPick={pickFile} disabled={!!busy} />

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canPreview}
            loading={busy === "preview"}
            leftIcon={<Eye className="h-3.5 w-3.5" />}
            onClick={doPreview}
          >
            Xem trước
          </Button>
          <Button
            size="sm"
            disabled={!canImport}
            loading={busy === "import"}
            leftIcon={<Upload className="h-3.5 w-3.5" />}
            onClick={() => doImport()}
          >
            Import
          </Button>
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Spinner className="h-3.5 w-3.5" /> Đang xử lý…
            </span>
          )}
        </div>

        {conflict && (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
            <p className="text-xs text-amber-300">
              Đã có bộ giá <span className="font-semibold">{province.trim()}</span> hiệu lực{" "}
              <span className="font-semibold">{effectiveDate}</span>
              {" ("}nguồn {conflict.existing.sourceDoc || "không rõ"},{" "}
              {conflict.existing.itemCount ?? "?"} mục, import{" "}
              {conflict.existing.importedAt
                ? new Date(conflict.existing.importedAt).toLocaleDateString("vi-VN")
                : "không rõ"}
              {"). "}
              Ghi đè?
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={!!busy}
                loading={busy === "import"}
                onClick={() => doImport(true)}
              >
                Ghi đè
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!!busy}
                onClick={() => setConflict(null)}
              >
                Hủy
              </Button>
            </div>
          </div>
        )}

        {!metaOk && file && (
          <p className="text-xs text-amber-400">
            Nhập tỉnh và ngày hiệu lực trước khi xem trước.
          </p>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}

        {preview && (
          <PreviewShell preview={preview}>
            <table className="w-full text-left">
              <thead className="bg-zinc-900/80">
                <tr>
                  <th className={th}>Mã</th>
                  <th className={th}>Tên</th>
                  <th className={th}>Đơn vị</th>
                  <th className={th}>Loại</th>
                  <th className={`${th} text-right`}>Đơn giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {preview.preview.slice(0, 20).map((row, i) => (
                  <tr key={`${row.refCode ?? row.name}-${i}`} className="hover:bg-zinc-900/40">
                    <td className={`${td} font-mono text-accent-300`}>
                      {row.refCode ?? "—"}
                    </td>
                    <td className={`${td} max-w-xs truncate whitespace-normal`}>
                      {row.name}
                    </td>
                    <td className={td}>{row.unit}</td>
                    <td className={td}>{priceKindLabel[row.kind]}</td>
                    <td className={`${td} text-right tabular-nums`}>
                      {row.price.toLocaleString("vi-VN")} ₫
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PreviewShell>
        )}

        {summary && <ResultLine summary={summary} />}
      </CardBody>
    </Card>
  );
}

// ---------- Page ----------

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Cài đặt</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Quản lý dữ liệu định mức và đơn giá dùng cho lập dự toán.
        </p>
      </div>

      <NormsCard />
      <PricesCard />

      <Card>
        <CardHeader
          title="Dữ liệu hiện có"
          subtitle="Kiểm tra nhanh dữ liệu vừa nạp."
        />
        <CardBody>
          <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
            <p className="text-sm text-zinc-400">
              Sau khi import, thử tra mã trong chat:{" "}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-accent-300">
                tra định mức AF.11111
              </code>
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
