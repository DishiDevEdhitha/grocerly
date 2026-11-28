import type { DB } from "./db";
import { crossCheck } from "./nutrition";
import { enrichProduct, mergeProducts } from "./catalogue";
import { findDuplicate, upsertProduct, getOrComputeAnalysis } from "./products";
import type { NutrientKey, Product } from "./types";

export interface ImportStats {
  read: number; valid: number; invalid: number; duplicatesInFile: number; duplicatesInDb: number; inserted: number; updated: number;
  active: number; needsReview: number; hidden: number; skippedNotIndian: number; droppedValues: number; reasons: Record<string, number>; examples: Record<string, string[]>;
}
export const emptyStats = (): ImportStats => ({ read: 0, valid: 0, invalid: 0, duplicatesInFile: 0, duplicatesInDb: 0, inserted: 0, updated: 0, active: 0, needsReview: 0, hidden: 0, skippedNotIndian: 0, droppedValues: 0, reasons: {}, examples: {} });
export function mergeStats(a: ImportStats, b: ImportStats): ImportStats {
  const out = emptyStats();
  for (const k of Object.keys(out) as (keyof ImportStats)[]) if (typeof out[k] === "number") (out as never as Record<string, number>)[k] = (a[k] as number) + (b[k] as number);
  for (const r of [a.reasons, b.reasons]) for (const [k, v] of Object.entries(r)) out.reasons[k] = (out.reasons[k] ?? 0) + v;
  for (const e of [a.examples, b.examples]) for (const [k, v] of Object.entries(e)) out.examples[k] = [...(out.examples[k] ?? []), ...v].slice(0, 3);
  return out;
}
const bump = (s: ImportStats, reason: string, example?: string) => { s.reasons[reason] = (s.reasons[reason] ?? 0) + 1; if (example) { (s.examples[reason] ??= []); if (s.examples[reason].length < 3) s.examples[reason].push(example); } };

/** Last-line validation before anything is stored. Removes impossible values instead of storing them. */
export function validateForImport(p: Product, stats?: ImportStats): { ok: boolean; product: Product; reasons: string[] } {
  const reasons: string[] = [];
  if (!p.name || p.name.trim().length < 3) return { ok: false, product: p, reasons: ["no_name"] };
  const { flagged, warnings } = crossCheck(p.nutrition);
  let nutrition = { ...p.nutrition }; const meta = { ...(p.nutritionMeta ?? {}) };
  for (const k of flagged) { delete nutrition[k]; delete meta[k]; if (stats) stats.droppedValues++; reasons.push(`dropped_${k}`); }
  void warnings;
  if (p.servingSize && !(p.servingSize.value > 0)) reasons.push("serving_invalid");
  if (!p.brand && !p.barcode) return { ok: false, product: p, reasons: [...reasons, "no_brand_and_no_barcode"] };
  if (!Object.keys(nutrition).length && !p.ingredients?.length) reasons.push("no_nutrition_no_ingredients");
  return { ok: true, product: enrichProduct({ ...p, nutrition, nutritionMeta: meta, catalogStatus: undefined }, { isIndian: p.catalogStatus !== "hidden" }), reasons };
}

export interface ImportItem { product: Product; isIndian?: boolean; ref?: string }
export interface ImportOptions { dryRun?: boolean; skipAnalysis?: boolean; requireIndian?: boolean; onProgress?: (done: number, total: number) => void }

/**
 * The import pipeline: validate -> de-duplicate inside the batch -> de-duplicate against MongoDB -> merge by source priority
 * -> insert/update -> compute analysis -> statistics. Nothing is dumped blindly.
 */
export async function importProducts(db: DB, items: ImportItem[], opts: ImportOptions = {}): Promise<ImportStats> {
  const stats = emptyStats();
  const unique = new Map<string, Product>();
  for (const it of items) {
    stats.read++;
    if (opts.requireIndian && it.isIndian === false) { stats.skippedNotIndian++; continue; }
    const v = validateForImport(it.product, stats);
    for (const r of v.reasons) bump(stats, r, it.product.name);
    if (!v.ok) { stats.invalid++; continue; }
    stats.valid++;
    const key = v.product.identityKey!;
    const prev = unique.get(key);
    if (prev) { stats.duplicatesInFile++; unique.set(key, mergeProducts(prev, v.product).merged); } else unique.set(key, v.product);
  }
  let i = 0;
  for (const p of unique.values()) {
    i++; opts.onProgress?.(i, unique.size);
    const existing = await findDuplicate(db, p);
    if (existing) stats.duplicatesInDb++;
    if (opts.dryRun) { existing ? stats.updated++ : stats.inserted++; tally(stats, p.catalogStatus); continue; }
    const r = await upsertProduct(db, p, { isIndian: p.catalogStatus !== "hidden" });
    r.created ? stats.inserted++ : stats.updated++;
    tally(stats, r.product.catalogStatus);
    if (!opts.skipAnalysis) await getOrComputeAnalysis(db, r.product, true);
  }
  return stats;
}
function tally(s: ImportStats, st?: string) { if (st === "active") s.active++; else if (st === "hidden") s.hidden++; else s.needsReview++; }

export function formatStats(s: ImportStats): string {
  const reasons = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${k}: ${v}${s.examples[k]?.length ? `  e.g. ${s.examples[k].join(" | ")}` : ""}`).join("\n");
  return [`Read:               ${s.read}`, `Valid:              ${s.valid}`, `Invalid:            ${s.invalid}`, `Not Indian skipped: ${s.skippedNotIndian}`, `Duplicates in file: ${s.duplicatesInFile}`, `Already in DB:      ${s.duplicatesInDb}`, `Inserted:           ${s.inserted}`, `Updated (merged):   ${s.updated}`, `Dropped bad values: ${s.droppedValues}`, `Catalogue status:   active=${s.active} needs_review=${s.needsReview} hidden=${s.hidden}`, reasons ? `Reasons / warnings:\n${reasons}` : ""].join("\n");
}
export type { NutrientKey };
