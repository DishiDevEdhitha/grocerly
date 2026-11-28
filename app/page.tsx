"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ScanLine, FileText, ShoppingBasket, Scale, Leaf, Info, Milk, Cookie, Popcorn, CupSoda, Soup, Candy, Wheat, Sandwich, Droplets, Croissant, Snowflake, Package, ChevronRight } from "lucide-react";
import ProductTile from "@/components/ProductTile";
import { api } from "@/lib/client";
import { DEPARTMENTS } from "@/lib/taxonomy";
import type { ProductCardData } from "@/lib/search";

const ICON: Record<string, typeof Milk> = { Dairy: Milk, Biscuits: Cookie, Snacks: Popcorn, Beverages: CupSoda, "Instant Foods": Soup, "Chocolates & Sweets": Candy, Cereals: Wheat, Spreads: Sandwich, "Sauces & Condiments": Droplets, Bakery: Croissant, "Frozen Food": Snowflake, Staples: Package };
const PASTEL = ["bg-tile-peach", "bg-tile-green", "bg-tile-yellow", "bg-tile-sky", "bg-tile-orange", "bg-tile-rose", "bg-tile-green", "bg-tile-purple"];
const ACTIONS = [
  { href: "/scan", label: "Scan Barcode", Icon: ScanLine, bg: "bg-tile-green", fg: "text-leaf" },
  { href: "/ocr", label: "Upload Label", Icon: FileText, bg: "bg-tile-purple", fg: "text-[#6D4FD0]" },
  { href: "/cart", label: "Analyze Cart", Icon: ShoppingBasket, bg: "bg-tile-orange", fg: "text-[#D9751A]" },
  { href: "/compare", label: "Compare Products", Icon: Scale, bg: "bg-tile-blue", fg: "text-[#2E6FC4]" },
];

export default function Home() {
  const router = useRouter(); const [q, setQ] = useState("");
  const [home, setHome] = useState<{ departments: { name: string; count: number }[]; popular: ProductCardData[] } | null>(null);
  const [recent, setRecent] = useState<ProductCardData[]>([]);
  useEffect(() => {
    api<typeof home>("/api/home").then(setHome).catch(() => setHome({ departments: [], popular: [] }));
    api<{ items: (ProductCardData & { scannedAt: string })[] }>("/api/history").then((d) => { const seen = new Set<string>(); setRecent(d.items.filter((i) => !seen.has(i.id) && seen.add(i.id)).slice(0, 6).map((i) => ({ ...i, indicators: [], vegetarian: null }))); }).catch(() => undefined);
  }, []);
  const depts = (home?.departments.length ? home.departments : DEPARTMENTS.map((name) => ({ name, count: 0 }))).slice(0, 8);
  return (
    <>
      <header className="flex items-center justify-between pb-3">
        <span className="flex items-center gap-1.5 text-[19px] font-extrabold text-leaf-dark"><Leaf size={20} className="fill-leaf text-leaf" />Grocerly</span>
        <Link href="/about" aria-label="About and how scores work" className="grid h-8 w-8 place-items-center rounded-full bg-white shadow-sm ring-1 ring-ink/[.06]"><Info size={16} /></Link>
      </header>
      <h1 className="text-[26px] font-extrabold leading-[1.1]">Know what&apos;s<br />really in your food.</h1>
      <p className="mt-1.5 text-[12.5px] text-slate2">Scan · Analyze · Compare · Choose Better</p>

      <form onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }} role="search" className="relative mt-4">
        <Search className="pointer-events-none absolute left-3.5 top-3.5 text-slate2" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for any product…" className="input pl-10 pr-12 shadow-sm" aria-label="Search food products" />
        <Link href="/scan" aria-label="Scan a barcode" className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-[10px] bg-mint text-leaf"><ScanLine size={16} /></Link>
      </form>

      <ul className="mt-4 grid grid-cols-4 gap-2">{ACTIONS.map(({ href, label, Icon, bg, fg }) => (
        <li key={href}><Link href={href} className={`flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center text-[10.5px] font-bold leading-tight ${bg}`}><Icon size={20} className={fg} />{label}</Link></li>))}</ul>

      <section className="mt-6" aria-labelledby="cats">
        <div className="flex items-center justify-between"><h2 id="cats" className="section-title">Browse Categories</h2><Link href="/search?cat=Dairy" className="flex items-center text-[12px] font-semibold text-leaf">See all<ChevronRight size={14} /></Link></div>
        <ul className="mt-3 grid grid-cols-4 gap-2">{depts.map((d, i) => { const Icon = ICON[d.name] ?? Package; return (
          <li key={d.name}><Link href={`/search?cat=${encodeURIComponent(d.name)}`} className={`flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center text-[10.5px] font-semibold leading-tight ${PASTEL[i % PASTEL.length]}`}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/80 text-leaf-dark"><Icon size={16} /></span>{d.name}</Link></li>); })}</ul>
      </section>

      {home && home.popular.length > 0 && (
        <section className="mt-6" aria-labelledby="pop"><h2 id="pop" className="section-title">Popular Products</h2>
          <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">{home.popular.map((p) => <li key={p.id} className="w-40 shrink-0 snap-start"><ProductTile item={p} /></li>)}</ul></section>
      )}
      {recent.length > 0 && (
        <section className="mt-5" aria-labelledby="rec"><div className="flex items-center justify-between"><h2 id="rec" className="section-title">Recently Analysed</h2><Link href="/history" className="text-[12px] font-semibold text-leaf">See all</Link></div>
          <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">{recent.map((p) => <li key={p.id} className="w-40 shrink-0 snap-start"><ProductTile item={p} /></li>)}</ul></section>
      )}
      {home && home.departments.length === 0 && <p className="card mt-6 text-[13px] text-slate2">The catalogue is empty. Run the import steps in the guide to fill it, or scan a product to add your first one.</p>}
    </>
  );
}
