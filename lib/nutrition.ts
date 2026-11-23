import { NUTRIENT_KEYS, type NutrientKey, type Nutrition } from "./types";

/** Canonical unit stored for each nutrient. */
export const NUTRIENT_META: Record<NutrientKey, { label: string; unit: "kcal" | "g" | "mg" }> = {
  calories: { label: "Energy", unit: "kcal" },
  protein: { label: "Protein", unit: "g" },
  carbohydrates: { label: "Carbohydrates", unit: "g" },
  sugars: { label: "Sugars", unit: "g" },
  addedSugars: { label: "Added sugars", unit: "g" },
  fat: { label: "Fat", unit: "g" },
  saturatedFat: { label: "Saturated fat", unit: "g" },
  transFat: { label: "Trans fat", unit: "g" },
  fiber: { label: "Fibre", unit: "g" },
  sodium: { label: "Sodium", unit: "mg" },
  cholesterol: { label: "Cholesterol", unit: "mg" },
};

export const LOW_CONFIDENCE = 0.6;

/** Convert a value+unit to the canonical unit of a nutrient. Returns null if units are incompatible. */
export function convertUnit(value: number, unit: string | undefined, key: NutrientKey): number | null {
  const target = NUTRIENT_META[key].unit;
  const u = (unit ?? target).toLowerCase().replace("µ", "u").replace("μ", "u");
  if (target === "kcal") {
    if (u === "kcal" || u === "cal") return value;
    if (u === "kj") return value / 4.184;
    return null;
  }
  const toGrams: Record<string, number> = { g: 1, mg: 0.001, mcg: 0.000001, ug: 0.000001, kg: 1000 };
  if (!(u in toGrams)) return null;
  const grams = value * toGrams[u];
  return target === "g" ? grams : grams * 1000; // g -> mg
}

/** Salt (g) -> sodium (mg). Sodium = salt / 2.5. */
export const saltGramsToSodiumMg = (saltG: number) => (saltG / 2.5) * 1000;

export interface OcrLine { text: string; confidence: number } // confidence 0..1
export interface ExtractedField {
  value: number;
  unit: string;
  confidence: number;
  source: "ocr";
  raw: string;
  needsVerification: boolean;
  note?: string;
}
export interface NutritionExtraction {
  fields: Partial<Record<NutrientKey, ExtractedField>>;
  basis: { kind: "per100" | "perServing" | "unknown"; servingSize?: number; unit: "g" | "ml" };
  warnings: string[];
  lowConfidence: NutrientKey[];
}

// Order matters: more specific labels first so "saturated fat" is not read as "fat".
const LABELS: { key: NutrientKey | "salt"; re: RegExp; defaultUnit: string }[] = [
  { key: "saturatedFat", re: /(saturated\s*fat|saturates|of which saturat\w*|sat\.?\s*fat)/i, defaultUnit: "g" },
  { key: "transFat", re: /(trans\s*fat|trans\s*fatty)/i, defaultUnit: "g" },
  { key: "addedSugars", re: /(added\s*sugars?|incl\.?\s*added)/i, defaultUnit: "g" },
  { key: "sugars", re: /(total\s*sugars?|of which sugars?|sugars?)/i, defaultUnit: "g" },
  { key: "fiber", re: /(dietary\s*fib(?:er|re)|fib(?:er|re)|roughage)/i, defaultUnit: "g" },
  { key: "carbohydrates", re: /(total\s*carbohydrates?|carbohydrates?|carbs?)/i, defaultUnit: "g" },
  { key: "fat", re: /(total\s*fat|fat)/i, defaultUnit: "g" },
  { key: "protein", re: /(protein)/i, defaultUnit: "g" },
  { key: "cholesterol", re: /(cholesterol)/i, defaultUnit: "mg" },
  { key: "sodium", re: /(sodium)/i, defaultUnit: "mg" },
  { key: "salt", re: /(\bsalt\b)/i, defaultUnit: "g" },
  { key: "calories", re: /(energy|calories|kcal)/i, defaultUnit: "kcal" },
];

/** Fix the commonest OCR digit confusions inside numbers (O->0, l/I->1 next to digits). */
export function fixDigits(s: string): string {
  return s
    .replace(/(?<=\d)[oO](?=[\d.,\s]|$)/g, "0")
    .replace(/(?<=[\s:])[oO](?=\d)/g, "0")
    .replace(/(?<=\d)[lI](?=\d)/g, "1")
    .replace(/(\d),(\d)/g, "$1.$2");
}

const NUM_UNIT = /(\d+(?:\.\d+)?)\s*(kcal|kj|cal|mcg|µg|μg|ug|mg|kg|g)?\b/gi;

function plausible(key: NutrientKey, v: number): boolean {
  const max: Record<NutrientKey, number> = {
    calories: 900, protein: 100, carbohydrates: 100, sugars: 100, addedSugars: 100,
    fat: 100, saturatedFat: 100, transFat: 100, fiber: 100, sodium: 40000, cholesterol: 5000,
  };
  return v >= 0 && v <= max[key];
}

/**
 * Deterministic nutrition-label parser. Input: OCR lines with per-line confidence.
 * Output: canonical values per 100 g/ml when the basis can be determined.
 */
export function parseNutritionLines(lines: OcrLine[]): NutritionExtraction {
  const warnings: string[] = [];
  const fields: NutritionExtraction["fields"] = {};
  const fullText = lines.map((l) => l.text).join("\n");

  // ---- Basis detection ----
  let basis: NutritionExtraction["basis"] = { kind: "unknown", unit: /\bml\b/i.test(fullText) ? "ml" : "g" };
  if (/per\s*100\s*(g|ml)/i.test(fullText)) basis = { kind: "per100", unit: /per\s*100\s*ml/i.test(fullText) ? "ml" : "g" };
  const serv = fullText.match(/serv(?:ing|e)?\s*size[^0-9\n]{0,15}(\d+(?:[.,]\d+)?)\s*(g|ml)/i) || fullText.match(/per\s*serv(?:ing|e)?\s*\(?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)/i);
  if (basis.kind !== "per100" && serv) {
    basis = { kind: "perServing", servingSize: parseFloat(serv[1].replace(",", ".")), unit: serv[2].toLowerCase() as "g" | "ml" };
  }

  // ---- Field extraction ----
  for (const line of lines) {
    const text = fixDigits(line.text);
    for (const { key, re, defaultUnit } of LABELS) {
      const m = re.exec(text);
      if (!m) continue;
      const after = text.slice(m.index + m[0].length);
      // Energy lines often hold "520 kcal / 2174 kJ": prefer kcal.
      const nums = [...after.matchAll(NUM_UNIT)].filter((n) => !/^\s*%/.test(after.slice((n.index ?? 0) + n[0].length)));
      if (!nums.length) break; // label matched but no number: stop checking lower-priority labels
      let pick = nums[0];
      if (key === "calories") pick = nums.find((n) => /kcal|cal/i.test(n[2] ?? "")) ?? nums[0];
      const rawVal = parseFloat(pick[1]);
      const hasUnit = Boolean(pick[2]);
      const unit = pick[2] ?? defaultUnit;
      const target: NutrientKey = key === "salt" ? "sodium" : key;
      let value: number | null;
      if (key === "salt") {
        const g = convertUnit(rawVal, unit, "protein"); // grams
        value = g == null ? null : saltGramsToSodiumMg(g);
      } else value = convertUnit(rawVal, unit, target);
      if (value == null) break;
      let confidence = line.confidence;
      let note: string | undefined;
      if (!hasUnit) { confidence = Math.max(0, confidence - 0.15); note = `No unit read; assumed ${defaultUnit}.`; }
      if (key === "salt") note = "Converted from salt (sodium = salt ÷ 2.5).";
      value = Math.round(value * 100) / 100;
      if (!plausible(target, value)) { confidence = Math.min(confidence, 0.3); note = "Value looks implausible."; warnings.push(`${NUTRIENT_META[target].label} value ${value} looks implausible. Please verify.`); }
      // Explicit sodium beats derived salt.
      if (key === "salt" && fields.sodium && !fields.sodium.note?.startsWith("Converted")) break;
      const prev = fields[target];
      if (!prev || confidence > prev.confidence || key !== "salt") {
        fields[target] = { value, unit: NUTRIENT_META[target].unit, confidence: round2(confidence), source: "ocr", raw: line.text.trim(), needsVerification: false, note };
      }
      break;
    }
  }

  // ---- Convert serving -> per 100 ----
  if (basis.kind === "perServing" && basis.servingSize && basis.servingSize > 0) {
    const f = 100 / basis.servingSize;
    for (const k of Object.keys(fields) as NutrientKey[]) {
      const fld = fields[k]!;
      fld.value = Math.round(fld.value * f * 100) / 100;
      fld.note = `${fld.note ? fld.note + " " : ""}Converted from per ${basis.servingSize}${basis.unit} serving to per 100${basis.unit}.`;
    }
  } else if (basis.kind === "perServing") {
    warnings.push("Values are per serving but the serving size could not be read. Enter it so values can be converted to per 100 g.");
  } else if (basis.kind === "unknown" && Object.keys(fields).length) {
    warnings.push("Could not tell whether values are per 100 g or per serving. Please confirm.");
  }

  // ---- Cross-field validation ----
  const v = (k: NutrientKey) => fields[k]?.value;
  const flag = (k: NutrientKey, msg: string) => { if (fields[k]) { fields[k]!.confidence = Math.min(fields[k]!.confidence, 0.4); fields[k]!.note = msg; } warnings.push(msg); };
  if (v("saturatedFat") != null && v("fat") != null && v("saturatedFat")! > v("fat")! + 0.5) flag("saturatedFat", "Saturated fat is higher than total fat. Please verify both.");
  if (v("sugars") != null && v("carbohydrates") != null && v("sugars")! > v("carbohydrates")! + 0.5) flag("sugars", "Sugars are higher than total carbohydrates. Please verify both.");
  if (v("protein") != null && v("fat") != null && v("carbohydrates") != null && v("protein")! + v("fat")! + v("carbohydrates")! > 105) warnings.push("Protein + fat + carbohydrates exceed 100 g per 100 g. At least one value is probably wrong.");

  const lowConfidence: NutrientKey[] = [];
  for (const k of NUTRIENT_KEYS) {
    const f = fields[k];
    if (!f) continue;
    f.needsVerification = f.confidence < LOW_CONFIDENCE;
    if (f.needsVerification) {
      lowConfidence.push(k);
      warnings.push(`Unable to confidently read ${NUTRIENT_META[k].label.toLowerCase()}. Please verify the value.`);
    }
  }
  if (!Object.keys(fields).length) warnings.push("No nutrition values could be read. Try a sharper, well-lit photo of the nutrition table.");
  return { fields, basis, warnings: [...new Set(warnings)], lowConfidence };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Strip non-finite / non-numeric values so a Nutrition object never holds NaN. */
export function cleanNutrition(input: Record<string, unknown>): Nutrition {
  const out: Nutrition = {};
  for (const k of NUTRIENT_KEYS) {
    const raw = input[k];
    const n = typeof raw === "string" ? parseFloat(raw) : (raw as number);
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[k] = Math.round(n * 100) / 100;
  }
  return out;
}

export function formatNutrient(key: NutrientKey, value: number | undefined): string {
  if (value == null) return "Not available";
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${NUTRIENT_META[key].unit}`;
}
