import type { NutrientKey, ScoreProfileId } from "./types";

/**
 * All scoring thresholds live here so they can be tuned and documented in one place.
 * Values are per 100 g (or per 100 ml for beverages).
 *
 * Fat / saturated fat / sugars / sodium(salt) low-high cut-offs follow the UK FSA
 * front-of-pack "traffic light" boundaries (per 100 g). Energy, trans fat, protein and
 * fibre thresholds are Grocerly heuristics. Change SCORE_VERSION when you change anything.
 */
export const SCORE_VERSION = "1.0";
export const BASE_SCORE = 100;
export const MIN_CORE_FIELDS = 3; // below this we refuse to produce a number
export const CORE_FIELDS: NutrientKey[] = ["calories", "sodium", "sugars", "saturatedFat", "fat", "protein"];

export interface PenaltyRule { key: NutrientKey; label: string; low: number; high: number; maxPoints: number; unit: string }
export interface BonusRule { key: NutrientKey; label: string; from: number; to: number; maxPoints: number; unit: string }

export const PENALTY_RULES: PenaltyRule[] = [
  { key: "sodium", label: "sodium", low: 120, high: 600, maxPoints: 18, unit: "mg" },
  { key: "sugars", label: "sugars", low: 5, high: 22.5, maxPoints: 16, unit: "g" },
  { key: "saturatedFat", label: "saturated fat", low: 1.5, high: 5, maxPoints: 16, unit: "g" },
  { key: "fat", label: "total fat", low: 3, high: 17.5, maxPoints: 8, unit: "g" },
  { key: "calories", label: "calorie density", low: 150, high: 450, maxPoints: 12, unit: "kcal" },
  { key: "transFat", label: "trans fat", low: 0.1, high: 2, maxPoints: 10, unit: "g" },
];
export const BONUS_RULES: BonusRule[] = [
  { key: "protein", label: "protein", from: 3, to: 15, maxPoints: 8, unit: "g" },
  { key: "fiber", label: "fibre", from: 1.5, to: 6, maxPoints: 8, unit: "g" },
];

export const INGREDIENT_RISK_POINTS = { none: 0, low: 1, moderate: 3, high: 6 } as const;
export const INGREDIENT_PENALTY_CAP = 20;
export const NOVA4_PENALTY = 5;

export interface Profile {
  id: ScoreProfileId;
  label: string;
  /** Multipliers on penalty maxPoints / bonus maxPoints. Default 1. */
  weights: Partial<Record<NutrientKey, number>>;
  /** Per-profile low/high replacements (e.g. beverages are judged per 100 ml). */
  thresholds?: Partial<Record<NutrientKey, { low: number; high: number }>>;
  /** Keywords found in category tags / name that select this profile. */
  match: string[];
}

export const PROFILES: Profile[] = [
  { id: "protein_bar", label: "Protein bar", weights: { protein: 1.5, sugars: 1.4, fiber: 1.3, sodium: 0.6 }, match: ["protein-bar", "protein bar", "energy-bar", "snack-bars", "cereal-bars", "granola-bars"] },
  { id: "beverage", label: "Beverage", weights: { sugars: 2, calories: 1.5, sodium: 0.8, fat: 0.3, saturatedFat: 0.3, protein: 0.2 },
    thresholds: { sugars: { low: 2.5, high: 11.25 }, calories: { low: 20, high: 60 }, sodium: { low: 30, high: 150 } },
    match: ["beverages", "drinks", "juices", "sodas", "carbonated", "soft-drinks", "energy-drinks", "cold-drink"] },
  { id: "cereal", label: "Breakfast cereal", weights: { sugars: 1.5, fiber: 1.5, sodium: 1.1, protein: 1.2, fat: 0.7 }, match: ["breakfast-cereals", "cereals", "muesli", "oats", "cornflakes", "granola"] },
  { id: "noodles", label: "Instant noodles", weights: { sodium: 1.4, saturatedFat: 1.1 }, match: ["noodles", "instant-noodles", "pasta", "vermicelli"] },
  { id: "biscuits", label: "Biscuits & cookies", weights: { sugars: 1.2, saturatedFat: 1.2, transFat: 1.5, fiber: 1.0 }, match: ["biscuits", "cookies", "cakes", "wafers", "crackers"] },
  { id: "chips_snacks", label: "Chips & salty snacks", weights: { sodium: 1.3, saturatedFat: 1.3, fat: 1.2, calories: 1.2, sugars: 0.6 }, match: ["chips", "crisps", "salty-snacks", "namkeen", "puffed", "snacks"] },
  { id: "default", label: "General food", weights: {}, match: [] },
];

export const PROFILE_BY_ID = Object.fromEntries(PROFILES.map((p) => [p.id, p])) as Record<ScoreProfileId, Profile>;

export function detectProfile(tags: string[], name = ""): ScoreProfileId {
  const hay = [...tags.map((t) => t.toLowerCase().replace(/^[a-z]{2}:/, "")), name.toLowerCase()].join(" | ");
  for (const p of PROFILES) if (p.match.some((m) => hay.includes(m))) return p.id;
  return "default";
}
