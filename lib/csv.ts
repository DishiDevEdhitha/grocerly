/** Small RFC-4180 CSV parser (quotes, escaped quotes, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  return rows;
}
export function csvToObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const all = parseCsv(text); if (!all.length) return { headers: [], rows: [] };
  const headers = all[0].map((h) => h.trim());
  return { headers, rows: all.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}
