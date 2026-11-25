import { ObjectId, type Db } from "mongodb";
import { col } from "./mongodb";
import { validateBarcode } from "./barcode";
import { fetchOffByBarcode } from "./off";
import { enrichProduct, mergeProducts, prio } from "./catalogue";
import { isSameProduct } from "./identity";
import { BASE_KNOWLEDGE, buildIndex, classifyIngredients, detectAllergens, parseIngredientText, normalizeName, type KnowledgeIndex } from "./ingredients";
import { computeScore } from "./score";
import { SCORE_VERSION } from "./scoring-config";
import { SEED_REGULATIONS, evaluateRegulations } from "./regulations";
import { interpretIngredients } from "./ai";
import type { IngredientInsight, Product, ProductAnalysis, RegulationRecord, ScanMethod } from "./types";

// ---- Knowledge base cache (MongoDB first, built-in fallback) -------------------------
let kbCache: { at: number; index: KnowledgeIndex } | null = null;
export async function getKnowledgeIndex(db: Db): Promise<KnowledgeIndex> {
  if (kbCache && Date.now() - kbCache.at < 5 * 60_000) return kbCache.index;
  const docs = await col.ingredients(db).find({}).toArray();
  const index = buildIndex(docs.length ? docs : BASE_KNOWLEDGE);
  kbCache = { at: Date.now(), index };
  return index;
}

let regCache: { at: number; docs: RegulationRecord[] } | null = null;
async function getRegulations(db: Db): Promise<RegulationRecord[]> {
  if (regCache && Date.now() - regCache.at < 5 * 60_000) return regCache.docs;
  const docs = await col.regulations(db).find({}).toArray();
  regCache = { at: Date.now(), docs: docs.length ? docs : (SEED_REGULATIONS as RegulationRecord[]) };
  return regCache.docs;
}

// ---- Analysis ------------------------------------------------------------------------
export async function buildAnalysis(db: Db, product: Product & { _id: ObjectId }, opts: { useAi?: boolean } = {}): Promise<ProductAnalysis> {
  const index = await getKnowledgeIndex(db);
  const parsed = parseIngredientText(product.ingredientsText ?? product.ingredients.join(", "));
  let insights: IngredientInsight[] = classifyIngredients(parsed, index);
  if (opts.useAi) {
    const unknown = insights.filter((i) => i.source === "unclassified").map((i) => i.name);
    const ai = await interpretIngredients(unknown);
    const byName = new Map(ai.map((a) => [normalizeName(a.name), a]));
    insights = insights.map((i) => (i.source === "unclassified" && byName.has(normalizeName(i.name)) ? byName.get(normalizeName(i.name))! : i));
  }
  const score = computeScore({ nutrition: product.nutrition, profile: product.profile, ingredientInsights: insights, nova: product.nova, basisUnit: product.nutritionBasis.unit });
  const allergenReport = detectAllergens(product);
  // AI-tagged allergen hints are surfaced as "unknown" (needs checking), never as "contains".
  for (const i of insights) if (i.source === "ai" && i.allergen && !allergenReport.findings.some((f) => f.allergen === i.allergen)) {
    allergenReport.findings.push({ allergen: i.allergen, level: "unknown", evidence: [`AI suggests "${i.name}" may relate to ${i.allergen}. Unverified.`] });
  }
  const regulatory = evaluateRegulations(insights, await getRegulations(db));
  return { ...score, productId: product._id, generatedAt: new Date(), ingredientInsights: insights, allergenReport, regulatory };
}

/** Return stored analysis when fresh, otherwise recompute and upsert. */
export async function getOrComputeAnalysis(db: Db, product: Product & { _id: ObjectId }, force = false): Promise<ProductAnalysis> {
  const coll = col.analysis(db);
  if (!force) {
    const existing = await coll.findOne({ productId: product._id, scoreVersion: SCORE_VERSION });
    if (existing && existing.generatedAt >= product.updatedAt) return existing;
  }
  const analysis = await buildAnalysis(db, product, { useAi: true });
  const { _id: _ignore, ...doc } = analysis;
  await coll.updateOne({ productId: product._id, scoreVersion: SCORE_VERSION }, { $set: doc }, { upsert: true });
  return analysis;
}

// ---- Persistence ---------------------------------------------------------------------
/** Find an existing record for the same product when there is no barcode match (identity rules in lib/identity.ts). */
export async function findDuplicate(db: Db, p: Product): Promise<(Product & { _id: ObjectId }) | null> {
  const coll = col.products(db);
  if (p.barcode) { const hit = await coll.findOne({ barcode: p.barcode }); if (hit) return hit as Product & { _id: ObjectId }; }
  if (!p.brandNorm || !p.productType) return null;
  const nearby = await coll.find({ brandNorm: p.brandNorm, productType: p.productType }).limit(60).toArray();
  return (nearby.find((x) => isSameProduct(x, p)) as (Product & { _id: ObjectId }) | undefined) ?? null;
}

/**
 * UPSERT with source-aware merging.
 *  - new product            -> insert
 *  - same product exists    -> merge: the higher-priority source wins field by field,
 *                              lower-priority data only fills gaps (it never silently overwrites)
 * The barcode unique index plus findOneAndUpdate/upsert keeps this safe under concurrent requests.
 */
export async function upsertProduct(db: Db, input: Product, opts: { isIndian?: boolean } = {}): Promise<{ product: Product & { _id: ObjectId }; created: boolean; merged: boolean }> {
  const coll = col.products(db);
  const p = input.identityKey ? input : enrichProduct(input, { isIndian: opts.isIndian });
  const existing = await findDuplicate(db, p);
  if (!existing) {
    const { _id: _x, ...doc } = p;
    if (p.barcode) {
      const { createdAt, ...rest } = doc;
      const res = await coll.updateOne({ barcode: p.barcode }, { $set: { ...rest, updatedAt: new Date() }, $setOnInsert: { createdAt } }, { upsert: true });
      const saved = (await coll.findOne({ barcode: p.barcode }))!;
      return { product: saved as Product & { _id: ObjectId }, created: res.upsertedCount > 0, merged: res.upsertedCount === 0 };
    }
    const res = await coll.insertOne(doc as Product);
    return { product: { ...p, _id: res.insertedId }, created: true, merged: false };
  }
  const { merged } = mergeProducts(existing, p);
  const { _id: _z, ...doc } = merged;
  await coll.replaceOne({ _id: existing._id }, doc as Product);
  return { product: { ...merged, _id: existing._id }, created: false, merged: true };
}

/** Persist a product and make sure its analysis exists. */
export async function saveProductWithAnalysis(db: Db, p: Product, opts: { isIndian?: boolean } = {}) {
  const { product, created } = await upsertProduct(db, p, opts);
  const analysis = await getOrComputeAnalysis(db, product, true);
  return { product, analysis, created };
}

/** Old documents (saved before the catalogue upgrade) are upgraded the first time they are opened. */
async function ensureV2(db: Db, p: Product & { _id: ObjectId }): Promise<Product & { _id: ObjectId }> {
  if (p.identityKey && p.categoryPath && p.searchTokens) return p;
  const up = enrichProduct(p, { isIndian: p.barcode?.startsWith("890") || p.source.type !== "openfoodfacts" });
  const { _id, ...doc } = up;
  await col.products(db).updateOne({ _id: p._id }, { $set: doc });
  return { ...up, _id: p._id };
}

// ---- Resolution (MongoDB first, then Open Food Facts) --------------------------------
export type ResolveOutcome =
  | { status: "found"; product: Product & { _id: ObjectId }; analysis: ProductAnalysis; origin: "mongodb" | "openfoodfacts" }
  | { status: "not_found"; barcode: string; issues: string[] }
  | { status: "invalid_barcode"; reason: string }
  | { status: "external_unavailable"; barcode: string; message: string };

export async function resolveProduct(db: Db, idOrBarcode: string): Promise<ResolveOutcome> {
  const coll = col.products(db);
  if (/^[a-f0-9]{24}$/i.test(idOrBarcode)) {
    const p0 = await coll.findOne({ _id: new ObjectId(idOrBarcode) });
    if (!p0) return { status: "not_found", barcode: idOrBarcode, issues: ["Product not found"] };
    const p = await ensureV2(db, p0 as Product & { _id: ObjectId });
    return { status: "found", product: p, analysis: await getOrComputeAnalysis(db, p), origin: "mongodb" };
  }
  const bc = validateBarcode(idOrBarcode);
  if (!bc.valid) return { status: "invalid_barcode", reason: bc.reason ?? "Invalid barcode" };

  const local = await coll.findOne({ barcode: bc.normalized }); // 1) MongoDB first
  if (local) { const p = await ensureV2(db, local as Product & { _id: ObjectId }); return { status: "found", product: p, analysis: await getOrComputeAnalysis(db, p), origin: "mongodb" }; }

  try {
    const { product, issues } = await fetchOffByBarcode(bc.normalized); // 2) Open Food Facts
    if (!product) return { status: "not_found", barcode: bc.normalized, issues };
    const saved = await saveProductWithAnalysis(db, product); // 3) normalize -> validate -> classify -> score -> store
    return { status: "found", product: saved.product, analysis: saved.analysis, origin: "openfoodfacts" };
  } catch (e) {
    return { status: "external_unavailable", barcode: bc.normalized, message: (e as Error).message };
  }
}

export async function recordScan(db: Db, userId: string, productId: ObjectId, method: ScanMethod) {
  await col.users(db).updateOne({ userId }, { $setOnInsert: { userId, createdAt: new Date() }, $set: { lastSeenAt: new Date() } }, { upsert: true });
  await col.history(db).insertOne({ userId, productId, method, scannedAt: new Date() });
}
