"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageTitle, Loading, ErrorBox, Empty } from "@/components/States";
import CompareTable, { type CompareItem } from "@/components/CompareTable";
import { api, getTray, removeFromTray } from "@/lib/client";
import type { MetricKey } from "@/lib/alternatives";

export default function ComparePage() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [data, setData] = useState<{ items: CompareItem[]; winners: Partial<Record<MetricKey, string[]>> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setIds(getTray()); }, []);
  useEffect(() => {
    if (!ids || ids.length < 2) { setData(null); return; }
    api<typeof data>(`/api/compare?ids=${ids.join(",")}`).then(setData).catch((e) => setError(e.message));
  }, [ids]);
  if (!ids) return <Loading />;
  return (
    <>
      <PageTitle title="Compare" sub="Best value in each row is marked." />
      {error && <ErrorBox message={error} />}
      {ids.length < 2 ? <Empty title="Pick two or more products" body="Open a product and tap Compare to add it here." cta={{ label: "Search products", href: "/search" }} /> : !data ? <Loading label="Comparing" /> : (
        <>
          <CompareTable items={data.items} winners={data.winners} onRemove={(id) => setIds(removeFromTray(id))} />
          <Link href="/search" className="btn-ghost mt-4 w-full">Add another product</Link>
        </>
      )}
    </>
  );
}
