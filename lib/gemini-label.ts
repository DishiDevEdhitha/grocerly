import { convertUnit, crossCheck, NUTRIENT_META, saltGramsToSodiumMg } from "./nutrition";
import { parsePack } from "./identity";
import { parseIngredientText } from "./ingredients";
import { NUTRIENT_KEYS, type NutrientKey, type Nutrition } from "./types";

/**
 * Gemini = READER, not judge.
 * It looks at label photos and returns structured JSON. Everything it says is then:
 *   1. checked against the text it claims to have read (anti-hallucination),
 *   2. unit-converted and sanity-checked by our own code,
 *   3. shown to the user for confirmation before anything is saved.
 * It never produces a health score; the deterministic engine does that.
 */
export type GeminiCode = "not_configured" | "quota" | "auth" | "bad_request" | "blocked" | "unavailable" | "timeout" | "bad_output";
export class GeminiError extends Error { constructor(message: string, public code: GeminiCode, public status?: number) { super(message); this.name = "GeminiError"; } }
export interface ImageInput { mime: string; data: string; role?: string }

const NUTRIENT_ENUM = [...NUTRIENT_KEYS, "salt"];
const LABEL_SCHEMA = {
  type: "OBJECT",
  properties: {
    productName: { type: "STRING", nullable: true }, brand: { type: "STRING", nullable: true }, category: { type: "STRING", nullable: true },
    quantityText: { type: "STRING", nullable: true }, servingSizeText: { type: "STRING", nullable: true },
    ingredientsText: { type: "STRING", nullable: true },
    allergensDeclared: { type: "ARRAY", items: { type: "STRING" } },
    vegetarianMark: { type: "STRING", enum: ["veg", "non_veg", "none"] },
    nutrition: { type: "ARRAY", items: { type: "OBJECT", properties: {
      nutrient: { type: "STRING", enum: NUTRIENT_ENUM }, value: { type: "NUMBER", nullable: true }, unit: { type: "STRING", nullable: true },
      basis: { type: "STRING", enum: ["per_100", "per_serving", "unknown"] }, rawText: { type: "STRING" },
    }, required: ["nutrient", "value", "basis", "rawText"] } },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["nutrition", "allergensDeclared", "vegetarianMark"],
};

const INSTRUCTIONS = `You are reading photos of an Indian packaged-food label. Extract ONLY what is clearly printed. Rules:
- Never guess, estimate, calculate or infer a value. If a value is not clearly visible, use null (or omit the row).
- For every nutrition row copy the exact printed text of that row into "rawText" (for example "Sodium 620 mg").
- "basis" is per_100 if the column says per 100 g / 100 ml, per_serving if it says per serving/portion, otherwise unknown.
- "value" must be the number as printed. "unit" is the printed unit (g, mg, kcal, kJ).
- Copy the ingredient list verbatim in "ingredientsText". Copy the printed 'Contains' allergen statement items in allergensDeclared.
- vegetarianMark is veg for the green-dot symbol, non_veg for the red/brown-dot symbol, none if not visible.
- Do not rate or judge the product. Do not say whether it is healthy.
- If a photo is unreadable, return empty arrays and add a short note in warnings.`;

export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

export async function extractLabelRaw(images: ImageInput[], timeoutMs = 40000): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("AI label reading is not configured on this server.", "not_configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key }, // key travels in a header, never in a URL or log
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: INSTRUCTIONS }, ...images.flatMap((im, i) => [{ text: `Photo ${i + 1}${im.role ? ` (${im.role})` : ""}:` }, { inlineData: { mimeType: im.mime, data: im.data } }])] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: LABEL_SCHEMA },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg: string = body?.error?.message ?? ""; const st: string = body?.error?.status ?? "";
      if (res.status === 429 || st === "RESOURCE_EXHAUSTED") throw new GeminiError("The AI reader is busy or its free quota is used up. Try again later or enter the values by hand.", "quota", 429);
      if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) throw new GeminiError("The AI reader is not set up correctly (API key problem).", "auth", res.status);
      if (res.status === 404) throw new GeminiError("The configured AI model was not found. The site owner must update GEMINI_MODEL.", "bad_request", 404);
      if (res.status >= 500) throw new GeminiError("The AI reader is temporarily unavailable.", "unavailable", res.status);
      throw new GeminiError("The AI reader could not process these photos.", "bad_request", res.status);
    }
    const data = await res.json();
    if (data?.promptFeedback?.blockReason) throw new GeminiError("The AI reader declined to process these photos.", "blocked");
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new GeminiError("The AI reader returned nothing.", "bad_output");
    try { return JSON.parse(text.replace(/^```json|```$/g, "").trim()); } catch { throw new GeminiError("The AI reader returned an unreadable answer.", "bad_output"); }
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if ((e as Error).name === "AbortError") throw new GeminiError("The AI reader took too long.", "timeout");
    throw new GeminiError("Could not reach the AI reader.", "unavailable");
  } finally { clearTimeout(timer); }
}

// ------------------------------------------------------------------------------------------------
// Validation (pure, unit tested)
// ------------------------------------------------------------------------------------------------
export interface ExtractedNutrient { value: number; unit: string; confidence: number; source: "gemini"; raw: string; needsVerification: boolean; note?: string }
export interface LabelExtraction {
  productName?: string; brand?: string; category?: string; quantityText?: string; quantity?: { value: number; unit: "g" | "ml" };
  servingSize?: { value: number; unit: "g" | "ml"; text?: string }; ingredientsText?: string; ingredients: string[]; allergens: string[]; vegetarian: boolean | null;
  basis: "per100" | "perServing" | "unknown"; nutritionPer100: Nutrition; nutritionPerServing?: Nutrition; nutritionUnknownBasis?: Nutrition;
  fields: Partial<Record<NutrientKey, ExtractedNutrient>>; warnings: string[]; dropped: { nutrient: string; reason: string }[];
}

const str = (v: unknown, max = 200): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
export const numbersIn = (t: string): number[] => (t.replace(/(\d),(\d)/g, "$1.$2").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const LABEL_WORDS: Record<string, RegExp> = { calories: /(energy|calor|kcal)/i, protein: /protein/i, carbohydrates: /carb/i, sugars: /sugar/i, addedSugars: /added/i, fat: /fat/i, saturatedFat: /(saturat|sfa)/i, transFat: /trans/i, fiber: /fib/i, sodium: /sodium/i, cholesterol: /cholesterol/i, salt: /salt/i };

export function validateExtraction(raw: unknown): LabelExtraction {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const warnings: string[] = []; const dropped: LabelExtraction["dropped"] = [];
  const out: LabelExtraction = { ingredients: [], allergens: [], vegetarian: null, basis: "unknown", nutritionPer100: {}, fields: {}, warnings, dropped };

  out.productName = str(r.productName, 120); out.brand = str(r.brand, 60); out.category = str(r.category, 60); out.quantityText = str(r.quantityText, 40);
  const q = parsePack(out.quantityText); if (q) out.quantity = { value: q.value, unit: q.unit };
  const servText = str(r.servingSizeText, 40);
  const sp = parsePack(servText) ?? (servText && /^\d+(\.\d+)?$/.test(servText) ? { value: parseFloat(servText), unit: "g" as const } : undefined);
  if (sp && sp.value > 0 && sp.value < 2000) out.servingSize = { value: sp.value, unit: sp.unit, text: servText }; else if (servText) warnings.push("The serving size could not be read reliably.");

  const ing = str(r.ingredientsText, 4000);
  if (ing) { out.ingredientsText = ing; out.ingredients = [...new Set(parseIngredientText(ing).map((p) => p.name))]; if (ing.length < 12) warnings.push("The ingredient list looks very short. Please check it."); }
  if (Array.isArray(r.allergensDeclared)) out.allergens = [...new Set(r.allergensDeclared.map((a) => str(a, 40)?.toLowerCase()).filter((x): x is string => Boolean(x)))].slice(0, 15);
  out.vegetarian = r.vegetarianMark === "veg" ? true : r.vegetarianMark === "non_veg" ? false : null;
  if (Array.isArray(r.warnings)) for (const w of r.warnings.slice(0, 3)) { const s = str(w, 160); if (s) warnings.push(s); }

  const per100: Record<string, number> = {}, perServing: Record<string, number> = {}, unknown: Record<string, number> = {};
  const meta: Record<string, ExtractedNutrient> = {};
  const rows = Array.isArray(r.nutrition) ? r.nutrition.slice(0, 40) : [];
  for (const row of rows as Record<string, unknown>[]) {
    const nutrient = String(row?.nutrient ?? ""); const rawText = str(row?.rawText, 120) ?? "";
    if (!NUTRIENT_ENUM.includes(nutrient)) { dropped.push({ nutrient, reason: "unknown_nutrient" }); continue; }
    const value = typeof row.value === "number" ? row.value : NaN;
    if (!Number.isFinite(value) || value < 0) { dropped.push({ nutrient, reason: "no_valid_value" }); continue; }
    // Anti-hallucination: the number must literally appear in the text the model says it read.
    if (!numbersIn(rawText).some((n) => Math.abs(n - value) < 1e-6 * Math.max(1, value))) { dropped.push({ nutrient, reason: "not_verifiable_against_label_text" }); warnings.push(`Could not verify ${nutrient} against the label text, so it was left blank.`); continue; }
    const key = (nutrient === "salt" ? "sodium" : nutrient) as NutrientKey;
    const unitGiven = str(row.unit, 8)?.toLowerCase();
    let canon: number | null;
    if (nutrient === "salt") { const g = convertUnit(value, unitGiven ?? "g", "protein"); canon = g == null ? null : saltGramsToSodiumMg(g); }
    else canon = convertUnit(value, unitGiven, key);
    if (canon == null) { dropped.push({ nutrient, reason: "bad_unit" }); continue; }
    canon = Math.round(canon * 100) / 100;
    const basis = row.basis === "per_100" ? "per100" : row.basis === "per_serving" ? "perServing" : "unknown";
    let confidence = 0.75 + (LABEL_WORDS[nutrient]?.test(rawText) ? 0.05 : -0.1) + (unitGiven ? 0.05 : -0.1);
    confidence = Math.max(0.2, Math.min(0.85, confidence)); // capped: a person must confirm before it is trusted more
    const note = nutrient === "salt" ? "Converted from salt (sodium = salt ÷ 2.5)." : undefined;
    const target = basis === "per100" ? per100 : basis === "perServing" ? perServing : unknown;
    if (target[key] == null) { target[key] = canon; if (basis !== "perServing") meta[key] = { value: canon, unit: NUTRIENT_META[key].unit, confidence, source: "gemini", raw: rawText, needsVerification: false, note }; else meta[`ps:${key}`] = { value: canon, unit: NUTRIENT_META[key].unit, confidence, source: "gemini", raw: rawText, needsVerification: false, note }; }
  }

  let per100Final: Nutrition = per100 as Nutrition;
  if (Object.keys(per100).length) out.basis = "per100";
  else if (Object.keys(perServing).length && out.servingSize) {
    const f = 100 / out.servingSize.value; const d: Record<string, number> = {};
    for (const [k, v] of Object.entries(perServing)) { d[k] = Math.round(v * f * 100) / 100; const m = meta[`ps:${k}`]; if (m) { meta[k] = { ...m, value: d[k], confidence: Math.max(0.2, m.confidence - 0.1), note: `Converted from per ${out.servingSize.value} ${out.servingSize.unit} serving to per 100 ${out.servingSize.unit}.` }; } }
    per100Final = d as Nutrition; out.basis = "perServing";
  } else if (Object.keys(perServing).length) { out.basis = "perServing"; warnings.push("Values are per serving but the serving size could not be read. Enter it so they can be converted to per 100 g."); }
  if (Object.keys(perServing).length) out.nutritionPerServing = perServing as Nutrition;
  if (Object.keys(unknown).length && !Object.keys(per100Final).length) { out.nutritionUnknownBasis = unknown as Nutrition; warnings.push("The label does not clearly say whether values are per 100 g or per serving. Please confirm."); }
  out.nutritionPer100 = per100Final;

  const cc = crossCheck(per100Final); warnings.push(...cc.warnings);
  for (const k of NUTRIENT_KEYS) {
    const m = meta[k]; if (!m || per100Final[k] == null) continue;
    if (cc.flagged.includes(k)) { m.confidence = Math.min(m.confidence, 0.4); m.needsVerification = true; }
    m.needsVerification = m.needsVerification || m.confidence < 0.6;
    out.fields[k] = m;
  }
  if (!Object.keys(per100Final).length && !out.ingredients.length && !out.nutritionUnknownBasis && !out.nutritionPerServing) warnings.push("The label is difficult to read. Try taking a closer photo in better lighting.");
  out.warnings = [...new Set(warnings)];
  return out;
}
