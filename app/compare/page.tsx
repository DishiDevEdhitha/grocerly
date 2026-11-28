"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Plus } from "lucide-react";
import { PageTitle, Loading, ErrorBox, Empty } from "@/components/States";
import CompareTable, { type CompareItem } from "@/components/CompareTable";
import ProductTile from "@/components/ProductTile";
import { api, getTray, addToTray, removeFromTray } from "@/lib/client";
import type { MetricKey } from "@/lib/ranking";
import type { ProductCardData } from "@/lib/search";

export default function ComparePage() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [data, setData] = useState<{ items: CompareItem[]; winners: Partial<Record<MetricKey, string[]>> } | null>(null);
  const [sim, setSim] = useState<(ProductCardData & { why: string[] })[]>([]);
  const [sortByScore, setSortByScore] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { setIds(getTray()); }, []);
  useEffect(() => {
    if (!ids) return; setError(null);
    if (ids.length >= 2) api<typeof data>(`/api/compare?ids=${ids.join(",")}`).then(setData).catch((e) => setError(e.message)); else setData(null);
    if (ids.length >= 1 && ids.length < 4) api<{ items: (ProductCardData & { why: string[] })[] }>(`/api/compare/suggest?id=${ids[0]}`).then((d) => setSim(d.items.filter((i) => !ids.includes(i.id)).slice(0, 6))).catch(() => setSim([]));
    else setSim([]);
  }, [ids]);
  if (!ids) return <Loading />;
  const items = data ? (sortByScore ? [...data.items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) : data.items) : [];
  return (
    <>
      <PageTitle title="Compare" sub="Pick 2 to 4 similar products. The best value in each row is highlighted." />
      {error && <ErrorBox message={error} />}
      {ids.length < 2 ? <Empty title={ids.length ? "Add one more product" : "Pick two or more products"} body="Open a product and tap Compare, or choose from the suggestions." cta={{ label: "Search products", href: "/search" }} />
        : !data ? <Loading label="Comparing" /> : (
        <>
          <div className="mb-2 flex justify-end"><button onClick={() => setSortByScore((s) => !s)} aria-pressed={sortByScore} className={sortByScore ? "btn-primary !min-h-[40px] text-sm" : "btn-outline !min-h-[40px] text-sm"}><ArrowDownWideNarrow size={16} />Sort by score</button></div>
          <CompareTable items={items} winners={data.winners} onRemove={(id) => setIds(removeFromTray(id))} />
        </>
      )}
      {sim.length > 0 && ids.length < 4 && (
        <section className="mt-6"><h2 className="section-title">Suggested to compare</h2><p className="text-xs text-slate2">Same type or category as your first product, other brands first.</p>
          <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">{sim.map((s) => <li key={s.id} className="w-44 shrink-0 snap-start"><ProductTile item={s} action={<button onClick={() => setIds(addToTray(s.id))} className="btn-ghost mt-2 !min-h-[40px] w-full text-sm"><Plus size={16} />Add</button>} /></li>)}</ul></section>
      )}
      {ids.length > 0 && ids.length < 4 && <Link href="/search" className="btn-outline mt-4 w-full">Search another product</Link>}
    </>
  );
}
