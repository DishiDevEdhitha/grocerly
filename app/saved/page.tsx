"use client";
import { useEffect, useState } from "react";
import ProductCard, { type CardItem } from "@/components/ProductCard";
import { PageTitle, Loading, ErrorBox, Empty } from "@/components/States";
import { api } from "@/lib/client";
import { Trash2 } from "lucide-react";

export default function SavedPage() {
  const [items, setItems] = useState<CardItem[] | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ items: CardItem[] }>("/api/saved").then((d) => setItems(d.items)).catch((e) => setError(e.message)); }, []);
  async function remove(id: string) { setItems((x) => x?.filter((i) => i.id !== id) ?? null); await api(`/api/saved?productId=${id}`, { method: "DELETE" }).catch(() => undefined); }
  if (error) return <ErrorBox message={error} />;
  if (!items) return <Loading />;
  return (
    <>
      <PageTitle title="Saved products" />
      {!items.length ? <Empty title="No saved products" body="Tap Save on a product to keep it here." cta={{ label: "Search products", href: "/search" }} /> :
        <div className="space-y-3">{items.map((i) => <div key={i.id} className="flex items-center gap-2"><div className="min-w-0 flex-1"><ProductCard item={i} /></div><button onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`} className="btn-outline !min-h-[48px] !px-3"><Trash2 size={18} /></button></div>)}</div>}
    </>
  );
}
