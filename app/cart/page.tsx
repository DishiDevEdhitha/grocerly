"use client";
import { useState } from "react";
import Link from "next/link";
import { Camera, Loader2 } from "lucide-react";
import { PageTitle, ErrorBox } from "@/components/States";
import { api } from "@/lib/client";
import { runOcr } from "@/lib/ocr-client";

interface Item { query: string; matched: boolean; product?: { id: string; name: string }; score?: number | null; warnings?: string[]; alternativeAvailable?: boolean }
interface Report { items: Item[]; analyzed: number; unmatched: number; averageScore: number | null; highSodium: number; highSugar: number; highSatFat: number }

export default function CartPage() {
  const [step, setStep] = useState<"idle" | "ocr" | "analysing">("idle"); const [p, setP] = useState(0);
  const [error, setError] = useState<string | null>(null); const [report, setReport] = useState<Report | null>(null);
  async function onFile(f?: File) {
    if (!f) return; setError(null); setReport(null); setStep("ocr");
    try {
      const lines = await runOcr(f, setP); setStep("analysing");
      setReport(await api<Report>("/api/cart", { method: "POST", body: JSON.stringify({ lines: lines.map((l) => l.text) }) }));
    } catch (e) { setError((e as Error).message); } finally { setStep("idle"); }
  }
  return (
    <>
      <PageTitle title="Analyze your cart" sub="Upload a screenshot from any grocery app. We match each item and score it." />
      <label className="card flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 text-center font-semibold focus-within:ring-2 focus-within:ring-turmeric">
        {step === "idle" ? <><Camera /><span>Choose cart screenshot</span></> : <><Loader2 className="animate-spin" /><span className="text-sm">{step === "ocr" ? `Reading screenshot ${Math.round(p * 100)}%` : "Matching products (this can take a few seconds)"}</span></>}
        <input type="file" accept="image/*" className="sr-only" disabled={step !== "idle"} onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}
      {report && (
        <div className="mt-4 space-y-3">
          <section className="card"><h2 className="text-lg font-bold">Your basket</h2>
            <p className="mt-1 text-sm">{report.analyzed} product{report.analyzed === 1 ? "" : "s"} analysed{report.unmatched ? `, ${report.unmatched} not found` : ""}</p>
            <p className="mt-3 font-display text-5xl font-extrabold">{report.averageScore ?? "–"}<span className="ml-2 text-base font-medium text-slate2">average score</span></p>
            <ul className="mt-3 space-y-1 text-sm">{report.highSodium > 0 && <li>{report.highSodium} high in sodium</li>}{report.highSugar > 0 && <li>{report.highSugar} high in sugar</li>}{report.highSatFat > 0 && <li>{report.highSatFat} high in saturated fat</li>}</ul>
            {report.items.some((i) => i.alternativeAvailable) && <p className="mt-3 text-sm font-semibold">Better alternatives available for: {report.items.filter((i) => i.alternativeAvailable).map((i) => i.product?.name).join(", ")}</p>}</section>
          {report.items.map((i) => i.matched && i.product ? (
            <Link key={i.query} href={`/product/${i.product.id}?via=cart_screenshot`} className="card flex items-center justify-between gap-3"><span><b>{i.product.name}</b><br /><span className="text-xs text-slate2">Matched from “{i.query}”</span></span><span className="font-display text-2xl font-extrabold">{i.score ?? "–"}</span></Link>
          ) : <div key={i.query} className="card text-sm text-slate2">No match for “{i.query}”. <Link className="font-semibold text-leaf" href="/search">Search manually</Link></div>)}
        </div>
      )}
    </>
  );
}
