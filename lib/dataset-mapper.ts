import { validateBarcode } from "./barcode";
import { classify } from "./taxonomy";
import { enrichProduct } from "./catalogue";
import { parsePack } from "./identity";
import { cleanNutrition, convertUnit } from "./nutrition";
import { NUTRIENT_KEYS, type NutrientKey, type Nutrition, type Product } from "./types";
import { parseIngredientText } from "./ingredients";

/**
 * Maps the columns of a CSV dataset (e.g. the Mendeley "Indian Packaged Foods" dataset) to Grocerly fields.
 * Because column names differ between datasets, detection is done by name patterns and REPORTED
 * (use `--dry-run`) so a human can confirm before anything is written.
 */
export type Basis = "per100" | "perServing" | "unspecified";
export interface NutrientColumn { header: string; key: NutrientKey; basis: Basis; unit?: string }
export interface ColumnMap {
  name?: string; brand?: string; category?: string; subcategory?: string; barcode?: string; ingredients?: string; pack?: string; serving?: string; price?: string; vegetarian?: string; allergens?: string;
  nutrients: NutrientColumn[]; unmapped: string[];
}

const flat = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, "");
const ALIASES: Record<string, string[]> = {
  name: ["productname", "product", "name", "itemname", "productdescription", "title", "foodname"],
  brand: ["brand", "brandname", "manufacturer", "company", "marketedby"],
  category: ["category", "foodcategory", "maincategory", "productcategory", "department", "foodgroup"],
  subcategory: ["subcategory", "subcat", "producttype", "type", "subtype", "subcategory1"],
  barcode: ["barcode", "ean", "gtin", "upc", "eancode", "barcodenumber", "code"],
  ingredients: ["ingredients", "ingredientlist", "ingredientslist", "listofingredients"],
  pack: ["packsize", "netquantity", "netweight", "quantity", "packweight", "weight", "size", "netcontent", "packsizeg"],
  serving: ["servingsize", "serving", "servingsizeg", "servingweight", "portion", "servingsizegml"],
  price: ["price", "mrp", "pricerupees", "priceinr", "mrpinr", "pricers"],
  vegetarian: ["vegnonveg", "vegetarian", "veg", "diettype", "dietarytype"],
  allergens: ["allergens", "allergeninformation", "allergen", "containsallergens"],
};

function nutrientOf(h: string): NutrientKey | null {
  const t = h.toLowerCase();
  if (/kj/.test(t) && !/kcal/.test(t)) return null;
  if (/(saturated|sfa)/.test(t)) return "saturatedFat";
  if (/trans/.test(t)) return "transFat";
  if (/added.?sugar/.test(t)) return "addedSugars";
  if (/sugar/.test(t)) return "sugars";
  if (/(dietary.?fib|fibre|fiber)/.test(t)) return "fiber";
  if (/(carbohydrate|carbs?)\b/.test(t)) return "carbohydrates";
  if (/cholesterol/.test(t)) return "cholesterol";
  if (/protein/.test(t)) return "protein";
  if (/sodium/.test(t)) return "sodium";
  if (/\bfat\b|total.?fat|fat.?g/.test(t)) return "fat";
  if (/(energy|calorie|kcal)/.test(t)) return "calories";
  return null;
}
function basisOf(h: string): Basis {
  const t = h.toLowerCase();
  if (/per\s*serv|\/\s*serv|serving|per\s*portion/.test(t)) return "perServing";
  if (/100\s*(g|gm|ml)|per\s*100/.test(t)) return "per100";
  return "unspecified";
}

export function mapHeaders(headers: string[]): ColumnMap {
  const map: ColumnMap = { nutrients: [], unmapped: [] };
  const taken = new Set<string>();
  for (const h of headers) {
    const f = flat(h); let hit = false;
    const nk = nutrientOf(h);
    if (nk && !/(serving.?size|pack|weight)/i.test(h)) { map.nutrients.push({ header: h, key: nk, basis: basisOf(h), unit: h.match(/\(([^)]*)\)/)?.[1]?.trim().toLowerCase() }); continue; }
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(f) && !(map as never as Record<string, unknown>)[field] && !taken.has(h)) { (map as never as Record<string, string>)[field] = h; taken.add(h); hit = true; break; }
    }
    if (!hit) map.unmapped.push(h);
  }
  return map;
}

export function describeMap(m: ColumnMap): string {
  const lines = ["name", "brand", "category", "subcategory", "barcode", "ingredients", "pack", "serving", "price", "vegetarian", "allergens"].map((f) => `  ${f.padEnd(12)} <- ${(m as never as Record<string, string>)[f] ?? "(not found)"}`);
  const nut = m.nutrients.map((n) => `  ${n.key.padEnd(14)} <- "${n.header}"  basis=${n.basis}${n.unit ? ` unit=${n.unit}` : ""}`);
  return `Detected columns:\n${lines.join("\n")}\nNutrient columns:\n${nut.join("\n") || "  (none)"}\nUnmapped columns: ${m.unmapped.join(", ") || "(none)"}`;
}

export interface RowResult { product: Product | null; reasons: string[] }
const num = (v: string | undefined): number | undefined => { if (v == null) return undefined; const n = parseFloat(v.replace(/[^\d.\-]/g, "")); return Number.isFinite(n) && /\d/.test(v) ? n : undefined; };

export function rowToProduct(row: Record<string, string>, map: ColumnMap, opts: { basis: "per100" | "perServing" | "auto"; sourceRef: string; sourceUrl: string; sourceName: string; license: string; now?: Date }): RowResult {
  const reasons: string[] = [];
  const name = (map.name ? row[map.name] : "")?.trim();
  if (!name || name.length < 3) return { product: null, reasons: ["no_name"] };
  const brand = map.brand ? row[map.brand]?.trim() || undefined : undefined;
  let barcode: string | null = null;
  if (map.barcode && row[map.barcode]) { const v = validateBarcode(row[map.barcode]); if (v.valid) barcode = v.normalized; else reasons.push("invalid_barcode_ignored"); }
  const catText = [map.category && row[map.category], map.subcategory && row[map.subcategory]].filter(Boolean) as string[];
  const packParsed = map.pack ? parsePack(row[map.pack]) : undefined;
  const quantity = packParsed ? { value: packParsed.value, unit: packParsed.unit } : undefined;
  let servingSize: Product["servingSize"];
  if (map.serving && row[map.serving]) {
    const sp = parsePack(row[map.serving]) ?? (num(row[map.serving]) ? { value: num(row[map.serving])!, unit: "g" as const } : undefined);
    if (sp && sp.value > 0 && sp.value < 2000) servingSize = { value: sp.value, unit: sp.unit, text: row[map.serving] }; else if (row[map.serving]) reasons.push("serving_invalid");
  }
  // ---- nutrients: keep per-100 and per-serving apart, never mix ----
  const per100: Record<string, unknown> = {}, perServing: Record<string, unknown> = {}; let basisUnknown = false;
  for (const col of map.nutrients) {
    const raw = row[col.header]; if (raw == null || raw === "") continue;
    const v = num(raw); if (v == null) { reasons.push(`non_numeric_${col.key}`); continue; }
    if (v < 0) { reasons.push(`negative_${col.key}`); continue; }
    const conv = convertUnit(v, col.unit && /^(g|mg|mcg|µg|ug|kcal|kj|cal)$/.test(col.unit) ? col.unit : undefined, col.key);
    if (conv == null) { reasons.push(`bad_unit_${col.key}`); continue; }
    let basis = col.basis; if (basis === "unspecified" && opts.basis !== "auto") basis = opts.basis;
    if (basis === "per100") per100[col.key] = conv; else if (basis === "perServing") perServing[col.key] = conv; else basisUnknown = true;
  }
  let nutrition: Nutrition = cleanNutrition(per100); let nutritionPerServing: Nutrition | undefined = Object.keys(perServing).length ? cleanNutrition(perServing) : undefined;
  if (!Object.keys(nutrition).length && nutritionPerServing && servingSize) { // derive per-100 from per-serving ONLY when the serving size is known
    const f = 100 / servingSize.value; const d: Record<string, number> = {};
    for (const k of NUTRIENT_KEYS) if (nutritionPerServing[k] != null) d[k] = nutritionPerServing[k]! * f;
    nutrition = cleanNutrition(d); reasons.push("per100_derived_from_serving");
  }
  if (basisUnknown && !Object.keys(nutrition).length) reasons.push("nutrition_basis_unknown");
  const ingredientsText = map.ingredients ? row[map.ingredients]?.trim() : undefined;
  const ingredients = ingredientsText ? [...new Set(parseIngredientText(ingredientsText).map((p) => p.name))] : [];
  const priceN = map.price ? num(row[map.price]) : undefined;
  const veg = map.vegetarian ? row[map.vegetarian]?.toLowerCase() : "";
  const vegetarian = !veg ? null : /^(non|nv|non-veg|non veg|red)/.test(veg) ? false : /(veg|green)/.test(veg) ? true : null;
  const now = opts.now ?? new Date();
  const c = classify({ name, brand, tags: catText });
  const base: Product = {
    barcode, name, brand, category: c.productType, categoryTags: catText.map((x) => x.toLowerCase().replace(/\s+/g, "-")), profile: c.profile ?? "default",
    quantity, nutritionBasis: { amount: 100, unit: c.profile === "beverage" ? "ml" : "g" }, nutrition,
    nutritionMeta: Object.fromEntries(Object.keys(nutrition).map((k) => [k, { confidence: 0.9, source: "dataset" as const }])),
    ingredients, ingredientsText: ingredientsText || undefined, allergens: { declared: [], traces: [] }, images: {},
    servingSize, nutritionPerServing: nutritionPerServing && Object.keys(nutritionPerServing).length ? nutritionPerServing : undefined,
    dietary: { vegetarian }, price: priceN && priceN > 0 ? { value: priceN, currency: "INR" } : undefined,
    source: { type: "dataset", confidence: 0.9, ref: opts.sourceRef, url: opts.sourceUrl, fetchedAt: now },
    sources: [{ source: "dataset", name: opts.sourceName, confidence: 0.9, ref: opts.sourceRef, url: opts.sourceUrl, license: opts.license, fetchedAt: now }],
    createdAt: now, updatedAt: now,
  };
  return { product: enrichProduct(base, { isIndian: true, forceStatus: true }), reasons };
}
