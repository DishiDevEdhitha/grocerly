import { C, arrayUnion, increment, withId, type DB, type Snap } from "./db";
import { validateBarcode } from "./barcode";
import { fetchOffByBarcode } from "./off";
import { enrichProduct, mergeProducts } from "./catalogue";
import { isSameProduct } from "./identity";
import { BASE_KNOWLEDGE, buildIndex, classifyIngredients, detectAllergens, parseIngredientText, normalizeName, type KnowledgeIndex } from "./ingredients";
import { computeScore } from "./score";
import { SCORE_VERSION } from "./scoring-config";
import { SEED_REGULATIONS, evaluateRegulations } from "./regulations";
import { interpretIngredients } from "./ai";
import type { IngredientInsight, Product, ProductAnalysis, RegulationRecord, ScanMethod } from "./types";

export type P = Product & { _id: string };
export const toProduct = (s: Snap): P => withId<Product>(s);
export const analysisId = (productId: string, version = SCORE_VERSION) => `${productId}_${version}`;

// ---- Reading products ------------------------------------------------------------------
/** Product documents use the barcode as their id (so a barcode can never be stored twice); products without a barcode get an automatic id. */
export async function getProductById(db: DB, id: string): Promise<P | null> {
  const s = await db.collection(C.products).doc(id).get();
  return s.exists ? toProduct(s) : null;
}
export async function getProductsByIds(db: DB, ids: string[]): Promise<Map<string, P>> {
  const out = new Map<string, P>(); const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 100) {
    const snaps = await db.getAll(...uniq.slice(i, i + 100).map((id) => db.collection(C.products).doc(id)));
    for (const s of snaps) if (s.exists) out.set(s.id, toProduct(s));
  }
  return out;
}
/** Score of each product (for the current score version). Products without an analysis are absent from the map. */
export async function getScores(db: DB, ids: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(); const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const snaps = await db.getAll(...chunk.map((id) => db.collection(C.analysis).doc(analysisId(id))));
    snaps.forEach((s, k) => { if (s.exists) out.set(chunk[k], (s.data() as ProductAnalysis).score ?? null); });
  }
  return out;
}

// ---- Knowledge base + regulations (small collections, cached for 5 minutes) ------------
let kbCache: { at: number; index: KnowledgeIndex } | null = null;
export async function getKnowledgeIndex(db: DB): Promise<KnowledgeIndex> {
  if (kbCache && Date.now() - kbCache.at < 5 * 60_000) return kbCache.index;
  const docs = (await db.collection(C.ingredients).get()).docs.map((d) => d.data() as never);
  const index = buildIndex(docs.length ? docs : BASE_KNOWLEDGE);
  kbCache = { at: Date.now(), index };
  return index;
}
export const clearKnowledgeCaches = () => { kbCache = null; regCache = null; };

let regCache: { at: number; docs: RegulationRecord[] } | null = null;
async function getRegulations(db: DB): Promise<RegulationRecord[]> {
  if (regCache && Date.now() - regCache.at < 5 * 60_000) return regCache.docs;
  const docs = (await db.collection(C.regulations).get()).docs.map((d) => d.data() as RegulationRecord);
  regCache = { at: Date.now(), docs: docs.length ? docs : (SEED_REGULATIONS as RegulationRecord[]) };
  return regCache.docs;
}

// ---- Analysis ------------------------------------------------------------------------
export async function buildAnalysis(db: DB, product: P, opts: { useAi?: boolean } = {}): Promise<ProductAnalysis> {
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

/** Return the stored analysis when fresh, otherwise recompute and save (document id = productId_scoreVersion, so there is only ever one). */
export async function getOrComputeAnalysis(db: DB, product: P, force = false): Promise<ProductAnalysis> {
  const ref = db.collection(C.analysis).doc(analysisId(product._id));
  if (!force) {
    const s = await ref.get();
    if (s.exists) { const existing = s.data() as ProductAnalysis; if (existing.generatedAt >= product.updatedAt) return existing; }
  }
  const analysis = await buildAnalysis(db, product, { useAi: true });
  await ref.set(analysis as never);
  return analysis;
}

// ---- Saving products -------------------------------------------------------------------
/** Existing record for the same product? Barcode first (the barcode IS the document id), otherwise the identity rules in lib/identity.ts. */
export async function findDuplicate(db: DB, p: Product): Promise<P | null> {
  if (p.barcode) { const hit = await getProductById(db, p.barcode); if (hit) return hit; }
  if (!p.brandNorm || !p.productType) return null;
  const nearby = (await db.collection(C.products).where("brandNorm", "==", p.brandNorm).limit(100).get()).docs.map(toProduct);
  return nearby.find((x) => x.productType === p.productType && isSameProduct(x, p)) ?? null;
}

/**
 * UPSERT with source-aware merging.
 *  - new product          -> create (document id = barcode, or an automatic id)
 *  - same product exists  -> merge: the higher-priority source wins field by field, lower-priority data only fills gaps
 */
export async function upsertProduct(db: DB, input: Product, opts: { isIndian?: boolean } = {}): Promise<{ product: P; created: boolean; merged: boolean }> {
  const coll = db.collection(C.products);
  const p = input.identityKey ? input : enrichProduct(input, { isIndian: opts.isIndian });
  const existing = await findDuplicate(db, p);
  const now = new Date();
  let saved: P; let created = false;
  if (!existing) {
    const ref = p.barcode ? coll.doc(p.barcode) : coll.doc();
    const { _id: _x, ...doc } = p as P;
    saved = { ...doc, updatedAt: now, scanCount: p.scanCount ?? 0, _id: ref.id } as P;
    const { _id: _y, ...toSave } = saved; await ref.set(toSave as never); created = true;
  } else {
    const { merged } = mergeProducts(existing, p);
    merged.scanCount = existing.scanCount ?? 0;
    saved = { ...merged, _id: existing._id } as P;
    const { _id: _z, ...toSave } = saved; await coll.doc(existing._id).set(toSave as never);
  }
  if (saved.activeBrand) await db.collection(C.meta).doc("brands").set({ brands: arrayUnion(saved.activeBrand) }, { merge: true });
  return { product: saved, created, merged: !created };
}

/** Persist a product and make sure its analysis exists. */
export async function saveProductWithAnalysis(db: DB, p: Product, opts: { isIndian?: boolean } = {}) {
  const { product, created } = await upsertProduct(db, p, opts);
  const analysis = await getOrComputeAnalysis(db, product, true);
  return { product, analysis, created };
}

/** Records saved before an upgrade are brought up to date the first time they are opened. */
async function ensureV2(db: DB, p: P): Promise<P> {
  if (p.identityKey && p.categoryPath && p.searchTokens && p.activeCategories) return p;
  const up = enrichProduct(p, { isIndian: p.barcode?.startsWith("890") || p.source.type !== "openfoodfacts" });
  const { _id, ...doc } = up as P;
  await db.collection(C.products).doc(p._id).set(doc as never);
  return { ...up, _id: p._id } as P;
}

// ---- Resolution (catalogue first, then Open Food Facts) -------------------------------
export type ResolveOutcome =
  | { status: "found"; product: P; analysis: ProductAnalysis; origin: "catalogue" | "openfoodfacts" }
  | { status: "not_found"; barcode: string; issues: string[] }
  | { status: "invalid_barcode"; reason: string }
  | { status: "external_unavailable"; barcode: string; message: string };

export async function resolveProduct(db: DB, idOrBarcode: string): Promise<ResolveOutcome> {
  if (!/^\d+$/.test(idOrBarcode)) { // a product id (products without a barcode)
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(idOrBarcode)) return { status: "not_found", barcode: idOrBarcode, issues: ["Product not found"] };
    const p0 = await getProductById(db, idOrBarcode);
    if (!p0) return { status: "not_found", barcode: idOrBarcode, issues: ["Product not found"] };
    const p = await ensureV2(db, p0);
    return { status: "found", product: p, analysis: await getOrComputeAnalysis(db, p), origin: "catalogue" };
  }
  const bc = validateBarcode(idOrBarcode);
  if (!bc.valid) return { status: "invalid_barcode", reason: bc.reason ?? "Invalid barcode" };

  const local = await getProductById(db, bc.normalized); // 1) Grocerly's own catalogue first
  if (local) { const p = await ensureV2(db, local); return { status: "found", product: p, analysis: await getOrComputeAnalysis(db, p), origin: "catalogue" }; }

  try {
    const { product, issues } = await fetchOffByBarcode(bc.normalized); // 2) Open Food Facts
    if (!product) return { status: "not_found", barcode: bc.normalized, issues };
    const saved = await saveProductWithAnalysis(db, product); // 3) normalise -> validate -> classify -> score -> store
    return { status: "found", product: saved.product, analysis: saved.analysis, origin: "openfoodfacts" };
  } catch (e) {
    return { status: "external_unavailable", barcode: bc.normalized, message: (e as Error).message };
  }
}

/** A person opened a product: save it in their history (users/{id}/history) and bump the product's popularity counter. */
export async function recordScan(db: DB, userId: string, productId: string, method: ScanMethod) {
  const now = new Date();
  const user = db.collection(C.users).doc(userId);
  await user.set({ userId, lastSeenAt: now }, { merge: true });
  await user.collection("history").doc().set({ productId, method, scannedAt: now });
  await db.collection(C.products).doc(productId).update({ scanCount: increment(1) }).catch(() => undefined);
}
