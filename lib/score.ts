import {
  BASE_SCORE, BONUS_RULES, CORE_FIELDS, INGREDIENT_PENALTY_CAP, INGREDIENT_RISK_POINTS, MIN_CORE_FIELDS,
  NOVA4_PENALTY, PENALTY_RULES, PROFILE_BY_ID, SCORE_VERSION,
} from "./scoring-config";
import type { IngredientInsight, NutrientKey, Nutrition, ScoreProfileId, ScoreReason, ScoreResult } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface ScoreInput {
  nutrition: Nutrition;
  profile: ScoreProfileId;
  ingredientInsights?: IngredientInsight[];
  nova?: number;
  basisUnit?: "g" | "ml";
}

/**
 * Deterministic, explainable score. No AI is involved.
 *   score = 100 - nutrient penalties + nutrient bonuses - ingredient penalties - processing penalty
 * Only nutrients that are present are used. A missing nutrient is neither penalised nor rewarded.
 */
export function computeScore(input: ScoreInput): ScoreResult {
  const profile = PROFILE_BY_ID[input.profile] ?? PROFILE_BY_ID.default;
  const n = input.nutrition;
  const per = input.basisUnit === "ml" ? "100 ml" : "100 g";

  const penalties: ScoreReason[] = [];
  const positives: ScoreReason[] = [];
  const warnings: ScoreReason[] = [];
  const missing: NutrientKey[] = [];

  for (const rule of PENALTY_RULES) {
    const v = n[rule.key];
    if (v == null) { if (CORE_FIELDS.includes(rule.key)) missing.push(rule.key); continue; }
    const t = profile.thresholds?.[rule.key] ?? { low: rule.low, high: rule.high };
    const severity = clamp((v - t.low) / (t.high - t.low), 0, 1);
    const pts = r1(rule.maxPoints * (profile.weights[rule.key] ?? 1) * severity);
    if (pts > 0) {
      const level = severity >= 0.99 ? "High" : severity >= 0.4 ? "Moderately high" : "Slightly high";
      const reason = { key: rule.key, label: `${level} ${rule.label}`, points: -pts, detail: `${v} ${rule.unit} per ${per} (low ≤ ${t.low}, high ≥ ${t.high})` };
      penalties.push(reason);
      if (severity >= 0.4) warnings.push(reason);
    }
  }
  for (const rule of BONUS_RULES) {
    const v = n[rule.key];
    if (v == null) { if (CORE_FIELDS.includes(rule.key)) missing.push(rule.key); continue; }
    const progress = clamp((v - rule.from) / (rule.to - rule.from), 0, 1);
    const pts = r1(rule.maxPoints * (profile.weights[rule.key] ?? 1) * progress);
    if (pts > 0) positives.push({ key: rule.key, label: `${progress >= 0.99 ? "High" : "Good"} ${rule.label}`, points: pts, detail: `${v} ${rule.unit} per ${per}` });
  }

  // Ingredient risk: only knowledge-base ingredients count (never AI guesses).
  const ingPenalties: ScoreReason[] = [];
  for (const ing of input.ingredientInsights ?? []) {
    if (ing.source !== "knowledge_base") continue;
    const pts = INGREDIENT_RISK_POINTS[ing.riskLevel];
    if (pts > 0) ingPenalties.push({ key: `ingredient:${ing.name}`, label: ing.name, points: -pts, detail: ing.explanation });
  }
  let ingTotal = ingPenalties.reduce((s, p) => s - p.points, 0);
  ingTotal = Math.min(ingTotal, INGREDIENT_PENALTY_CAP);
  for (const p of ingPenalties.filter((x) => x.points <= -3)) warnings.push({ ...p, label: `Contains ${p.label}` });
  let novaPts = 0;
  if (input.nova === 4) {
    novaPts = NOVA4_PENALTY;
    warnings.push({ key: "nova", label: "Ultra-processed (NOVA 4)", points: -NOVA4_PENALTY, detail: "Classified NOVA group 4 by Open Food Facts" });
  }

  const present = CORE_FIELDS.filter((k) => n[k] != null);
  const dataCompleteness = r1(present.length / CORE_FIELDS.length * 100) / 100;
  const base: Omit<ScoreResult, "score" | "band" | "nutritionScore" | "reasons"> = {
    scoreVersion: SCORE_VERSION, profile: profile.id, ingredientScore: clamp(BASE_SCORE - ingTotal - novaPts, 0, 100),
    penalties: [...penalties, ...ingPenalties], positives, warnings, missing, dataCompleteness,
  };

  if (present.length < MIN_CORE_FIELDS) {
    return { ...base, score: null, band: "insufficient", nutritionScore: null,
      reasons: [`Not enough nutrition data to score this product (${present.length} of ${CORE_FIELDS.length} key nutrients available; at least ${MIN_CORE_FIELDS} needed). Add the nutrition label to get a score.`] };
  }

  const penaltySum = penalties.reduce((s, p) => s - p.points, 0);
  const bonusSum = positives.reduce((s, p) => s + p.points, 0);
  const nutritionScore = Math.round(clamp(BASE_SCORE - penaltySum + bonusSum, 0, 100));
  const score = Math.round(clamp(BASE_SCORE - penaltySum + bonusSum - ingTotal - novaPts, 0, 100));
  const band = score >= 75 ? "better" : score >= 50 ? "moderate" : score >= 25 ? "poor" : "avoid";

  const reasons: string[] = [];
  for (const p of positives) reasons.push(`+${p.points} ${p.label} (${p.detail})`);
  for (const p of penalties) reasons.push(`${p.points} ${p.label} (${p.detail})`);
  for (const p of ingPenalties) reasons.push(`${p.points} ${p.label}: ${p.detail}`);
  if (novaPts) reasons.push(`-${novaPts} Ultra-processed (NOVA 4)`);
  if (missing.length) reasons.push(`Not scored (data not available): ${missing.join(", ")}.`);

  return { ...base, score, band, nutritionScore, reasons };
}

export const BAND_LABEL: Record<ScoreResult["band"], string> = {
  better: "Better choice", moderate: "Okay in moderation", poor: "Less healthy", avoid: "Poor choice", insufficient: "Not enough data",
};
