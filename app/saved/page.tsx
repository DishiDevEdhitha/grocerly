"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import ProductRow from "@/components/ProductRow";
import { PageTitle, Loading, ErrorBox, Empty } from "@/components/States";
import { api } from "@/lib/client";

type S = { id: string; name: string; brand?: string; image?: string; score: number | null; category?: string };
export default function SavedPage() {
  const [items, setItems] = useState<S[] | null>(null); const [error, setError] = useState<string | null>(null); const [cat, setCat] = useState<string | null>(null);
  useEffect(() => { api<{ items: S[] }>("/api/saved").then((d) => setItems(d.items)).catch((e) => setError(e.message)); }, []);
  async function remove(id: string) { setItems((x) => x?.filter((i) => i.id !== id) ?? null); await api(`/api/saved?productId=${id}`, { method: "DELETE" }).catch(() => undefined); }
  if (error) return <ErrorBox message={error} />;
  if (!items) return <Loading />;
  const cats = [...items.reduce((m, i) => m.set(i.category ?? "Other", (m.get(i.category ?? "Other") ?? 0) + 1), new Map<string, number>())];
  const list = cat ? items.filter((i) => (i.category ?? "Other") === cat) : items;
  return (
    <>
      <PageTitle title="Saved Products" />
      {cats.length > 1 && <div role="tablist" aria-label="Filter saved products" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button role="tab" aria-selected={!cat} onClick={() => setCat(null)} className={`min-h-[34px] shrink-0 rounded-full px-4 text-[12.5px] font-semibold ${!cat ? "bg-leaf text-white" : "bg-white ring-1 ring-ink/10"}`}>All ({items.length})</button>
        {cats.map(([c, n]) => <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`min-h-[34px] shrink-0 rounded-full px-4 text-[12.5px] font-semibold ${cat === c ? "bg-leaf text-white" : "bg-white ring-1 ring-ink/10"}`}>{c} ({n})</button>)}</div>}
      <div className="mt-3 space-y-2">
        {!items.length ? <Empty title="No saved products" body="Tap Save on a product to keep it here." cta={{ label: "Search products", href: "/search" }} /> :
          list.map((i) => <ProductRow key={i.id} item={i} trailing={<button onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate2 hover:bg-paper"><Trash2 size={16} /></button>} />)}
      </div>
    </>
  );
}
