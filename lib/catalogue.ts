import { classify } from "./taxonomy";
import { identityKey, nameCore, normBrand, productSearchTokens } from "./identity";
import { CORE_FIELDS, PROFILE_BY_ID } from "./scoring-config";
import type { CatalogStatus, ConfidenceLevel, NutrientKey, Nutrition, Product, Provenance, SourceEntry } from "./types";
import { NUTRIENT_KEYS } from "./types";

/**
 * Source priority. A higher number wins when two sources disagree about the same field.
 * Order requested for Grocerly: verified/own data > trusted Indian dataset > Open Food Facts > Gemini > user-typed.
 */
export const SOURCE_PRIORITY: Record<Provenance, number> = { dataset: 80, openfoodfacts: 60, gemini: 40, ocr: 35, manual: 30, ai: 10 };
export const prio = (s: Provenance | undefined) => SOURCE_PRIORITY[s ?? "manual"] ?? 0;

export const coreCount = (n: Nutrition) => CORE_FIELDS.filter((k) => n[k] != null).length;

/** 0..100: how complete and useful this record is. Used for ranking and the "needs review" gate. */
export function computeQuality(p: Product): number {
  let q = 0;
  if (p.brand) q += 15;
  if (p.name && p.name.trim().length >= 3) q += 10;
  if (p.barcode) q += 10;
  if (p.categoryPath && p.categoryPath[0] !== "Uncategorised") q += 10;
  q += Math.min(coreCount(p.nutrition), 6) * 5;
  if (p.ingredients?.length) q += 10;
  if (p.image || p.images?.front) q += 10;
  if (p.servingSize) q += 5;
  return Math.min(100, q);
}

const lvl = (avg: number): ConfidenceLevel => (avg >= 0.85 ? "high" : avg >= 0.6 ? "medium" : "low");

export function computeConfidence(p: Product): NonNullable<Product["confidence"]> {
  const metas = NUTRIENT_KEYS.map((k) => p.nutritionMeta?.[k]).filter(Boolean) as NonNullable<Product["nutritionMeta"]>[NutrientKey][];
  let nutrition: ConfidenceLevel = "unknown";
  if (metas.length) {
    const avg = metas.reduce((s, m) => s + (m!.confidence ?? 0.5), 0) / metas.length;
    nutrition = lvl(avg);
    const corroborated = metas.filter((m) => (m as { corroborated?: boolean }).corroborated).length;
    if (corroborated >= 3) nutrition = "verified"; // two independent sources agree on 3+ nutrients
    else if (metas.every((m) => m!.verifiedByUser) && metas.length >= 4 && nutrition !== "low") nutrition = "high";
  }
  const t = p.source.type;
  const ingredients: ConfidenceLevel = p.ingredients?.length ? (t === "dataset" ? "high" : "medium") : "unknown";
  const hasDeclared = (p.allergens?.declared?.length ?? 0) + (p.allergens?.traces?.length ?? 0) > 0;
  const allergens: ConfidenceLevel = hasDeclared ? "medium" : p.ingredients?.length ? "medium" : "unknown";
  const order: ConfidenceLevel[] = ["low", "medium", "high", "verified"];
  const known = [nutrition, ingredients, allergens].filter((x) => x !== "unknown");
  const overall: ConfidenceLevel = known.length ? known.reduce((a, b) => (order.indexOf(a) <= order.indexOf(b) ? a : b)) : "unknown";
  return { nutrition, ingredients, allergens, overall };
}

export function computeStatus(p: Product, opts: { isIndian?: boolean } = {}): CatalogStatus {
  const indian = opts.isIndian ?? (p.source.type !== "openfoodfacts");
  if (!indian) return "hidden";
  if (!p.brand || !p.name || p.name.trim().length < 3) return "needs_review";
  if (coreCount(p.nutrition) < 3) return "needs_review";
  return "active";
}

/** Fill every catalogue-v2 field from what the product already has. Safe to call repeatedly. */
export function enrichProduct(p: Product, opts: { isIndian?: boolean; forceStatus?: boolean } = {}): Product {
  const c = classify({ name: p.name, brand: p.brand, tags: p.categoryTags });
  const out: Product = { ...p };
  if (!out.categoryPath || out.categoryPath[0] === "Uncategorised") {
    out.categoryPath = c.path; out.productType = c.productType;
  } else out.productType = out.productType ?? out.categoryPath[out.categoryPath.length - 1];
  if (c.profile && (!out.profile || out.profile === "default")) out.profile = c.profile;
  out.profile = out.profile in PROFILE_BY_ID ? out.profile : "default";
  if (out.profile === "beverage") out.nutritionBasis = { amount: 100, unit: "ml" };
  if (!out.category || out.category === "Uncategorised") out.category = out.productType ?? "Uncategorised";
  out.brandNorm = normBrand(out.brand);
  out.nameNorm = nameCore(out.name, out.brand);
  out.identityKey = identityKey({ barcode: out.barcode, name: out.name, brand: out.brand, quantity: out.quantity, productType: out.productType });
  out.searchTokens = productSearchTokens({ name: out.name, brand: out.brand, productType: out.productType, categoryPath: out.categoryPath });
  if (!out.image && out.images?.front) out.image = out.images.front;
  if (!out.imageSmall && out.image) out.imageSmall = out.image;
  if (!out.sources?.length) out.sources = [{ source: out.source.type, confidence: out.source.confidence, ref: out.source.ref, url: out.source.url, fetchedAt: out.source.fetchedAt ?? new Date() }];
  out.qualityScore = computeQuality(out);
  out.confidence = computeConfidence(out);
  if (opts.forceStatus || !out.catalogStatus) out.catalogStatus = computeStatus(out, opts);
  return out;
}

// ---------------------------------------------------------------------------------
// Merging two records of the SAME product from different sources
// ---------------------------------------------------------------------------------
const within = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-9);

export interface MergeResult { merged: Product; changed: string[]; corroborated: NutrientKey[] }

/**
 * The higher-priority record is the "base". Fields the base lacks are filled from the other one.
 * A lower-priority source can NEVER overwrite a value a higher-priority source already supplied.
 * When two sources give (nearly) the same number for a nutrient, that nutrient is marked corroborated.
 */
export function mergeProducts(existing: Product, incoming: Product): MergeResult {
  const incomingWins = prio(incoming.source.type) > prio(existing.source.type);
  const base = incomingWins ? incoming : existing;
  const fill = incomingWins ? existing : incoming;
  const changed: string[] = [];
  const out: Product = { ...base };

  const nutrition: Nutrition = { ...fill.nutrition, ...base.nutrition };
  const nutritionMeta = { ...(fill.nutritionMeta ?? {}), ...(base.nutritionMeta ?? {}) } as NonNullable<Product["nutritionMeta"]>;
  const corroborated: NutrientKey[] = [];
  for (const k of NUTRIENT_KEYS) {
    const a = base.nutrition[k], b = fill.nutrition[k];
    if (a != null && b != null && within(a, b, 0.05)) {
      corroborated.push(k);
      nutritionMeta[k] = { ...(nutritionMeta[k] as object), corroborated: true, confidence: Math.max(base.nutritionMeta?.[k]?.confidence ?? 0.5, fill.nutritionMeta?.[k]?.confidence ?? 0.5, 0.9) } as never;
    }
  }
  out.nutrition = nutrition; out.nutritionMeta = nutritionMeta;
  if (Object.keys(nutrition).length !== Object.keys(existing.nutrition).length) changed.push("nutrition");

  out.nutritionPerServing = { ...(fill.nutritionPerServing ?? {}), ...(base.nutritionPerServing ?? {}) };
  if (!Object.keys(out.nutritionPerServing).length) delete out.nutritionPerServing;
  out.servingSize = base.servingSize ?? fill.servingSize;
  out.quantity = base.quantity ?? fill.quantity;
  if (!out.ingredients?.length && fill.ingredients?.length) { out.ingredients = fill.ingredients; out.ingredientsText = fill.ingredientsText; changed.push("ingredients"); }
  if (!((out.allergens?.declared?.length ?? 0) + (out.allergens?.traces?.length ?? 0)) && fill.allergens) out.allergens = fill.allergens;
  out.image = base.image ?? fill.image; out.imageSmall = base.imageSmall ?? fill.imageSmall;
  out.images = { ...(fill.images ?? {}), ...(base.images ?? {}) };
  out.dietary = { ...(fill.dietary ?? {}), ...(base.dietary ?? {}) };
  out.claims = [...new Set([...(fill.claims ?? []), ...(base.claims ?? [])])];
  out.purchaseLinks = { ...(fill.purchaseLinks ?? {}), ...(base.purchaseLinks ?? {}) };
  out.price = base.price ?? fill.price;
  if ((!out.brand || out.brand.length < 2) && fill.brand) out.brand = fill.brand;
  if ((!out.categoryPath || out.categoryPath[0] === "Uncategorised") && fill.categoryPath) { out.categoryPath = fill.categoryPath; out.productType = fill.productType; out.category = fill.category; }
  out.barcode = existing.barcode ?? incoming.barcode;
  out.createdAt = existing.createdAt ?? incoming.createdAt;
  out.updatedAt = new Date();
  // Provenance: keep every source seen (one entry per source+ref).
  const srcs: SourceEntry[] = [...(existing.sources ?? [{ source: existing.source.type, confidence: existing.source.confidence, ref: existing.source.ref, fetchedAt: existing.source.fetchedAt }]), ...(incoming.sources ?? [{ source: incoming.source.type, confidence: incoming.source.confidence, ref: incoming.source.ref, fetchedAt: incoming.source.fetchedAt }])];
  out.sources = [...new Map(srcs.map((s) => [`${s.source}|${s.ref ?? ""}`, s])).values()];
  out.source = base.source;
  const enriched = enrichProduct({ ...out, catalogStatus: undefined }, { isIndian: existing.catalogStatus !== "hidden" || incoming.catalogStatus !== "hidden" });
  // A product that was already "active" never silently drops out of the catalogue.
  if (existing.catalogStatus === "active" && enriched.catalogStatus !== "active") enriched.catalogStatus = existing.catalogStatus;
  return { merged: enriched, changed, corroborated };
}
