import { validateBarcode } from "./barcode";
import { detectProfile } from "./scoring-config";
import { parseIngredientText } from "./ingredients";
import { cleanNutrition, saltGramsToSodiumMg } from "./nutrition";
import type { NutritionMeta, Product, Nutrition } from "./types";
import { enrichProduct } from "./catalogue";
import { parsePack } from "./identity";
import { NUTRIENT_KEYS } from "./types";

/** Subset of the Open Food Facts product document that we read. */
export interface OffProduct {
  code?: string; product_name?: string; product_name_en?: string; generic_name?: string; brands?: string;
  categories?: string; categories_tags?: string[]; quantity?: string; product_quantity?: number | string;
  ingredients_text?: string; ingredients_text_en?: string; allergens_tags?: string[]; traces_tags?: string[];
  nutriments?: Record<string, number | string | undefined>; image_front_url?: string; image_ingredients_url?: string;
  image_nutrition_url?: string; nova_group?: number | string; url?: string;
  serving_size?: string; serving_quantity?: number | string; labels_tags?: string[]; ingredients_analysis_tags?: string[];
  countries_tags?: string[]; image_front_small_url?: string;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

export function parseQuantity(q?: string, pq?: number | string): { value: number; unit: string } | undefined {
  if (q) {
    const m = q.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)\b/);
    if (m) {
      let value = parseFloat(m[1]); let unit = m[2];
      if (unit === "kg") { value *= 1000; unit = "g"; } else if (unit === "l") { value *= 1000; unit = "ml"; } else if (unit === "cl") { value *= 10; unit = "ml"; }
      return { value, unit };
    }
  }
  const v = num(pq);
  return v && v > 0 ? { value: v, unit: "g" } : undefined;
}

export interface NormalizeResult { product: Product | null; issues: string[]; isIndian?: boolean }

/**
 * Open Food Facts -> Grocerly schema. This is the ONLY place that knows the external field names,
 * so the rest of the app is insulated from API changes.
 */
export function normalizeOffProduct(off: OffProduct, now = new Date()): NormalizeResult {
  const issues: string[] = [];
  const bc = validateBarcode(off.code ?? "");
  const name = (off.product_name_en || off.product_name || off.generic_name || "").trim();
  if (!name) issues.push("Product has no name.");
  if (!bc.valid) issues.push(`Invalid barcode: ${bc.reason}`);
  if (issues.length) return { product: null, issues };

  const nm = off.nutriments ?? {};
  const raw: Record<string, unknown> = {};
  const kcal = num(nm["energy-kcal_100g"]);
  const kj = num(nm["energy_100g"]);
  raw.calories = kcal ?? (kj != null ? Math.round(kj / 4.184) : undefined);
  raw.protein = num(nm["proteins_100g"]);
  raw.carbohydrates = num(nm["carbohydrates_100g"]);
  raw.sugars = num(nm["sugars_100g"]);
  raw.addedSugars = num(nm["added-sugars_100g"]);
  raw.fat = num(nm["fat_100g"]);
  raw.saturatedFat = num(nm["saturated-fat_100g"]);
  raw.transFat = num(nm["trans-fat_100g"]);
  raw.fiber = num(nm["fiber_100g"]);
  const sodiumG = num(nm["sodium_100g"]); const saltG = num(nm["salt_100g"]);
  raw.sodium = sodiumG != null ? sodiumG * 1000 : saltG != null ? saltGramsToSodiumMg(saltG) : undefined;
  const chol = num(nm["cholesterol_100g"]); raw.cholesterol = chol != null ? chol * 1000 : undefined;
  const nutrition: Nutrition = cleanNutrition(raw);

  const nutritionMeta: NutritionMeta = {};
  for (const k of NUTRIENT_KEYS) if (nutrition[k] != null) nutritionMeta[k] = { confidence: 0.7, source: "openfoodfacts" };
  if (!Object.keys(nutrition).length) issues.push("No nutrition values available from Open Food Facts.");

  const ingredientsText = (off.ingredients_text_en || off.ingredients_text || "").trim();
  const ingredients = [...new Set(parseIngredientText(ingredientsText).map((p) => p.name))];
  const tags = off.categories_tags ?? [];
  const category = tags.length ? prettyTag(tags[tags.length - 1]) : (off.categories?.split(",").pop()?.trim() || "Uncategorised");
  const profile = detectProfile(tags, name);
  const brand = off.brands?.split(",")[0]?.trim() || undefined;
  const nova = num(off.nova_group);

  // ---- serving size + per-serving values (kept separate, never mixed with per-100 g) ----
  const servPack = parsePack(off.serving_size) ;
  const servQty = num(off.serving_quantity);
  const servingSize = servPack ? { value: servPack.value, unit: servPack.unit, text: off.serving_size } : servQty && servQty > 0 ? { value: servQty, unit: "g" as const, text: off.serving_size } : undefined;
  const perServingRaw: Record<string, unknown> = {
    calories: num(nm["energy-kcal_serving"]), protein: num(nm["proteins_serving"]), carbohydrates: num(nm["carbohydrates_serving"]), sugars: num(nm["sugars_serving"]),
    fat: num(nm["fat_serving"]), saturatedFat: num(nm["saturated-fat_serving"]), transFat: num(nm["trans-fat_serving"]), fiber: num(nm["fiber_serving"]),
    sodium: num(nm["sodium_serving"]) != null ? (num(nm["sodium_serving"]) as number) * 1000 : undefined,
  };
  const nutritionPerServing = cleanNutrition(perServingRaw);

  // ---- vegetarian indicator: only when Open Food Facts' own analysis says so ----
  const ia = off.ingredients_analysis_tags ?? []; const labels = off.labels_tags ?? [];
  let vegetarian: boolean | null = null;
  if (ia.includes("en:non-vegetarian")) vegetarian = false;
  else if (ia.includes("en:vegetarian") || ia.includes("en:vegan") || labels.includes("en:green-dot-india")) vegetarian = true;
  const dietary = { vegetarian, vegan: ia.includes("en:vegan") ? true : ia.includes("en:non-vegan") ? false : null };

  const countries = off.countries_tags ?? [];
  const isIndian = countries.includes("en:india") || bc.normalized.startsWith("890"); // 890 = GS1 India prefix

  const base: Product = {
    barcode: bc.normalized, name, brand, category, categoryTags: tags.slice(-6), profile,
    quantity: parseQuantity(off.quantity, off.product_quantity),
    nutritionBasis: { amount: 100, unit: profile === "beverage" ? "ml" : "g" },
    nutrition, nutritionMeta, ingredients, ingredientsText: ingredientsText || undefined,
    allergens: { declared: off.allergens_tags ?? [], traces: off.traces_tags ?? [] },
    // Canonical image = the FRONT-of-pack photo only (never the ingredients/nutrition close-ups).
    images: { front: off.image_front_url, ingredients: off.image_ingredients_url, nutrition: off.image_nutrition_url },
    image: off.image_front_url, imageSmall: off.image_front_small_url ?? off.image_front_url,
    servingSize, nutritionPerServing: Object.keys(nutritionPerServing).length ? nutritionPerServing : undefined, dietary,
    claims: labels.filter((l) => /en:(no-|gluten|organic|high-protein|low-)/.test(l)).slice(0, 5).map((l) => l.replace("en:", "").replace(/-/g, " ")),
    nova: nova && nova >= 1 && nova <= 4 ? nova : undefined,
    source: { type: "openfoodfacts", confidence: completenessConfidence(nutrition, ingredients.length), ref: bc.normalized, url: off.url ?? `https://world.openfoodfacts.org/product/${bc.normalized}`, fetchedAt: now },
    sources: [{ source: "openfoodfacts", name: "Open Food Facts", confidence: 0.7, ref: bc.normalized, url: off.url ?? `https://world.openfoodfacts.org/product/${bc.normalized}`, license: "ODbL / CC BY-SA (images)", fetchedAt: now }],
    createdAt: now, updatedAt: now,
  };
  const product = enrichProduct(base, { isIndian, forceStatus: true });
  return { product, issues, isIndian };
}

const prettyTag = (t: string) => t.replace(/^[a-z]{2}:/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Rough 0..1 trust in a record based on how complete it is. */
function completenessConfidence(n: Nutrition, ingredientCount: number): number {
  const nut = Object.keys(n).length / 8;
  return Math.round(Math.min(1, 0.4 + Math.min(nut, 1) * 0.4 + (ingredientCount > 0 ? 0.2 : 0)) * 100) / 100;
}
