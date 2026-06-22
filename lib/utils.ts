export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Plain integer VND, e.g. 2350000000 -> "2.350.000.000 ₫"
export function formatVnd(value: number): string {
  if (!isFinite(value)) return "0 ₫";
  return `${Math.round(value).toLocaleString("vi-VN")} ₫`;
}

// Number without currency symbol (for dense grid cells), e.g. "2.350.000"
export function formatNum(value: number): string {
  if (!isFinite(value)) return "0";
  return Math.round(value).toLocaleString("vi-VN");
}

// Compact big totals, e.g. 2350000000 -> "2,35 tỷ"; 12500000 -> "12,5 tr"
export function formatVndShort(value: number): string {
  const v = Math.round(value);
  if (Math.abs(v) >= 1_000_000_000) {
    return `${(v / 1_000_000_000)
      .toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  }
  if (Math.abs(v) >= 1_000_000) {
    return `${(v / 1_000_000)
      .toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  }
  return formatVnd(v);
}

export function timeOnly(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
