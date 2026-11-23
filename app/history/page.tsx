"use client";
import { useEffect, useState } from "react";
import ProductCard, { type CardItem } from "@/components/ProductCard";
import { PageTitle, Loading, ErrorBox, Empty } from "@/components/States";
import { api } from "@/lib/client";

type H = CardItem & { scannedAt: string; method: string };
const dayKey = (d: Date) => d.toDateString();
export default function HistoryPage() {
  const [items, setItems] = useState<H[] | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ items: H[] }>("/api/history").then((d) => setItems(d.items)).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!items) return <Loading />;
  const today = dayKey(new Date()), yest = dayKey(new Date(Date.now() - 864e5));
  const groups: Record<string, H[]> = { Today: [], Yesterday: [], Older: [] };
  for (const i of items) { const k = dayKey(new Date(i.scannedAt)); (k === today ? groups.Today : k === yest ? groups.Yesterday : groups.Older).push(i); }
  const label: Record<string, string> = { barcode: "Scanned", search: "Searched", ocr: "Label photo", cart_screenshot: "Cart" };
  return (
    <>
      <PageTitle title="Recent scans" />
      {!items.length ? <Empty title="Nothing here yet" body="Products you scan or open will appear here." cta={{ label: "Scan a product", href: "/scan" }} /> :
        Object.entries(groups).filter(([, v]) => v.length).map(([g, v]) => (<section key={g} className="mb-5"><h2 className="mb-2 text-sm font-bold text-slate2">{g}</h2><div className="space-y-3">{v.map((i, n) => <ProductCard key={i.id + n} item={{ ...i, sub: label[i.method] }} />)}</div></section>))}
    </>
  );
}
