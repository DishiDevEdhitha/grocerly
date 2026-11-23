import { METRICS, type MetricKey, metricValue } from "./ranking";
import type { Product } from "./types";

/** For each metric, which product ids win. Missing values never win. Ties share the win. */
export function bestPerMetric(items: { id: string; product: Product; score: number | null }[], metrics: MetricKey[] = Object.keys(METRICS) as MetricKey[]) {
  const winners: Partial<Record<MetricKey, string[]>> = {};
  for (const m of metrics) {
    const vals = items.map((i) => ({ id: i.id, v: metricValue(i.product, i.score, m) })).filter((x): x is { id: string; v: number } => x.v != null);
    if (vals.length < 2) continue;
    const best = METRICS[m].higherIsBetter ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v));
    if (vals.every((x) => x.v === best)) continue; // all equal: nobody "wins"
    winners[m] = vals.filter((x) => x.v === best).map((x) => x.id);
  }
  return winners;
}
