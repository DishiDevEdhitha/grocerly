import Link from "next/link";
import { Trophy, X } from "lucide-react";
import { METRICS, metricValue, type MetricKey } from "@/lib/ranking";
import type { Product, ProductAnalysis } from "@/lib/types";

export interface CompareItem { id: string; score: number | null; product: Product & { id: string }; analysis?: ProductAnalysis }
const ROWS: MetricKey[] = ["score", "calories", "protein", "carbohydrates", "fat", "sugars", "sodium", "fiber", "quantity", "price"];

export default function CompareTable({ items, winners, onRemove }: { items: CompareItem[]; winners: Partial<Record<MetricKey, string[]>>; onRemove?: (id: string) => void }) {
  const cell = (it: CompareItem, m: MetricKey) => { const v = metricValue(it.product, it.score, m); return v == null ? "Not available" : `${Math.round(v * 10) / 10}${METRICS[m].unit ? " " + METRICS[m].unit : ""}`; };
  return (
    <div className="card overflow-x-auto !p-0">
      <table className="w-full min-w-[420px] text-sm">
        <thead><tr><th className="p-3 text-left font-semibold text-slate2" scope="col">Metric</th>
          {items.map((it) => (<th key={it.id} scope="col" className="min-w-[110px] p-3 text-left align-top"><Link href={`/product/${it.id}`} className="line-clamp-2 font-bold">{it.product.name}</Link>{onRemove && <button onClick={() => onRemove(it.id)} aria-label={`Remove ${it.product.name}`} className="mt-1 text-slate2"><X size={14} /></button>}</th>))}</tr></thead>
        <tbody>
          {ROWS.map((m) => (<tr key={m} className="border-t border-ink/10"><th scope="row" className="p-3 text-left font-semibold">{METRICS[m].label}</th>
            {items.map((it) => { const win = winners[m]?.includes(it.id); return <td key={it.id} className={`p-3 ${win ? "bg-mint font-bold text-leaf-dark" : ""}`}>{win && <Trophy size={13} className="mr-1 inline" aria-label="Best" />}{cell(it, m)}</td>; })}</tr>))}
          <tr className="border-t border-ink/10"><th scope="row" className="p-3 text-left font-semibold">Allergens</th>{items.map((it) => <td key={it.id} className="p-3 text-xs capitalize">{it.analysis ? (it.analysis.allergenReport.known ? (it.analysis.allergenReport.findings.map((f) => f.allergen).join(", ") || "None found") : "Unknown") : "–"}</td>)}</tr>
          <tr className="border-t border-ink/10"><th scope="row" className="p-3 text-left font-semibold">Ingredient flags</th>{items.map((it) => <td key={it.id} className="p-3 text-xs">{it.analysis ? (it.analysis.warnings.filter((w) => w.key.startsWith("ingredient:") || w.key === "nova").map((w) => w.label).join(", ") || "None flagged") : "–"}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}
