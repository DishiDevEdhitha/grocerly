import type { NutrientKey, Nutrition } from "./types";

/**
 * LOW / MODERATE / HIGH classification of each nutrient, with the reference that was used.
 * These are "Grocerly reference thresholds". Each rule says where its numbers come from.
 * They are NOT medical advice and NOT (yet) Indian law.
 * Classification is ONLY done on a per-100 g (or per-100 ml) basis, so products stay comparable.
 */
export type Level = "low" | "moderate" | "high" | "good";
export type Tone = "good" | "caution" | "bad" | "neutral";
export interface Range { low: number; high: number; source: string }
interface Rule { key: NutrientKey; kind: "limit" | "benefit"; solid: Range; liquid: Range }

const FSA = "UK FSA front-of-pack criteria";
const FSSAI = "FSSAI 2026 front-of-pack proposal (ICMR-NIN)";
const EU_FIBRE = "EU claim 'source of fibre' (3 g/100 g)";
const HEUR = "Grocerly heuristic";

export const RULES: Rule[] = [
  { key: "calories", kind: "limit", solid: { low: 150, high: 400, source: HEUR }, liquid: { low: 20, high: 60, source: HEUR } },
  // 0.3 g salt = 120 mg sodium (FSA low). FSSAI proposes "high salt" above 0.625 g/100 g = 250 mg sodium, and 0.175 g/100 ml = 70 mg.
  { key: "sodium", kind: "limit", solid: { low: 120, high: 250, source: `low: ${FSA}; high: ${FSSAI}` }, liquid: { low: 30, high: 70, source: `low: ${HEUR}; high: ${FSSAI}` } },
  { key: "sugars", kind: "limit", solid: { low: 5, high: 22.5, source: FSA }, liquid: { low: 2.5, high: 11.25, source: `${FSA} (drinks)` } },
  // FSSAI's proposal is about ADDED sugar: high above 3 g/100 g (solids) or 2 g/100 ml (liquids).
  { key: "addedSugars", kind: "limit", solid: { low: 1.5, high: 3, source: `low: ${HEUR}; high: ${FSSAI}` }, liquid: { low: 1, high: 2, source: `low: ${HEUR}; high: ${FSSAI}` } },
  { key: "fat", kind: "limit", solid: { low: 3, high: 17.5, source: FSA }, liquid: { low: 1.5, high: 8.75, source: `${FSA} (drinks)` } },
  { key: "saturatedFat", kind: "limit", solid: { low: 1.5, high: 5, source: FSA }, liquid: { low: 0.75, high: 2.5, source: `${FSA} (drinks)` } },
  { key: "transFat", kind: "limit", solid: { low: 0.1, high: 0.5, source: HEUR }, liquid: { low: 0.1, high: 0.5, source: HEUR } },
  { key: "protein", kind: "benefit", solid: { low: 5, high: 12, source: HEUR }, liquid: { low: 1.5, high: 3.5, source: HEUR } },
  { key: "fiber", kind: "benefit", solid: { low: 1.5, high: 3, source: EU_FIBRE }, liquid: { low: 0.75, high: 1.5, source: HEUR } },
];
const RULE_BY_KEY = Object.fromEntries(RULES.map((r) => [r.key, r])) as Partial<Record<NutrientKey, Rule>>;

export interface NutrientLevel {
  key: NutrientKey; value: number; level: Level; label: "LOW" | "MODERATE" | "HIGH" | "GOOD"; tone: Tone;
  kind: "limit" | "benefit"; range: Range; unitBasis: "g" | "ml";
  /** Human-readable reference line shown under the nutrient. */
  referenceText: string;
}

const fmt = (n: number) => (n % 1 === 0 ? String(n) : String(Math.round(n * 100) / 100));
const UNIT: Partial<Record<NutrientKey, string>> = { calories: "kcal", sodium: "mg", cholesterol: "mg" };
const unitOf = (k: NutrientKey) => UNIT[k] ?? "g";

export function classifyNutrient(key: NutrientKey, value: number | undefined, basisUnit: "g" | "ml" = "g"): NutrientLevel | null {
  const rule = RULE_BY_KEY[key];
  if (!rule || value == null || !Number.isFinite(value)) return null;
  const range = basisUnit === "ml" ? rule.liquid : rule.solid;
  const u = unitOf(key);
  let level: Level, tone: Tone, label: NutrientLevel["label"], referenceText: string;
  if (rule.kind === "limit") {
    level = value <= range.low ? "low" : value > range.high ? "high" : "moderate";
    tone = level === "low" ? "good" : level === "moderate" ? "caution" : "bad";
    label = level === "low" ? "LOW" : level === "moderate" ? "MODERATE" : "HIGH";
    referenceText = `≤ ${fmt(range.low)} ${u} = Low · ${fmt(range.low)}–${fmt(range.high)} ${u} = Moderate · > ${fmt(range.high)} ${u} = High`;
  } else {
    level = value >= range.high ? "good" : value < range.low ? "low" : "moderate";
    tone = level === "good" ? "good" : level === "low" ? "neutral" : "caution";
    label = level === "good" ? "GOOD" : level === "low" ? "LOW" : "MODERATE";
    referenceText = `< ${fmt(range.low)} ${u} = Low · ${fmt(range.low)}–${fmt(range.high)} ${u} = Moderate · ≥ ${fmt(range.high)} ${u} = Good`;
  }
  return { key, value, level, label, tone, kind: rule.kind, range, unitBasis: basisUnit, referenceText: `${referenceText} per 100 ${basisUnit}` };
}

export function classifyAll(n: Nutrition, basisUnit: "g" | "ml" = "g"): Partial<Record<NutrientKey, NutrientLevel>> {
  const out: Partial<Record<NutrientKey, NutrientLevel>> = {};
  for (const r of RULES) { const l = classifyNutrient(r.key, n[r.key], basisUnit); if (l) out[r.key] = l; }
  return out;
}

/** The 3 indicators shown on a product card. */
export function keyIndicators(n: Nutrition, basisUnit: "g" | "ml" = "g"): NutrientLevel[] {
  const all = classifyAll(n, basisUnit);
  const fatKey: NutrientKey = n.saturatedFat != null ? "saturatedFat" : "fat";
  return (["sodium", "sugars", fatKey, "protein"] as NutrientKey[]).map((k) => all[k]).filter((x): x is NutrientLevel => Boolean(x)).slice(0, 3);
}

export const REFERENCE_SOURCES = [
  { name: FSA, note: "Per 100 g traffic-light boundaries for fat, saturated fat, sugars and (low) salt. A UK voluntary scheme used as an internationally known yardstick." },
  { name: FSSAI, note: "Proposed (not final) Indian rules: high added sugar > 3 g/100 g or 2 g/100 ml, high salt > 0.625 g/100 g or 0.175 g/100 ml. Under review by the Supreme Court as of late 2026." },
  { name: EU_FIBRE, note: "EU Regulation 1924/2006 nutrition claim." },
  { name: HEUR, note: "Our own cut-offs where no suitable public standard exists (energy, trans fat, protein, liquid fibre)." },
];
