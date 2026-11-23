import type { Db, ObjectId } from "mongodb";
import { col } from "./mongodb";
import { SCORE_VERSION } from "./scoring-config";
import { rankAlternatives, DEFAULT_PREFERENCES, type Candidate, type Preferences } from "./ranking";
import type { Product, ProductAnalysis } from "./types";
export * from "./ranking";

/** Fetch same-category candidates from MongoDB using an aggregation with $lookup, then rank. */
export async function findAlternatives(db: Db, product: Product & { _id: ObjectId }, analysis: ProductAnalysis, prefs: Preferences = DEFAULT_PREFERENCES, limit = 5) {
  const tags = product.categoryTags.slice(-2);
  const rows = await col.products(db).aggregate<Product & { _id: ObjectId; analysis: ProductAnalysis }>([
    { $match: { _id: { $ne: product._id }, profile: product.profile, "nutritionBasis.unit": product.nutritionBasis.unit, $or: [{ category: product.category }, ...(tags.length ? [{ categoryTags: { $in: tags } }] : [])] } },
    { $limit: 300 },
    { $lookup: { from: "product_analysis", let: { pid: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$productId", "$$pid"] }, { $eq: ["$scoreVersion", SCORE_VERSION] }] } } }, { $project: { score: 1 } }], as: "analysis" } },
    { $unwind: "$analysis" },
    { $match: { "analysis.score": { $ne: null } } },
  ]).toArray();
  const candidates: Candidate[] = rows.map((r) => { const { analysis: a, ...p } = r; return { id: String(r._id), product: p as Product, score: (a as unknown as { score: number }).score }; });
  const cur: Candidate = { id: String(product._id), product, score: analysis.score };
  return { alternatives: rankAlternatives(cur, candidates, prefs, limit), candidateCount: candidates.length };
}

