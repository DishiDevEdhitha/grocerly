"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, SlidersHorizontal, X, Loader2 } from "lucide-react";
import ProductTile from "@/components/ProductTile";
import CategoryChips from "@/components/CategoryChips";
import { ErrorBox, Empty } from "@/components/States";
import { api } from "@/lib/client";
import { SORTS } from "@/lib/search-core";
import type { SearchResponse } from "@/lib/search";

function SearchInner() {
  const router = useRouter(); const sp = useSearchParams();
  const q = sp.get("q") ?? ""; const type = sp.get("type") ?? undefined; const brand = sp.get("brand") ?? undefined; const cat = sp.get("cat") ?? undefined;
  const sort = sp.get("sort") ?? "relevance"; const veg = sp.get("veg") === "1";
  const [text, setText] = useState(q);
  const [res, setRes] = useState<SearchResponse | null>(null); const [items, setItems] = useState<SearchResponse["items"]>([]);
  const [page, setPage] = useState(1); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false); const [wider, setWider] = useState(false);
  const seq = useRef(0);

  const setParam = useCallback((patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    router.replace(`/search?${n.toString()}`, { scroll: false });
  }, [sp, router]);

  // debounce typing -> URL
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== q.trim()) setParam({ q: text.trim() || undefined, type: undefined, brand: undefined }); }, 400); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (pageNo: number, external = false) => {
    if (q.trim().length < 2 && !cat) { setRes(null); setItems([]); return; }
    const my = ++seq.current; setLoading(true); setError(null);
    const params = new URLSearchParams({ q, page: String(pageNo), sort }); if (type) params.set("type", type); if (brand) params.set("brand", brand); if (cat) params.set("cat", cat); if (veg) params.set("veg", "1"); if (external) params.set("external", "1");
    try {
      const d = await api<SearchResponse>(`/api/search?${params}`);
      if (my !== seq.current) return;
      setRes(d); setItems((prev) => (pageNo === 1 ? d.items : [...prev, ...d.items])); setPage(pageNo);
    } catch (e) { if (my === seq.current) setError((e as Error).message); } finally { if (my === seq.current) setLoading(false); setWider(false); }
  }, [q, type, brand, cat, sort, veg]);
  useEffect(() => { load(1); }, [load]);

  const activeFilters = (brand ? 1 : 0) + (veg ? 1 : 0);
  return (
    <>
      <header className="pb-3 pt-2"><h1 className="text-[28px] font-extrabold leading-tight">{cat ?? (q ? q : "Search")}</h1></header>
      <form onSubmit={(e) => e.preventDefault()} className="relative" role="search">
        <Search className="pointer-events-none absolute left-4 top-3.5 text-slate2" size={20} />
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search Maggi, cheese, Amul…" className="input pl-11" aria-label="Search products" autoFocus={!cat} />
      </form>

      {res && <div className="mt-3"><CategoryChips chips={res.chips} total={res.total} active={type} onSelect={(t) => setParam({ type: t })} /></div>}
      {res && (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setSheet(true)} className="btn-outline !min-h-[42px] !px-4 text-sm"><SlidersHorizontal size={16} />Filters{activeFilters ? ` (${activeFilters})` : ""}</button>
          <label className="sr-only" htmlFor="sort">Sort</label>
          <select id="sort" value={sort} onChange={(e) => setParam({ sort: e.target.value === "relevance" ? undefined : e.target.value })} className="input !min-h-[42px] flex-1 !py-0 text-sm">{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </div>
      )}
      {res && (res.intent.brand || res.intent.categories.length > 0) && <p className="mt-2 text-xs text-slate2">Showing {res.total} product{res.total === 1 ? "" : "s"}{res.intent.brand ? ` from ${res.intent.brand}` : ""}{res.intent.categories.length ? ` in ${res.intent.categories.slice(0, 2).join(", ")}` : ""}.</p>}

      <div className="mt-4">
        {error && <ErrorBox message={error} action={{ label: "Try again", onClick: () => load(1) }} />}
        {loading && items.length === 0 && <div className="grid grid-cols-2 gap-3" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-64 animate-pulse !bg-white/70" />)}</div>}
        {items.length > 0 && <ul className="grid grid-cols-2 gap-3">{items.map((i) => <li key={i.id}><ProductTile item={i} via="search" /></li>)}</ul>}
        {res?.hasMore && <button onClick={() => load(page + 1)} disabled={loading} className="btn-outline mt-4 w-full">{loading ? <Loader2 className="animate-spin" size={18} /> : null}Show more</button>}
        {res && res.items.length === 0 && items.length === 0 && !loading && (
          <Empty title="No matching products" body="Grocerly has nothing for that yet. You can look wider on Open Food Facts, or add the product from its label." />
        )}
        {res && !loading && (res.total < 5) && q.trim().length >= 2 && (
          <div className="mt-4 space-y-2">
            {res.externalError && <p className="text-sm text-slate2">{res.externalError}</p>}
            {res.externalAdded ? <p className="text-sm text-leaf-dark">Added {res.externalAdded} new product(s) from Open Food Facts.</p> : null}
            <button onClick={() => { setWider(true); load(1, true); }} disabled={wider} className="btn-ghost w-full">{wider ? <Loader2 className="animate-spin" size={18} /> : null}Look wider on Open Food Facts (India)</button>
            <Link href="/ocr" className="btn-outline w-full">Add it from a label photo</Link>
          </div>
        )}
        {!res && !loading && !error && <p className="px-1 text-sm text-slate2">Try “maggi”, “cheese”, “amul cheese” or “processed cheese”. <Link href="/scan" className="font-semibold text-leaf">Scan instead</Link></p>}
      </div>

      {sheet && res && (
        <div className="fixed inset-0 z-30 flex items-end bg-ink/40" role="dialog" aria-modal="true" aria-label="Filters" onClick={() => setSheet(false)}>
          <div className="mx-auto max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Filters</h2><button onClick={() => setSheet(false)} aria-label="Close" className="p-2"><X /></button></div>
            <h3 className="mt-3 text-sm font-bold">Diet</h3>
            <label className="mt-1 flex min-h-[48px] items-center gap-3 rounded-2xl bg-white px-4"><input type="checkbox" checked={veg} onChange={(e) => setParam({ veg: e.target.checked ? "1" : undefined })} className="h-5 w-5 accent-[#1F7A5A]" />Vegetarian only (where known)</label>
            {res.brands.length > 1 && (<><h3 className="mt-4 text-sm font-bold">Brand</h3><div className="mt-1 flex flex-wrap gap-2">{res.brands.map((b) => <button key={b.norm} onClick={() => setParam({ brand: brand === b.norm ? undefined : b.norm })} className={`min-h-[40px] rounded-full px-4 text-sm font-semibold ${brand === b.norm ? "bg-ink text-white" : "bg-white ring-1 ring-ink/10"}`}>{b.label} <span className="opacity-60">{b.count}</span></button>)}</div></>)}
            <button onClick={() => { setParam({ brand: undefined, veg: undefined }); setSheet(false); }} className="btn-outline mt-6 w-full">Clear filters</button>
            <button onClick={() => setSheet(false)} className="btn-primary mt-2 w-full">Show {res.total} product{res.total === 1 ? "" : "s"}</button>
          </div>
        </div>
      )}
    </>
  );
}
export default function SearchPage() { return <Suspense><SearchInner /></Suspense>; }
