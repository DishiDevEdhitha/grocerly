import Link from "next/link";
import { Trophy, X, Package } from "lucide-react";
import { METRICS, metricValue, type MetricKey } from "@/lib/ranking";
import { classifyNutrient, type Tone } from "@/lib/levels";
import type { NutrientKey, Product, ProductAnalysis } from "@/lib/types";

export interface CompareItem { id: string; score: number | null; product: Product & { id: string }; analysis?: ProductAnalysis }
const ROWS: MetricKey[] = ["score", "calories", "protein", "carbohydrates", "sugars", "fat", "saturatedFat", "sodium", "fiber", "quantity", "price"];
const TONE: Record<Tone, string> = { good: "text-leaf-dark", caution: "text-[#9a6a00]", bad: "text-chilli", neutral: "text-slate2" };

/** All nutrient rows are per 100 g / 100 ml, so the comparison is always like-for-like. */
export default function CompareTable({ items, winners, onRemove }: { items: CompareItem[]; winners: Partial<Record<MetricKey, string[]>>; onRemove?: (id: string) => void }) {
  const bestOverall = winners.score?.length === 1 ? winners.score[0] : null;
  const cell = (it: CompareItem, m: MetricKey) => {
    const v = metricValue(it.product, it.score, m);
    if (v == null) return <span className="text-slate2">Not available</span>;
    const text = `${Math.round(v * 10) / 10}${METRICS[m].unit ? " " + METRICS[m].unit : ""}`;
    const lvl = m in (it.product.nutrition ?? {}) || ["calories", "protein", "sugars", "fat", "saturatedFat", "sodium", "fiber"].includes(m) ? classifyNutrient(m as NutrientKey, v, it.product.nutritionBasis?.unit ?? "g") : null;
    return <span>{text}{lvl && <span className={`ml-1 block text-[10px] font-bold ${TONE[lvl.tone]}`}>{lvl.label}</span>}</span>;
  };
  return (
    <>
      <p className="mb-2 text-xs text-slate2">Nutrient values are per 100 g (or 100 ml for drinks). Labels use Grocerly reference thresholds.</p>
      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[420px] text-sm">
          <thead><tr><th className="p-3 text-left font-semibold text-slate2" scope="col">Metric</th>
            {items.map((it) => (<th key={it.id} scope="col" className="min-w-[112px] p-3 text-left align-top">
              {bestOverall === it.id && <span className="chip mb-1 bg-leaf text-white"><Trophy size={12} />Better option</span>}
              {it.product.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.product.imageSmall ?? it.product.image} alt="" loading="lazy" className="mb-1 h-14 w-14 rounded-xl bg-white object-contain" /> : <div className="mb-1 grid h-14 w-14 place-items-center rounded-xl bg-mint"><Package size={20} className="text-leaf/50" /></div>}
              <Link href={`/product/${it.id}`} className="line-clamp-2 font-bold">{it.product.name}</Link><span className="block text-xs font-normal text-slate2">{it.product.brand}</span>
              {onRemove && <button onClick={() => onRemove(it.id)} aria-label={`Remove ${it.product.name}`} className="mt-1 text-slate2"><X size={14} /></button>}</th>))}</tr></thead>
          <tbody>
            {ROWS.map((m) => (<tr key={m} className="border-t border-ink/10"><th scope="row" className="p-3 text-left font-semibold">{METRICS[m].label}</th>
              {items.map((it) => { const win = winners[m]?.includes(it.id); return <td key={it.id} className={`p-3 ${win ? "bg-mint font-bold text-leaf-dark" : ""}`}>{win && <Trophy size={13} className="mr-1 inline" aria-label="Best" />}{cell(it, m)}</td>; })}</tr>))}
            <tr className="border-t border-ink/10"><th scope="row" className="p-3 text-left font-semibold">Allergens</th>{items.map((it) => <td key={it.id} className="p-3 text-xs capitalize">{it.analysis ? (it.analysis.allergenReport.known ? (it.analysis.allergenReport.findings.map((f) => f.allergen).join(", ") || "None found") : "Unknown") : "–"}</td>)}</tr>
            <tr className="border-t border-ink/10"><th scope="row" className="p-3 text-left font-semibold">Ingredient flags</th>{items.map((it) => <td key={it.id} className="p-3 text-xs">{it.analysis ? (it.analysis.warnings.filter((w) => w.key.startsWith("ingredient:") || w.key === "nova").map((w) => w.label).join(", ") || "None flagged") : "–"}</td>)}</tr>
            <tr className="border-t border-ink/10"><th scope="row" className="p-3 text-left font-semibold">Data confidence</th>{items.map((it) => <td key={it.id} className="p-3 text-xs capitalize">{it.product.confidence?.overall ?? "–"}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
