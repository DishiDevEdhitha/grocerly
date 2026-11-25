"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ScanLine, FileText, ShoppingBasket, Milk, Cookie, Popcorn, CupSoda, Soup, Candy, Wheat, Sandwich, Droplets, Croissant, Snowflake, Package, GitCompare } from "lucide-react";
import ProductTile from "@/components/ProductTile";
import { api } from "@/lib/client";
import { DEPARTMENTS } from "@/lib/taxonomy";
import type { ProductCardData } from "@/lib/search";

const ICON: Record<string, typeof Milk> = { Dairy: Milk, Biscuits: Cookie, Snacks: Popcorn, Beverages: CupSoda, "Instant Foods": Soup, "Chocolates & Sweets": Candy, Cereals: Wheat, Spreads: Sandwich, "Sauces & Condiments": Droplets, Bakery: Croissant, "Frozen Food": Snowflake, Staples: Package };
const ACTIONS = [{ href: "/scan", label: "Scan", Icon: ScanLine }, { href: "/ocr", label: "Upload label", Icon: FileText }, { href: "/cart", label: "Analyze cart", Icon: ShoppingBasket }, { href: "/compare", label: "Compare", Icon: GitCompare }];

export default function Home() {
  const router = useRouter(); const [q, setQ] = useState("");
  const [home, setHome] = useState<{ departments: { name: string; count: number }[]; popular: ProductCardData[] } | null>(null);
  const [recent, setRecent] = useState<ProductCardData[]>([]);
  useEffect(() => {
    api<typeof home>("/api/home").then(setHome).catch(() => setHome({ departments: [], popular: [] }));
    api<{ items: (ProductCardData & { scannedAt: string })[] }>("/api/history").then((d) => { const seen = new Set<string>(); setRecent(d.items.filter((i) => !seen.has(i.id) && seen.add(i.id)).slice(0, 6).map((i) => ({ ...i, indicators: [], vegetarian: null }))); }).catch(() => undefined);
  }, []);
  const depts = home?.departments.length ? home.departments : DEPARTMENTS.map((name) => ({ name, count: 0 }));
  return (
    <>
      <header className="pb-4 pt-2">
        <p className="font-display text-xl font-extrabold text-leaf">Grocerly</p>
        <h1 className="mt-3 text-[30px] font-extrabold leading-[1.05]">What&apos;s really in the pack you&apos;re holding?</h1>
      </header>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }} role="search" className="relative">
        <Search className="pointer-events-none absolute left-4 top-3.5 text-slate2" size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search food products…" className="input pl-11 shadow-sm" aria-label="Search food products" />
      </form>
      <ul className="mt-3 grid grid-cols-4 gap-2">{ACTIONS.map(({ href, label, Icon }) => <li key={href}><Link href={href} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl bg-leaf text-center text-[11px] font-semibold text-white"><Icon size={22} />{label}</Link></li>)}</ul>

      <section className="mt-6" aria-labelledby="cats"><h2 id="cats" className="text-lg font-bold">Categories</h2>
        <ul className="mt-3 grid grid-cols-3 gap-2">{depts.map((d) => { const Icon = ICON[d.name] ?? Package; return <li key={d.name}><Link href={`/search?cat=${encodeURIComponent(d.name)}`} className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-1 text-center text-xs font-semibold shadow-[0_1px_0_rgba(18,35,29,.06)]"><span className="grid h-10 w-10 place-items-center rounded-full bg-mint text-leaf"><Icon size={20} /></span>{d.name}{d.count > 0 && <span className="text-[10px] font-medium text-slate2">{d.count} products</span>}</Link></li>; })}</ul></section>

      {home && home.popular.length > 0 && (
        <section className="mt-6" aria-labelledby="pop"><h2 id="pop" className="text-lg font-bold">Popular products</h2>
          <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">{home.popular.map((p) => <li key={p.id} className="w-44 shrink-0 snap-start"><ProductTile item={p} /></li>)}</ul></section>
      )}
      {recent.length > 0 && (
        <section className="mt-6" aria-labelledby="rec"><div className="flex items-center justify-between"><h2 id="rec" className="text-lg font-bold">Recently analysed</h2><Link href="/history" className="text-sm font-semibold text-leaf">See all</Link></div>
          <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">{recent.map((p) => <li key={p.id} className="w-44 shrink-0 snap-start"><ProductTile item={p} /></li>)}</ul></section>
      )}
      {home && home.departments.length === 0 && <p className="card mt-6 text-sm text-slate2">The catalogue is empty. Run the import steps in the guide to fill it, or scan a product to add your first one.</p>}
      <Link href="/about" className="mt-6 block rounded-2xl bg-mint p-4 text-sm font-semibold text-leaf-dark">How scores work and where data comes from</Link>
    </>
  );
}
