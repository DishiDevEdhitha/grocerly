import type { Db, ObjectId } from "mongodb";
import { col } from "./mongodb";
import { SCORE_VERSION } from "./scoring-config";
import { coreCount } from "./catalogue";
import { isSameProduct } from "./identity";
import type { Product } from "./types";

export interface SimilarCandidate { id: string; product: Product; score: number | null }
export interface SimilarResult extends SimilarCandidate { rank: number; why: string[] }

const packRatio = (a?: { value: number; unit: string }, b?: { value: number; unit: string }) => (a && b && a.unit === b.unit ? Math.max(a.value, b.value) / Math.min(a.value, b.value) : null);

/**
 * Which products are fair to compare with `base`?
 *  must: same department + same category, enough nutrition data, not the same product
 *  ranked by: same product type (+50), different brand (+15), similar pack size (+10), data completeness (+15),
 *             same scoring profile (+5). At most 2 per brand so one brand cannot fill the list.
 */
export function rankSimilar(base: Product, cands: SimilarCandidate[], limit = 8): SimilarResult[] {
  const bp = base.categoryPath ?? [];
  const out: SimilarResult[] = [];
  for (const c of cands) {
    const p = c.product, cp = p.categoryPath ?? [];
    if (isSameProduct(base, p) || (p.barcode && p.barcode === base.barcode)) continue;
    if (!bp[0] || cp[0] !== bp[0]) continue;
    if (bp[1] && cp[1] !== bp[1]) continue;
    if (coreCount(p.nutrition) < 3 || c.score == null) continue;
    const why: string[] = []; let r = 0;
    if (p.productType && p.productType === base.productType) { r += 50; why.push(`Same type: ${p.productType}`); } else if (bp[1] && cp[1] === bp[1]) { r += 20; why.push(`Same category: ${cp[1]}`); }
    if (p.brandNorm && p.brandNorm !== base.brandNorm) { r += 15; why.push("Different brand"); }
    const ratio = packRatio(base.quantity, p.quantity);
    if (ratio != null && ratio <= 2) { r += Math.round(10 * (2 - ratio)); why.push("Similar pack size"); }
    r += (coreCount(p.nutrition) / 6) * 15;
    if (p.profile === base.profile) r += 5;
    out.push({ ...c, rank: Math.round(r * 10) / 10, why });
  }
  out.sort((a, b) => b.rank - a.rank || (b.score ?? 0) - (a.score ?? 0));
  const perBrand = new Map<string, number>(); const picked: SimilarResult[] = [];
  for (const x of out) {
    const b = x.product.brandNorm ?? ""; const n = perBrand.get(b) ?? 0;
    if (n >= 2) continue; perBrand.set(b, n + 1); picked.push(x); if (picked.length >= limit) break;
  }
  return picked;
}

export async function findSimilar(db: Db, base: Product & { _id: ObjectId }, limit = 8) {
  const bp = base.categoryPath ?? [];
  if (bp.length < 2) return [];
  const rows = await col.products(db).aggregate<Product & { _id: ObjectId; a: { score: number | null } }>([
    { $match: { _id: { $ne: base._id }, catalogStatus: "active", categoryPath: bp[1] } },
    { $limit: 250 },
    { $lookup: { from: "product_analysis", let: { pid: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$productId", "$$pid"] }, { $eq: ["$scoreVersion", SCORE_VERSION] }] } } }, { $project: { score: 1 } }], as: "a" } },
    { $unwind: "$a" },
  ]).toArray();
  const cands: SimilarCandidate[] = rows.map((r) => { const { a, ...p } = r; return { id: String(r._id), product: p as unknown as Product, score: a.score }; });
  return rankSimilar(base, cands, limit);
}
