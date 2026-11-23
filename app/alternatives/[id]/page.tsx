"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PageTitle, Loading, ErrorBox } from "@/components/States";
import { api } from "@/lib/client";
import { METRICS, DEFAULT_PREFERENCES, type MetricKey, type Preferences } from "@/lib/ranking";

type Alt = { id: string; score: number | null; reasons: string[]; coverage: number; product: { id: string; name: string; brand?: string } };

export default function AlternativesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [alts, setAlts] = useState<Alt[] | null>(null); const [count, setCount] = useState(0); const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = Object.entries(prefs).filter(([, w]) => w && w > 0).map(([k, w]) => `${k}:${w}`).join(",");
      api<{ alternatives: Alt[]; candidateCount: number }>(`/api/alternatives/${id}?prefs=${q}`).then((d) => { setAlts(d.alternatives); setCount(d.candidateCount); setError(null); }).catch((e) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [id, prefs]);

  const total = Object.values(prefs).reduce((s, v) => s + (v ?? 0), 0) || 1;
  return (
    <>
      <PageTitle title="Better alternatives" sub="Set what matters to you. Weights are relative, so they don't have to add up to 100." />
      <section className="card space-y-4" aria-label="Priorities">
        {(Object.keys(METRICS) as MetricKey[]).map((m) => (
          <div key={m}><label htmlFor={m} className="flex justify-between text-sm font-semibold"><span>{METRICS[m].label}</span><span className="text-slate2">{Math.round(((prefs[m] ?? 0) / total) * 100)}%</span></label>
            <input id={m} type="range" min={0} max={100} step={5} value={prefs[m] ?? 0} onChange={(e) => setPrefs({ ...prefs, [m]: Number(e.target.value) })} className="mt-1 w-full accent-[#1F7A5A]" /></div>))}
      </section>
      <div className="mt-4 space-y-3">
        {error && <ErrorBox message={error} />}
        {!alts && !error && <Loading label="Ranking" />}
        {alts?.length === 0 && <p className="card text-sm text-slate2">No product beats this one for your priorities among {count} similar items. Try different weights or add more products by searching.</p>}
        {alts?.map((a) => (<Link key={a.id} href={`/product/${a.id}`} className="card block"><div className="flex justify-between gap-2"><b>{a.product.name}</b><span className="font-display text-xl font-extrabold">{a.score ?? "–"}</span></div>
          <p className="text-sm text-slate2">{a.product.brand}</p><p className="mt-2 text-sm">Recommended because:</p><ul className="text-sm text-leaf-dark">{a.reasons.map((r) => <li key={r}>+ {r}</li>)}{!a.reasons.length && <li>+ best overall match for your priorities</li>}</ul>
          {a.coverage < 1 && <p className="mt-1 text-xs text-slate2">Some chosen metrics are not available for this product.</p>}</Link>))}
      </div>
    </>
  );
}
