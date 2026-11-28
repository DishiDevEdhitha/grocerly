import { C, type DB } from "./db";
import { rankAlternatives, DEFAULT_PREFERENCES, type Candidate, type Preferences } from "./ranking";
import { getScores, toProduct, type P } from "./products";
import type { ProductAnalysis } from "./types";
export * from "./ranking";

/** Fetch same-category candidates from Firestore, join their scores in code, then rank. */
export async function findAlternatives(db: DB, product: P, analysis: ProductAnalysis, prefs: Preferences = DEFAULT_PREFERENCES, limit = 5) {
  const key = product.categoryPath?.[1] ?? product.categoryPath?.[0] ?? product.category;
  const docs = (await db.collection(C.products).where("activeCategories", "array-contains", key).limit(300).get()).docs.map(toProduct)
    .filter((p) => p._id !== product._id && p.profile === product.profile && p.nutritionBasis.unit === product.nutritionBasis.unit);
  const scores = await getScores(db, docs.map((d) => d._id));
  const candidates: Candidate[] = docs.filter((d) => scores.get(d._id) != null).map((d) => ({ id: d._id, product: d, score: scores.get(d._id) ?? null }));
  const cur: Candidate = { id: product._id, product, score: analysis.score };
  return { alternatives: rankAlternatives(cur, candidates, prefs, limit), candidateCount: candidates.length };
}
