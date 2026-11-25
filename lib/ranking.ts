import type { Product } from "./types";

export type MetricKey = "score" | "price" | "quantity" | "calories" | "protein" | "carbohydrates" | "fat" | "saturatedFat" | "sodium" | "sugars" | "fiber";
export const METRICS: Record<MetricKey, { label: string; higherIsBetter: boolean; unit: string }> = {
  score: { label: "Grocerly score", higherIsBetter: true, unit: "pts" },
  price: { label: "Price", higherIsBetter: false, unit: "" },
  quantity: { label: "Quantity", higherIsBetter: true, unit: "" },
  calories: { label: "Calories", higherIsBetter: false, unit: "kcal" },
  protein: { label: "Protein", higherIsBetter: true, unit: "g" },
  carbohydrates: { label: "Carbohydrates", higherIsBetter: false, unit: "g" },
  fat: { label: "Fat", higherIsBetter: false, unit: "g" },
  saturatedFat: { label: "Saturated fat", higherIsBetter: false, unit: "g" },
  sodium: { label: "Sodium", higherIsBetter: false, unit: "mg" },
  sugars: { label: "Sugar", higherIsBetter: false, unit: "g" },
  fiber: { label: "Fibre", higherIsBetter: true, unit: "g" },
};
export type Preferences = Partial<Record<MetricKey, number>>; // weights, any scale
export const DEFAULT_PREFERENCES: Preferences = { score: 40, protein: 15, sodium: 15, sugars: 15, fiber: 10, calories: 5 };

export interface Candidate { id: string; product: Product; score: number | null }
export interface Alternative { id: string; product: Product; score: number | null; utility: number; coverage: number; reasons: string[] }

export function metricValue(p: Product, score: number | null, m: MetricKey): number | undefined {
  switch (m) {
    case "score": return score ?? undefined;
    case "price": return p.price?.value;
    case "quantity": return p.quantity?.value;
    default: return p.nutrition[m];
  }
}

/**
 * Pure ranking function (easy to unit test).
 * 1) min-max normalise every metric across [current + candidates]  2) flip "lower is better" metrics
 * 3) weighted sum over metrics the candidate actually has (weights re-normalised, never assume 0)
 */
export function rankAlternatives(current: Candidate, candidates: Candidate[], prefs: Preferences, limit = 5): Alternative[] {
  const active = (Object.entries(prefs) as [MetricKey, number][]).filter(([k, w]) => w > 0 && METRICS[k]);
  if (!active.length) return [];
  const all = [current, ...candidates];
  const range: Partial<Record<MetricKey, [number, number]>> = {};
  for (const [m] of active) {
    const vals = all.map((c) => metricValue(c.product, c.score, m)).filter((v): v is number => v != null);
    if (vals.length) range[m] = [Math.min(...vals), Math.max(...vals)];
  }
  const utility = (c: Candidate) => {
    let sum = 0, wsum = 0, wall = 0;
    for (const [m, w] of active) {
      wall += w;
      const v = metricValue(c.product, c.score, m); const r = range[m];
      if (v == null || !r) continue;
      let norm = r[1] === r[0] ? 0.5 : (v - r[0]) / (r[1] - r[0]);
      if (!METRICS[m].higherIsBetter) norm = 1 - norm;
      sum += norm * w; wsum += w;
    }
    return { utility: wsum ? sum / wsum : 0, coverage: wall ? wsum / wall : 0 };
  };
  const cur = utility(current);
  return candidates
    .map((c) => ({ c, u: utility(c) }))
    .filter(({ c, u }) => c.id !== current.id && u.coverage >= 0.5 && u.utility > cur.utility)
    .sort((a, b) => b.u.utility - a.u.utility)
    .slice(0, limit)
    .map(({ c, u }) => ({ id: c.id, product: c.product, score: c.score, utility: Math.round(u.utility * 100) / 100, coverage: Math.round(u.coverage * 100) / 100, reasons: explain(current, c) }));
}

/** Human-readable "why is this better" lines. */
export function explain(cur: Candidate, alt: Candidate): string[] {
  const out: string[] = [];
  if (cur.score != null && alt.score != null && alt.score - cur.score >= 3) out.push(`${alt.score - cur.score} points higher Grocerly score`);
  const lower = (m: MetricKey, label: string) => {
    const a = metricValue(alt.product, alt.score, m), c = metricValue(cur.product, cur.score, m);
    if (a != null && c != null && c > 0 && (c - a) / c >= 0.1) out.push(`${Math.round(((c - a) / c) * 100)}% less ${label}`);
  };
  lower("sodium", "sodium"); lower("sugars", "sugar"); lower("calories", "calories"); lower("fat", "fat");
  const higher = (m: MetricKey, label: string, minDiff: number) => {
    const a = metricValue(alt.product, alt.score, m), c = metricValue(cur.product, cur.score, m);
    if (a != null && c != null && a - c >= minDiff) out.push(`${Math.round((a - c) * 10) / 10} g more ${label}`);
  };
  higher("protein", "protein", 1); higher("fiber", "fibre", 1);
  const ap = alt.product.price?.value, cp = cur.product.price?.value;
  if (ap != null && cp != null && ap < cp) out.push(`${Math.round(((cp - ap) / cp) * 100)}% cheaper`);
  return out.slice(0, 5);
}


/** ?prefs=score:40,protein:30,sodium:20,price:10 */
export function parsePrefs(s: string | null): Preferences {
  if (!s) return DEFAULT_PREFERENCES;
  const out: Preferences = {};
  for (const part of s.split(",")) {
    const [k, v] = part.split(":");
    const w = Number(v);
    if (k in METRICS && Number.isFinite(w) && w > 0 && w <= 100) out[k as MetricKey] = w;
  }
  return Object.keys(out).length ? out : DEFAULT_PREFERENCES;
}

