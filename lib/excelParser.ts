import type { Sheet } from "./types";

// Parse an Excel file in the browser using SheetJS.
// Returns Sheet[] in Univer cellData format (0-based row/col string keys).
// Preserves Excel formulas as { v: result, f: "=formula" } so Univer can recalculate.
export async function parseExcelFile(file: File): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  // cellFormula: true keeps formula strings; cellDates: true converts date serials
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, cellFormula: true });

  return wb.SheetNames.map((name, idx) => {
    const ws = wb.Sheets[name];
    const cellData: Record<string, Record<string, { v: any; f?: string }>> = {};
    let maxRow = 0;
    let maxCol = 0;

    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;

        // Skip truly empty cells (no value AND no formula)
        const hasValue = cell.v !== undefined && cell.v !== null && cell.v !== "";
        const hasFormula = typeof cell.f === "string" && cell.f.trim() !== "";
        if (!hasValue && !hasFormula) continue;

        let v: any = cell.v;
        // Date → locale string
        if (v instanceof Date) v = v.toLocaleDateString("vi-VN");
        // Boolean → string
        if (typeof v === "boolean") v = v ? "TRUE" : "FALSE";

        const ri = String(r);
        const ci = String(c);
        if (!cellData[ri]) cellData[ri] = {};
        // Store formula with leading '=' so Univer knows it's a formula
        if (hasFormula) {
          cellData[ri][ci] = { v: v ?? "", f: "=" + cell.f };
        } else {
          cellData[ri][ci] = { v };
        }
        if (r > maxRow) maxRow = r;
        if (c > maxCol) maxCol = c;
      }
    }

    return {
      id: `sheet-${idx + 1}`,
      name,
      data: {
        cellData,
        rowCount: Math.max(maxRow + 10, 100),
        columnCount: Math.max(maxCol + 5, 20),
      },
    };
  });
}
