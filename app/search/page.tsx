"use client";
import { useEffect, useState } from "react";
import ProductCard, { type CardItem } from "@/components/ProductCard";
import { PageTitle, ErrorBox, Empty, Loading } from "@/components/States";
import { api } from "@/lib/client";
import Link from "next/link";
import { Search } from "lucide-react";

export default function SearchPage() {
  const [q, setQ] = useState(""); const [items, setItems] = useState<CardItem[] | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setItems(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true); setError(null); setNote(null);
      try {
        const d = await api<{ results: CardItem[]; externalError?: string }>(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        setItems(d.results); if (d.externalError) setNote("Open Food Facts could not be reached, so only saved products are shown.");
      } catch (e) { if ((e as Error).name !== "AbortError") setError((e as Error).message); } finally { setLoading(false); }
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  return (
    <>
      <PageTitle title="Search products" sub="Grocerly checks its own database first, then Open Food Facts." />
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-3.5 text-slate2" size={20} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Maggi noodles, Lays, Oreo…" className="input pl-11" aria-label="Search products" autoFocus />
      </div>
      <div className="mt-4 space-y-3">
        {loading && <Loading label="Searching" />}
        {error && <ErrorBox message={error} />}
        {note && <p className="text-sm text-slate2">{note}</p>}
        {!loading && items?.map((i) => <ProductCard key={i.id} item={i} via="search" />)}
        {!loading && items && !items.length && <Empty title="No matches" body="Try a shorter name, scan the barcode, or add the product from its label." cta={{ label: "Add from label", href: "/ocr" }} />}
        {!items && !loading && <p className="px-1 text-sm text-slate2">Type at least two letters. <Link href="/scan" className="font-semibold text-leaf">Scan instead</Link></p>}
      </div>
    </>
  );
}
