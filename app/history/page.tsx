"use client";
import { useEffect, useState } from "react";
import ProductRow from "@/components/ProductRow";
import { PageTitle, Loading, ErrorBox, Empty } from "@/components/States";
import { api } from "@/lib/client";

type H = { id: string; name: string; brand?: string; image?: string; score: number | null; scannedAt: string; method: string };
const FILTERS = [{ key: "all", label: "All" }, { key: "scanned", label: "Scanned" }, { key: "searched", label: "Searched" }, { key: "analyzed", label: "Analyzed" }] as const;
const kind = (m: string) => (m === "barcode" ? "scanned" : m === "search" ? "searched" : "analyzed");
const LABEL: Record<string, string> = { scanned: "Scanned", searched: "Searched", analyzed: "Analyzed" };
const dayKey = (d: Date) => d.toDateString();

export default function HistoryPage() {
  const [items, setItems] = useState<H[] | null>(null); const [error, setError] = useState<string | null>(null); const [f, setF] = useState<(typeof FILTERS)[number]["key"]>("all");
  useEffect(() => { api<{ items: H[] }>("/api/history").then((d) => setItems(d.items)).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!items) return <Loading />;
  const list = items.filter((i) => f === "all" || kind(i.method) === f);
  const today = dayKey(new Date()), yest = dayKey(new Date(Date.now() - 864e5));
  const groups: Record<string, H[]> = { Today: [], Yesterday: [], Older: [] };
  for (const i of list) { const k = dayKey(new Date(i.scannedAt)); (k === today ? groups.Today : k === yest ? groups.Yesterday : groups.Older).push(i); }
  const time = (s: string) => new Date(s).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <>
      <PageTitle title="Scan History" />
      <div role="tablist" aria-label="Filter history" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">{FILTERS.map((x) => <button key={x.key} role="tab" aria-selected={f === x.key} onClick={() => setF(x.key)} className={`min-h-[34px] shrink-0 rounded-full px-4 text-[12.5px] font-semibold ${f === x.key ? "bg-leaf text-white" : "bg-white text-ink ring-1 ring-ink/10"}`}>{x.label}</button>)}</div>
      <div className="mt-3">
        {!list.length ? <Empty title="Nothing here yet" body="Products you scan, search or analyse will appear here." cta={{ label: "Scan a product", href: "/scan" }} /> :
          Object.entries(groups).filter(([, v]) => v.length).map(([g, v]) => (<section key={g} className="mb-4"><h2 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate2">{g}</h2><div className="space-y-2">{v.map((i, n) => <ProductRow key={i.id + n} item={{ ...i, sub: `${LABEL[kind(i.method)]} · ${time(i.scannedAt)}` }} />)}</div></section>))}
      </div>
    </>
  );
}
