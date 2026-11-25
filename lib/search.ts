import type { Db, ObjectId } from "mongodb";
import { col } from "./mongodb";
import { buildChips, parseIntent, relevance, sortCandidates, type Chip, type SearchIntent, type SortKey } from "./search-core";
import { keyIndicators, type NutrientLevel } from "./levels";
import { SCORE_VERSION } from "./scoring-config";
import { norm } from "./identity";
import { searchOff } from "./off";
import { upsertProduct, getOrComputeAnalysis } from "./products";
import type { Nutrition, Product } from "./types";

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PAGE = 12;

export interface ProductCardData {
  id: string; name: string; brand?: string; quantity?: string; category?: string; productType?: string;
  image?: string; score: number | null; indicators: Pick<NutrientLevel, "key" | "label" | "tone" | "value">[];
  vegetarian: boolean | null; confidence?: string;
}

let brandCache: { at: number; brands: string[] } | null = null;
/** Distinct normalised brands in the ACTIVE catalogue (cached for 10 minutes). */
export async function getKnownBrands(db: Db): Promise<string[]> {
  if (brandCache && Date.now() - brandCache.at < 10 * 60_000) return brandCache.brands;
  const rows = await col.products(db).aggregate<{ _id: string }>([{ $match: { catalogStatus: "active", brandNorm: { $nin: [null, ""] } } }, { $group: { _id: "$brandNorm" } }]).toArray();
  brandCache = { at: Date.now(), brands: rows.map((r) => r._id) };
  return brandCache.brands;
}
export const clearSearchCaches = () => { brandCache = null; };

const qtyText = (q?: { value: number; unit: string }) => (q ? (q.unit === "g" && q.value >= 1000 ? `${q.value / 1000} kg` : q.unit === "ml" && q.value >= 1000 ? `${q.value / 1000} L` : `${q.value} ${q.unit}`) : undefined);

export function toCard(p: Product & { _id: ObjectId }, score: number | null): ProductCardData {
  return {
    id: String(p._id), name: p.name, brand: p.brand, quantity: qtyText(p.quantity), category: p.categoryPath?.slice(0, 2).join(" › ") || p.category, productType: p.productType,
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

const LIGHT = { projection: { name: 1, nameNorm: 1, brand: 1, brandNorm: 1, productType: 1, categoryPath: 1, qualityScore: 1, image: 1, imageSmall: 1, images: 1, quantity: 1, nutrition: 1, nutritionBasis: 1, dietary: 1, confidence: 1, category: 1 } };

/** Catalogue search: intent parsing -> indexed query -> relevance ranking -> chips -> pagination. */
export async function searchCatalogue(db: Db, params: SearchParams): Promise<SearchResponse> {
  const q = (params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, params.page ?? 1);
  const coll = col.products(db);
  let intent: SearchIntent = { raw: q, tokens: [], nodes: [], nodeNames: [], freeTokens: [] };
  const filter: Record<string, unknown> = { catalogStatus: "active" };
  let externalError: string | undefined; let externalAdded = 0;

  const run = async (f: Record<string, unknown>) => (await coll.find(f, LIGHT).limit(400).toArray()) as unknown as (Product & { _id: ObjectId })[];

  if (params.cat) filter.categoryPath = params.cat;
  let docs: (Product & { _id: ObjectId })[] = [];
  if (q.length >= 2) {
    intent = parseIntent(q, await getKnownBrands(db));
    const f = { ...filter };
    if (intent.brand) f.brandNorm = intent.brand;
    if (intent.nodeNames.length) f.categoryPath = f.categoryPath ? { $all: [f.categoryPath as string], $in: intent.nodeNames } : { $in: intent.nodeNames };
    if (intent.freeTokens.length) f.searchTokens = { $all: intent.freeTokens };
    docs = await run(f);
    // Relax progressively instead of returning nothing: first drop the category, then try prefix match.
    if (!docs.length && intent.brand && intent.nodeNames.length) { const g = { ...f }; delete g.categoryPath; docs = await run(g); }
    if (!docs.length && intent.freeTokens.length) {
      const last = intent.freeTokens[intent.freeTokens.length - 1];
      const g: Record<string, unknown> = { ...filter, nameNorm: new RegExp(`(^| )${escRe(last)}`) };
      if (intent.brand) g.brandNorm = intent.brand;
      docs = await run(g);
    }
  } else if (params.cat) docs = await run(filter);

  // Optional, explicit "search wider": ask Open Food Facts (India only), keep only records that pass the quality gate.
  if (params.external && q.length >= 2 && docs.length < 5) {
    try {
      const found = await searchOff(q, 12, { india: true });
      for (const { product, isIndian } of found) {
        if (!isIndian) continue;
        const { product: saved, created } = await upsertProduct(db, product, { isIndian });
        if (created) { externalAdded++; await getOrComputeAnalysis(db, saved); }
      }
      if (externalAdded) { clearSearchCaches(); intent = parseIntent(q, await getKnownBrands(db)); const f = { ...filter } as Record<string, unknown>; if (intent.brand) f.brandNorm = intent.brand; if (intent.nodeNames.length) f.categoryPath = { $in: intent.nodeNames }; if (intent.freeTokens.length) f.searchTokens = { $all: intent.freeTokens }; docs = await run(f); }
    } catch (e) { externalError = (e as Error).message; }
  }

  // Chips come from the matched products BEFORE the chip/brand/diet filters are applied.
  const chips = buildChips(docs);
  const brandCounts = new Map<string, { label: string; n: number }>();
  for (const d of docs) if (d.brandNorm) { const c = brandCounts.get(d.brandNorm) ?? { label: d.brand ?? d.brandNorm, n: 0 }; c.n++; brandCounts.set(d.brandNorm, c); }
  const brands = [...brandCounts.entries()].map(([norm, v]) => ({ norm, label: v.label, count: v.n })).sort((a, b) => b.count - a.count).slice(0, 12);

  let list = docs;
  if (params.type) list = list.filter((d) => d.productType === params.type);
  if (params.brand) list = list.filter((d) => d.brandNorm === params.brand);
  if (params.veg) list = list.filter((d) => d.dietary?.vegetarian === true);

  const scores = await col.analysis(db).find({ productId: { $in: list.map((d) => d._id) }, scoreVersion: SCORE_VERSION }, { projection: { productId: 1, score: 1 } }).toArray();
  const scoreBy = new Map(scores.map((s) => [String(s.productId), s.score]));
  const ranked = sortCandidates(list.map((d) => ({ doc: d, relevance: relevance({ id: String(d._id), name: d.name, nameNorm: d.nameNorm, brandNorm: d.brandNorm, productType: d.productType, categoryPath: d.categoryPath, qualityScore: d.qualityScore, image: d.image ?? d.images?.front, hasNutrition: Object.keys(d.nutrition ?? {}).length >= 3 }, intent), score: scoreBy.get(String(d._id)) ?? null, nutrition: d.nutrition as Nutrition })), params.sort ?? "relevance");
  const slice = ranked.slice((page - 1) * PAGE, page * PAGE);
  return {
    items: slice.map((r) => toCard(r.doc, r.score)), total: ranked.length, page, hasMore: page * PAGE < ranked.length, chips, brands,
    intent: { brand: intent.brand, categories: intent.nodes.map((p) => p.join(" › ")) }, externalError, externalAdded: externalAdded || undefined,
  };
}

/** Data for the home screen: real departments with counts + popular products. */
export async function homeData(db: Db) {
  const coll = col.products(db);
  const departments = await coll.aggregate<{ _id: string; count: number }>([{ $match: { catalogStatus: "active" } }, { $group: { _id: { $arrayElemAt: ["$categoryPath", 0] }, count: { $sum: 1 } } }, { $match: { _id: { $ne: null } } }, { $sort: { count: -1 } }]).toArray();
  const since = new Date(Date.now() - 30 * 864e5);
  const popularIds = await col.history(db).aggregate<{ _id: ObjectId; n: number }>([{ $match: { scannedAt: { $gte: since } } }, { $group: { _id: "$productId", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 24 }]).toArray();
  let docs = popularIds.length ? ((await coll.find({ _id: { $in: popularIds.map((p) => p._id) }, catalogStatus: "active" }, LIGHT).toArray()) as unknown as (Product & { _id: ObjectId })[]) : [];
  if (docs.length < 8) { // fall back to the most complete records so a fresh catalogue still looks good
    const more = (await coll.find({ catalogStatus: "active", image: { $exists: true, $ne: "" } }, LIGHT).sort({ qualityScore: -1 }).limit(12).toArray()) as unknown as (Product & { _id: ObjectId })[];
    const have = new Set(docs.map((d) => String(d._id))); docs = [...docs, ...more.filter((m) => !have.has(String(m._id)))];
  }
  docs = docs.slice(0, 10);
  const scores = await col.analysis(db).find({ productId: { $in: docs.map((d) => d._id) }, scoreVersion: SCORE_VERSION }, { projection: { productId: 1, score: 1 } }).toArray();
  const scoreBy = new Map(scores.map((s) => [String(s.productId), s.score]));
  return { departments: departments.map((d) => ({ name: d._id, count: d.count })), popular: docs.map((d) => toCard(d, scoreBy.get(String(d._id)) ?? null)) };
}

export { norm };
