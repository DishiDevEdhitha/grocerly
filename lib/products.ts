import { ObjectId, type Db } from "mongodb";
import { col } from "./mongodb";
import { validateBarcode } from "./barcode";
import { fetchOffByBarcode, searchOff } from "./off";
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

async function getRegulations(db: Db): Promise<RegulationRecord[]> {
  const docs = await col.regulations(db).find({}).toArray();
  return docs.length ? docs : (SEED_REGULATIONS as RegulationRecord[]);
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
/**
 * UPSERT: insert if the barcode is new, otherwise update. `$setOnInsert` keeps createdAt stable.
 * Products without a barcode (photo-only submissions) are simply inserted.
 * A user-verified (ocr/manual) product is never overwritten by external data.
 */
export async function upsertProduct(db: Db, p: Product): Promise<{ product: Product & { _id: ObjectId }; created: boolean }> {
  const coll = col.products(db);
  if (!p.barcode) {
    const { _id: _x, ...doc } = p;
    const res = await coll.insertOne(doc as Product);
    return { product: { ...p, _id: res.insertedId }, created: true };
  }
  const existing = await coll.findOne({ barcode: p.barcode });
  if (existing && existing.source.type !== "openfoodfacts" && p.source.type === "openfoodfacts") {
    return { product: existing as Product & { _id: ObjectId }, created: false };
  }
  const { createdAt, _id: _y, ...rest } = p;
  const res = await coll.updateOne(
    { barcode: p.barcode },
    { $set: { ...rest, updatedAt: new Date() }, $setOnInsert: { createdAt } },
    { upsert: true },
  );
  const saved = (await coll.findOne({ barcode: p.barcode }))!;
  return { product: saved as Product & { _id: ObjectId }, created: res.upsertedCount > 0 };
}

/** Persist a product and make sure its analysis exists. */
export async function saveProductWithAnalysis(db: Db, p: Product) {
  const { product, created } = await upsertProduct(db, p);
  const analysis = await getOrComputeAnalysis(db, product, true);
  return { product, analysis, created };
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
    const p = await coll.findOne({ _id: new ObjectId(idOrBarcode) });
    if (!p) return { status: "not_found", barcode: idOrBarcode, issues: ["Product not found"] };
    return { status: "found", product: p as Product & { _id: ObjectId }, analysis: await getOrComputeAnalysis(db, p as Product & { _id: ObjectId }), origin: "mongodb" };
  }
  const bc = validateBarcode(idOrBarcode);
  if (!bc.valid) return { status: "invalid_barcode", reason: bc.reason ?? "Invalid barcode" };

  const local = await coll.findOne({ barcode: bc.normalized }); // 1) MongoDB first
  if (local) return { status: "found", product: local as Product & { _id: ObjectId }, analysis: await getOrComputeAnalysis(db, local as Product & { _id: ObjectId }), origin: "mongodb" };

  try {
    const { product, issues } = await fetchOffByBarcode(bc.normalized); // 2) Open Food Facts
    if (!product) return { status: "not_found", barcode: bc.normalized, issues };
    const saved = await saveProductWithAnalysis(db, product); // 3) normalize -> validate -> score -> store
    return { status: "found", product: saved.product, analysis: saved.analysis, origin: "openfoodfacts" };
  } catch (e) {
    return { status: "external_unavailable", barcode: bc.normalized, message: (e as Error).message };
  }
}

// ---- Search --------------------------------------------------------------------------
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function searchProducts(db: Db, q: string, opts: { external?: boolean; limit?: number } = {}) {
  const limit = opts.limit ?? 20;
  const query = q.trim().slice(0, 80);
  if (query.length < 2) return { results: [] as (Product & { _id: ObjectId })[], externalError: undefined as string | undefined };
  const coll = col.products(db);
  let results = (await coll.find({ $text: { $search: query } }, { projection: { score: { $meta: "textScore" } } }).sort({ score: { $meta: "textScore" } }).limit(limit).toArray()) as (Product & { _id: ObjectId })[];
  if (results.length < 3) { // partial-word fallback ("mag" -> "Maggi")
    const rx = new RegExp(escRe(query), "i");
    const more = (await coll.find({ $or: [{ name: rx }, { brand: rx }] }).limit(limit).toArray()) as (Product & { _id: ObjectId })[];
    const ids = new Set(results.map((r) => String(r._id)));
    results = [...results, ...more.filter((m) => !ids.has(String(m._id)))];
  }
  let externalError: string | undefined;
  if (opts.external && results.length < 5) {
    try {
      const found = await searchOff(query, 10);
      for (const p of found.slice(0, 10)) {
        const { product } = await upsertProduct(db, p);
        await getOrComputeAnalysis(db, product);
        if (!results.some((r) => String(r._id) === String(product._id))) results.push(product);
      }
    } catch (e) { externalError = (e as Error).message; }
  }
  return { results: results.slice(0, limit), externalError };
}

export async function recordScan(db: Db, userId: string, productId: ObjectId, method: ScanMethod) {
  await col.users(db).updateOne({ userId }, { $setOnInsert: { userId, createdAt: new Date() }, $set: { lastSeenAt: new Date() } }, { upsert: true });
  await col.history(db).insertOne({ userId, productId, method, scannedAt: new Date() });
}
