// Style round-trip giữa state (DB) và Univer snapshot — tách khỏi WorkbookEditor
// để test được: đây là nơi style bị mất/biến dạng qua vòng save → reload.
//
// Hai dạng cell.s cùng tồn tại:
//   - object  : style inline (BE format_sheet ghi thẳng, excel import)
//   - string  : ID trỏ vào registry styles của workbook (Univer sinh khi save)
// Registry được persist kèm sheet ĐẦU dưới khoá `_styles` (Sheet.data không có
// chỗ cho workbook-level styles).
import type { Sheet } from "@/lib/types";

export type CellStyle = Record<string, any>;
export type StyleRegistry = Record<string, CellStyle>;
type CellData = Record<string, Record<string, any>>;

/** Gom registry `_styles` rải trên các sheet thành 1 map workbook-level. */
export function collectStyleRegistry(sheets: Sheet[] | undefined): StyleRegistry {
  const reg: StyleRegistry = {};
  for (const s of sheets ?? []) {
    const st = (s.data as any)?._styles;
    if (st) Object.assign(reg, st);
  }
  return reg;
}

/** cell.s (object | ID) → style object. Trả null khi không resolve được. */
export function resolveStyle(cell: any, registry: StyleRegistry): CellStyle | null {
  const st = cell?.s;
  if (st && typeof st === "object") return st;
  if (typeof st === "string") return registry[st] ?? null;
  return null;
}

/**
 * Màu nền GỐC của 1 ô theo state — dùng để KHÔI PHỤC sau flash animation.
 * Trả "" khi ô vốn không có nền.
 *
 * Vì sao cần: trước đây flash tô màu rồi trả về bằng setBackgroundColor("").
 * Univer ghi lại thành bg:{rgb:""} — tức "đã xoá nền", không phải "giữ nguyên" —
 * rồi auto-save persist xuống DB ⇒ reload là mất nền. Tệ hơn: style được dedup
 * dùng chung nhiều ô/nhiều sheet, nên 1 ô bị wipe kéo theo cả nhóm mất màu.
 */
export function cellBgOf(
  sheets: Sheet[] | undefined,
  registry: StyleRegistry,
  sheetId: string,
  row: number,
  col: number,
): string {
  const sheet = (sheets ?? []).find((s) => s.id === sheetId);
  const cell = ((sheet?.data as any)?.cellData as CellData | undefined)?.[String(row)]?.[String(col)];
  return resolveStyle(cell, registry)?.bg?.rgb ?? "";
}

/**
 * INTERN style inline (cell.s = object) vào registry, thay bằng ID.
 * Univer chỉ render ổn định style qua REGISTRY trên MỌI sheet; style inline không
 * hiện trên sheet chưa active (gốc bug "mất màu khi chuyển tab").
 * ID không tra được trong registry → drop `s` (data cũ đã chết, giữ lại vô nghĩa).
 * `registry` bị mutate (nhận thêm style mới interned).
 */
export function internCellData(cd: CellData, registry: StyleRegistry): CellData {
  const index = new Map<string, string>();
  for (const [id, st] of Object.entries(registry)) index.set(JSON.stringify(st), id);
  let seq = 0;
  const intern = (st: CellStyle): string => {
    const json = JSON.stringify(st);
    let id = index.get(json);
    if (!id) {
      while (registry[`bqs${seq}`]) seq++;
      id = `bqs${seq++}`;
      index.set(json, id);
      registry[id] = st;
    }
    return id;
  };
  const out: CellData = {};
  for (const [r, cols] of Object.entries(cd)) {
    out[r] = {};
    for (const [c, cell] of Object.entries(cols)) {
      const st = cell?.s;
      if (st && typeof st === "object") out[r][c] = { ...cell, s: intern(st) };
      else if (typeof st === "string" && registry[st]) out[r][c] = cell;
      else if (typeof st === "string") {
        const { s: _dead, ...rest } = cell as any;
        out[r][c] = rest;
      } else out[r][c] = cell;
    }
  }
  return out;
}

/**
 * Univer snapshot (wb.save()) → Sheet[] để persist.
 * cell.s là ID của Univer ⇒ nở lại thành object để state tự mô tả được; ID chết
 * thì lấy style cũ CÙNG SHEET (trước đây quét mọi sheet, khớp r/c đầu tiên ⇒
 * sheet 2/3 bị gán màu tiêu đề của sheet 1). Registry đầy đủ vẫn kèm `_styles`
 * để vòng reload sau còn resolve được.
 * `raw` bị mutate (đúng như snapshot Univer trả ra, không clone cho rẻ).
 */
export function rehydrateSavedSheets(
  raw: { sheets: Record<string, any> },
  styleMap: StyleRegistry,
  prevSheets: Sheet[],
): Sheet[] {
  const sheetKeys = Object.keys(raw.sheets ?? {});
  const prevStyleAt = (key: string, rk: string, ck: string): CellStyle | null => {
    const sheetId = raw.sheets[key]?.id || key;
    const ps = prevSheets.find((p: any) => p?.id === sheetId);
    const pcell = ((ps?.data as any)?.cellData as CellData | undefined)?.[rk]?.[ck];
    return pcell?.s && typeof pcell.s === "object" ? pcell.s : null;
  };
  for (const key of sheetKeys) {
    const cd = raw.sheets[key]?.cellData as CellData | undefined;
    if (!cd) continue;
    for (const [rk, cols] of Object.entries(cd)) {
      for (const [ck, cell] of Object.entries(cols)) {
        const sid = (cell as any)?.s;
        if (typeof sid !== "string") continue;
        if (styleMap[sid]) (cell as any).s = styleMap[sid];
        else {
          const prev = prevStyleAt(key, rk, ck);
          if (prev) (cell as any).s = prev;
          else delete (cell as any).s;
        }
      }
    }
  }
  if (sheetKeys.length > 0 && Object.keys(styleMap).length > 0) {
    raw.sheets[sheetKeys[0]]._styles = { ...styleMap };
  }
  return sheetKeys.map((key) => {
    const s = raw.sheets[key];
    return { id: s.id || key, name: s.name || "Sheet", data: s } as Sheet;
  });
}

/** Hash quyết định có save không — PHẢI gồm `_styles`: đổi màu thuần làm registry
 *  đổi trong khi cell.s (ID) giữ nguyên ⇒ hash theo mỗi cellData sẽ bỏ qua. */
export function sheetsHash(sheets: Sheet[]): string {
  return JSON.stringify(sheets.map((s) => [s.data?.cellData ?? {}, (s.data as any)?._styles ?? null]));
}
