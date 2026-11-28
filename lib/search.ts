import { C, arrayUnion, type DB, type Query } from "./db";
import { buildChips, parseIntent, relevance, sortCandidates, type Chip, type SearchIntent, type SortKey } from "./search-core";
import { keyIndicators, type NutrientLevel } from "./levels";
import { norm } from "./identity";
import { searchOff } from "./off";
import { DEPARTMENTS } from "./taxonomy";
import { upsertProduct, getOrComputeAnalysis, getScores, toProduct, type P } from "./products";
import type { Nutrition } from "./types";

const PAGE = 12;

export interface ProductCardData {
  id: string; name: string; brand?: string; quantity?: string; category?: string; productType?: string;
  image?: string; score: number | null; indicators: Pick<NutrientLevel, "key" | "label" | "tone" | "value">[];
  vegetarian: boolean | null; confidence?: string;
}

// ---- Known brands (used to recognise "maggi" as a brand). Stored in one small document: meta/brands ----
let brandCache: { at: number; brands: string[] } | null = null;
export async function getKnownBrands(db: DB): Promise<string[]> {
  if (brandCache && Date.now() - brandCache.at < 10 * 60_000) return brandCache.brands;
  const ref = db.collection("meta").doc("brands");
  const snap = await ref.get();
  let brands = (snap.data()?.brands as string[] | undefined) ?? [];
  if (!brands.length) { // first run: build the list from the catalogue once
    const docs = (await db.collection(C.products).where("activeBrand", ">=", "").limit(5000).get()).docs;
    brands = [...new Set(docs.map((d) => d.data()?.activeBrand as string).filter(Boolean))];
    if (brands.length) await ref.set({ brands: arrayUnion(...brands) }, { merge: true });
  }
  brandCache = { at: Date.now(), brands };
  return brands;
}
export const clearSearchCaches = () => { brandCache = null; };

const qtyText = (q?: { value: number; unit: string }) => (q ? (q.unit === "g" && q.value >= 1000 ? `${q.value / 1000} kg` : q.unit === "ml" && q.value >= 1000 ? `${q.value / 1000} L` : `${q.value} ${q.unit}`) : undefined);

export function toCard(p: P, score: number | null): ProductCardData {
  return {
    id: p._id, name: p.name, brand: p.brand, quantity: qtyText(p.quantity), category: p.categoryPath?.slice(0, 2).join(" › ") || p.category, productType: p.productType,
    image: p.imageSmall ?? p.image ?? p.images?.front, score,
    indicators: keyIndicators(p.nutrition, p.nutritionBasis?.unit ?? "g").map((i) => ({ key: i.key, label: i.label, tone: i.tone, value: i.value })),
    vegetarian: p.dietary?.vegetarian ?? null, confidence: p.confidence?.overall,
  };
}

export interface SearchParams { q?: string; type?: string; brand?: string; cat?: string; veg?: boolean; sort?: SortKey; page?: number; external?: boolean }
export interface SearchResponse {
  items: ProductCardData[]; total: number; page: number; hasMore: boolean; chips: Chip[]; brands: { label: string; norm: string; count: number }[];
  intent: { brand?: string; categories: string[] }; externalError?: string; externalAdded?: number;
}

/**
 * Candidate products for a query. Firestore queries use ONE filter each (no composite indexes needed):
 *   brand      -> where activeBrand == "maggi"
 *   category   -> where activeCategories array-contains "Cheese"
 *   word       -> where activeTokens array-contains "oreo"
 * The remaining conditions are applied in code. The active* fields only exist on active products.
 */
async function loadCandidates(db: DB, q: string, intent: SearchIntent, cat?: string): Promise<P[]> {
  const coll = db.collection(C.products);
  const get = async (query: Query) => (await query.limit(400).get()).docs.map(toProduct);
  const hasAll = (p: P, toks: string[]) => toks.every((t) => (p.searchTokens ?? []).includes(t));
  const inNodes = (p: P) => !intent.nodeNames.length || intent.nodeNames.some((n) => p.categoryPath?.includes(n));
  let docs: P[] = [];
  if (q.length >= 2) {
    if (intent.brand) {
      const brandDocs = await get(coll.where("activeBrand", "==", intent.brand));
      docs = brandDocs.filter((p) => inNodes(p) && hasAll(p, intent.freeTokens));
      if (!docs.length) docs = brandDocs.filter((p) => hasAll(p, intent.freeTokens)); // relax: drop the category
    } else if (intent.nodeNames.length) {
      const map = new Map<string, P>();
      for (const name of intent.nodeNames.slice(0, 6)) for (const p of await get(coll.where("activeCategories", "array-contains", name))) map.set(p._id, p);
      docs = [...map.values()].filter((p) => hasAll(p, intent.freeTokens));
    } else if (intent.freeTokens.length) {
      docs = (await get(coll.where("activeTokens", "array-contains", intent.freeTokens[0]))).filter((p) => hasAll(p, intent.freeTokens));
    }
    if (!docs.length && intent.freeTokens.length) { // typing "kurk" should still find Kurkure: prefix match on the name
      const last = intent.freeTokens[intent.freeTokens.length - 1];
      docs = (await get(coll.where("nameNorm", ">=", last).where("nameNorm", "<", last + "\uf8ff")))
        .filter((p) => p.catalogStatus === "active" && (!intent.brand || p.brandNorm === intent.brand));
    }
  } else if (cat) docs = await get(coll.where("activeCategories", "array-contains", cat));
  return docs.filter((p) => p.catalogStatus === "active" && (!cat || p.categoryPath?.includes(cat)));
}

/** Catalogue search: intent parsing -> indexed query -> relevance ranking -> chips -> pagination. */
export async function searchCatalogue(db: DB, params: SearchParams): Promise<SearchResponse> {
  const q = (params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, params.page ?? 1);
  let intent: SearchIntent = { raw: q, tokens: [], nodes: [], nodeNames: [], freeTokens: [] };
  if (q.length >= 2) intent = parseIntent(q, await getKnownBrands(db));
  let docs = await loadCandidates(db, q, intent, params.cat);
  let externalError: string | undefined; let externalAdded = 0;

  // Optional, explicit "search wider": Open Food Facts (India only); only records passing the quality gate are saved.
  if (params.external && q.length >= 2 && docs.length < 5) {
    try {
      for (const { product, isIndian } of await searchOff(q, 12, { india: true })) {
        if (!isIndian) continue;
        const { product: saved, created } = await upsertProduct(db, product, { isIndian });
        if (created) { externalAdded++; await getOrComputeAnalysis(db, saved); }
      }
      if (externalAdded) { clearSearchCaches(); intent = parseIntent(q, await getKnownBrands(db)); docs = await loadCandidates(db, q, intent, params.cat); }
    } catch (e) { externalError = (e as Error).message; }
  }

  // Chips come from the matched products BEFORE the chip/brand/diet filters are applied.
  const chips = buildChips(docs);
  const brandCounts = new Map<string, { label: string; n: number }>();
  for (const d of docs) if (d.brandNorm) { const c = brandCounts.get(d.brandNorm) ?? { label: d.brand ?? d.brandNorm, n: 0 }; c.n++; brandCounts.set(d.brandNorm, c); }
  const brands = [...brandCounts.entries()].map(([n, v]) => ({ norm: n, label: v.label, count: v.n })).sort((a, b) => b.count - a.count).slice(0, 12);

  let list = docs;
  if (params.type) list = list.filter((d) => d.productType === params.type);
  if (params.brand) list = list.filter((d) => d.brandNorm === params.brand);
  if (params.veg) list = list.filter((d) => d.dietary?.vegetarian === true);

  const scoreBy = await getScores(db, list.map((d) => d._id));
  const ranked = sortCandidates(list.map((d) => ({ doc: d, relevance: relevance({ id: d._id, name: d.name, nameNorm: d.nameNorm, brandNorm: d.brandNorm, productType: d.productType, categoryPath: d.categoryPath, qualityScore: d.qualityScore, image: d.image ?? d.images?.front, hasNutrition: Object.keys(d.nutrition ?? {}).length >= 3 }, intent), score: scoreBy.get(d._id) ?? null, nutrition: d.nutrition as Nutrition })), params.sort ?? "relevance");
  const slice = ranked.slice((page - 1) * PAGE, page * PAGE);
  return {
    items: slice.map((r) => toCard(r.doc, r.score)), total: ranked.length, page, hasMore: page * PAGE < ranked.length, chips, brands,
    intent: { brand: intent.brand, categories: intent.nodes.map((p) => p.join(" › ")) }, externalError, externalAdded: externalAdded || undefined,
  };
}

/** Data for the home screen: real departments with counts + popular products (most opened). */
export async function homeData(db: DB) {
  const coll = db.collection(C.products);
  const counts = await Promise.all(DEPARTMENTS.map(async (name) => ({ name, count: await coll.where("activeDepartment", "==", name).count() })));
  const departments = counts.filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
  let docs = (await coll.orderBy("scanCount", "desc").limit(30).get()).docs.map(toProduct).filter((p) => p.catalogStatus === "active" && (p.scanCount ?? 0) > 0);
  if (docs.length < 8) { // a fresh catalogue: show the most complete records instead
    const more = (await coll.where("activeBrand", ">=", "").limit(120).get()).docs.map(toProduct).filter((p) => p.image).sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)).slice(0, 12);
    const have = new Set(docs.map((d) => d._id)); docs = [...docs, ...more.filter((m) => !have.has(m._id))];
  }
  docs = docs.slice(0, 10);
  const scores = await getScores(db, docs.map((d) => d._id));
  return { departments, popular: docs.map((d) => toCard(d, scores.get(d._id) ?? null)) };
}

export { norm };
