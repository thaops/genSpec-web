import type { Sheet } from "./types";

// Parse an Excel file in the browser using SheetJS.
// Returns Sheet[] in Univer cellData format (0-based row/col string keys).
export async function parseExcelFile(file: File): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  return wb.SheetNames.map((name, idx) => {
    const ws = wb.Sheets[name];
    const cellData: Record<string, Record<string, { v: any }>> = {};
    let maxRow = 0;
    let maxCol = 0;

    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell || cell.v === undefined || cell.v === null || cell.v === "") continue;

        let v: any = cell.v;
        // Date → locale string
        if (v instanceof Date) v = v.toLocaleDateString("vi-VN");
        // Boolean → string
        if (typeof v === "boolean") v = v ? "TRUE" : "FALSE";

        const ri = String(r);
        const ci = String(c);
        if (!cellData[ri]) cellData[ri] = {};
        cellData[ri][ci] = { v };
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
