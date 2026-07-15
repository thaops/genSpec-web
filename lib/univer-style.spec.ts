import type { Sheet } from "@/lib/types";
import {
  cellBgOf,
  collectStyleRegistry,
  internCellData,
  rehydrateSavedSheets,
  sheetsHash,
} from "@/lib/univer-style";

// Style thật do BE format_sheet ghi (markdown-table-actions.ts TAKEOFF_HEADER_STYLE).
const HEADER = {
  bl: 1,
  bg: { rgb: "#e8eef6" },
  cl: { rgb: "#1e3a5f" },
  ht: 2,
  vt: 2,
};
const DATA = { bd: { t: { s: 1, cl: { rgb: "#d0d0d0" } } }, vt: 2 };

const cell = (v: any, s?: any) => (s ? { v, s } : { v });

/** State như BE trả về sau khi agent chạy format_sheet: cell.s là OBJECT inline. */
function stateAfterAgent(): Sheet[] {
  return [
    {
      id: "s1",
      name: "1. Kết cấu & bao che",
      data: {
        cellData: {
          "0": { "0": cell("STT", HEADER), "1": cell("Mã hiệu", HEADER) },
          "1": { "0": cell(1, DATA), "1": cell("AE.62210", DATA) },
        },
      },
    },
    {
      id: "s2",
      name: "2. Hoàn thiện bề mặt",
      data: {
        cellData: { "0": { "0": cell("STT", { ...HEADER, bg: { rgb: "#fde8e8" } }) } },
      },
    },
  ];
}

/** Univer save(): cell.s là ID trỏ registry `styles` workbook-level. */
function univerSave(sheets: Sheet[], registry: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const s of sheets) out[s.id] = { id: s.id, name: s.name, cellData: s.data.cellData };
  return { sheets: out, styles: { ...registry } };
}

describe("univer style round-trip (state → Univer → save → state)", () => {
  it("giữ nguyên style qua trọn 1 vòng agent-apply → save → reload", () => {
    const sheets = stateAfterAgent();

    // --- reload #1: intern style inline thành ID + registry
    const registry = collectStyleRegistry(sheets);
    const interned = sheets.map((s) => ({ ...s, data: { ...s.data, cellData: internCellData(s.data.cellData, registry) } }));
    expect(typeof interned[0].data.cellData["0"]["0"].s).toBe("string");

    // --- Univer save → rehydrate → persist
    const raw = univerSave(interned, registry);
    const saved = rehydrateSavedSheets(raw, registry, interned);

    // Style phải còn NGUYÊN VẸN sau vòng lặp, không bị drop
    expect(saved[0].data.cellData["0"]["0"].s).toEqual(HEADER);
    expect(saved[0].data.cellData["1"]["0"].s).toEqual(DATA);
    // registry phải được persist kèm sheet đầu, nếu không reload sau là ID chết
    expect(saved[0].data._styles).toBeTruthy();

    // --- reload #2 từ đúng cái vừa persist: vẫn không mất style
    const reg2 = collectStyleRegistry(saved);
    const interned2 = saved.map((s) => ({ ...s, data: { ...s.data, cellData: internCellData(s.data.cellData, reg2) } }));
    const saved2 = rehydrateSavedSheets(univerSave(interned2, reg2), reg2, interned2);
    expect(saved2[0].data.cellData["0"]["0"].s).toEqual(HEADER);
  });

  it("mỗi sheet giữ style CỦA MÌNH — không bị gán style của sheet 1", () => {
    const sheets = stateAfterAgent();
    const registry = collectStyleRegistry(sheets);
    const interned = sheets.map((s) => ({ ...s, data: { ...s.data, cellData: internCellData(s.data.cellData, registry) } }));
    // ID chết ở cả 2 sheet → phải rơi về prev CÙNG SHEET
    const raw = univerSave(interned, registry);
    raw.sheets["s1"].cellData["0"]["0"].s = "ghost";
    raw.sheets["s2"].cellData["0"]["0"].s = "ghost";
    const saved = rehydrateSavedSheets(raw, {}, sheets);
    expect(saved[0].data.cellData["0"]["0"].s).toEqual(HEADER);
    expect(saved[1].data.cellData["0"]["0"].s).toEqual({ ...HEADER, bg: { rgb: "#fde8e8" } });
  });

  it("registry `_styles` mất → ID thành style chết, không giữ lại rác", () => {
    const orphan: Sheet[] = [
      { id: "s1", name: "S1", data: { cellData: { "0": { "0": { v: "x", s: "dead-id" } } } } },
    ];
    const reg = collectStyleRegistry(orphan);
    expect(reg).toEqual({});
    const cd = internCellData(orphan[0].data.cellData, reg);
    expect(cd["0"]["0"]).toEqual({ v: "x" });
  });

  it("hash phải đổi khi CHỈ registry đổi (đổi màu thuần, cell.s giữ ID)", () => {
    const a: Sheet[] = [{ id: "s1", name: "S1", data: { cellData: { "0": { "0": { v: "x", s: "id1" } } }, _styles: { id1: HEADER } } }];
    const b: Sheet[] = [{ id: "s1", name: "S1", data: { cellData: { "0": { "0": { v: "x", s: "id1" } } }, _styles: { id1: { ...HEADER, bg: { rgb: "#ff0000" } } } } }];
    expect(sheetsHash(a)).not.toEqual(sheetsHash(b));
  });
});

// Gốc bug "agent áp styles xong, reload thì MẤT": flash animation tô nền ô agent
// vừa ghi rồi trả về bằng setBackgroundColor("") → Univer ghi bg:{rgb:""} (XOÁ
// nền, không phải giữ nguyên) → auto-save persist xuống DB. Bằng chứng: dump DB
// có registry entry {..., bg:{rgb:""}} trên đúng các ô agent đã ghi.
describe("flash animation không được xoá nền gốc", () => {
  it("cellBgOf trả về nền GỐC để flash khôi phục (không phải \"\")", () => {
    const sheets = stateAfterAgent();
    const registry = collectStyleRegistry(sheets);
    expect(cellBgOf(sheets, registry, "s1", 0, 0)).toBe("#e8eef6");
    expect(cellBgOf(sheets, registry, "s2", 0, 0)).toBe("#fde8e8");
  });

  it("resolve được cả khi cell.s đã intern thành ID", () => {
    const sheets = stateAfterAgent();
    const registry = collectStyleRegistry(sheets);
    const interned = sheets.map((s) => ({ ...s, data: { ...s.data, cellData: internCellData(s.data.cellData, registry) } }));
    expect(cellBgOf(interned, registry, "s1", 0, 0)).toBe("#e8eef6");
  });

  it("ô vốn không có nền → \"\" (flash trả về đúng trạng thái cũ)", () => {
    const sheets = stateAfterAgent();
    expect(cellBgOf(sheets, collectStyleRegistry(sheets), "s1", 1, 0)).toBe("");
  });

  it("nền bị wipe thành \"\" rồi persist ⇒ reload mất màu (tái hiện bug)", () => {
    const wiped: Sheet[] = [
      { id: "s1", name: "S1", data: { cellData: { "0": { "0": { v: "STT", s: "h" } } }, _styles: { h: { ...HEADER, bg: { rgb: "" } } } } },
    ];
    // Đây chính xác là thứ tìm thấy trong DB: style còn, ID resolve được, nhưng nền rỗng.
    expect(cellBgOf(wiped, collectStyleRegistry(wiped), "s1", 0, 0)).toBe("");
    // Sau fix, giá trị khôi phục lấy từ state gốc nên không bao giờ tạo ra bg:"".
    const good = stateAfterAgent();
    expect(cellBgOf(good, collectStyleRegistry(good), "s1", 0, 0)).not.toBe("");
  });
});
