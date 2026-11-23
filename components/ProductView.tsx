"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, GitCompare, ShieldAlert, ShieldCheck, ShieldQuestion, Info } from "lucide-react";
import ScoreGauge from "./ScoreGauge";
import NutritionGrid from "./NutritionGrid";
import { Loading, ErrorBox } from "./States";
import { api, addToTray, ApiError } from "@/lib/client";
import type { CountryStatus, Product, ProductAnalysis, AllergenLevel } from "@/lib/types";

type Full = { product: Product & { id: string }; analysis: ProductAnalysis; origin: string; saved: boolean };
type AltResp = { alternatives: { id: string; product: Product & { id: string }; score: number | null; reasons: string[] }[]; candidateCount: number };

const LEVEL: Record<AllergenLevel, { label: string; cls: string }> = {
  contains: { label: "Contains", cls: "bg-chilli text-white" }, derived: { label: "Derived from", cls: "bg-[#E0702B] text-white" },
  may_contain: { label: "May contain", cls: "bg-turmeric text-ink" }, unknown: { label: "Unknown source", cls: "bg-slate2/20 text-ink" },
};

export default function ProductView({ id, via }: { id: string; via?: string }) {
  const router = useRouter();
  const [data, setData] = useState<Full | null>(null); const [error, setError] = useState<ApiError | null>(null);
  const [alts, setAlts] = useState<AltResp | null>(null); const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    api<Full>(`/api/products/${id}${via ? `?method=${via}` : ""}`).then((d) => { if (!live) return; setData(d); setSaved(d.saved); api<AltResp>(`/api/alternatives/${d.product.id}`).then((a) => live && setAlts(a)).catch(() => undefined); }).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [id, via]);

  if (error) return <ErrorBox message={error.message} action={error.code === "not_found" ? { label: "Add from label photo", href: `/ocr?barcode=${id}` } : { label: "Back to search", href: "/search" }} />;
  if (!data) return <Loading label="Analysing product" />;
  const { product: p, analysis: a } = data;

  async function toggleSave() {
    const next = !saved; setSaved(next);
    try { await api(next ? "/api/saved" : `/api/saved?productId=${p.id}`, next ? { method: "POST", body: JSON.stringify({ productId: p.id }) } : { method: "DELETE" }); } catch { setSaved(!next); }
  }

  return (
    <div className="space-y-4 pb-4">
      <section className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.images?.front ? <img src={p.images.front} alt={p.name} className="h-24 w-24 shrink-0 rounded-tile bg-white object-contain p-1" /> : <div className="h-24 w-24 shrink-0 rounded-tile bg-mint" aria-hidden />}
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight">{p.name}</h1>
          <p className="text-sm text-slate2">{[p.brand, p.quantity ? `${p.quantity.value} ${p.quantity.unit}` : null, p.price ? `₹${p.price.value}` : null].filter(Boolean).join(" · ") || p.category}</p>
          <p className="mt-1 text-xs text-slate2">{p.source.type === "openfoodfacts" ? "Data: Open Food Facts" : p.source.type === "ocr" ? "Data: read from label photo" : "Data: entered manually"}{data.origin === "openfoodfacts" ? " · just added to Grocerly" : ""}</p>
        </div>
      </section>

      <section className="card">
        <ScoreGauge score={a.score} band={a.band} />
        {a.score == null && <p className="mt-3 text-sm">{a.reasons[0]}</p>}
        {a.score != null && (
          <div className="mt-4 space-y-3">
            {a.positives.length > 0 && <ReasonList title="What helps" tone="text-leaf" items={a.positives.map((x) => ({ t: x.label, d: x.detail, pts: `+${x.points}` }))} />}
            {a.penalties.length > 0 && <ReasonList title="What lowers it" tone="text-chilli" items={a.penalties.map((x) => ({ t: x.label, d: x.detail, pts: `${x.points}` }))} />}
            {a.missing.length > 0 && <p className="flex gap-2 rounded-2xl bg-paper p-3 text-xs text-slate2"><Info size={16} className="shrink-0" />Not scored because the data is missing: {a.missing.join(", ")}. Missing values are never treated as zero.</p>}
            <p className="text-[11px] text-slate2">Scoring v{a.scoreVersion} · {a.profile.replace("_", " ")} profile · computed by fixed rules, not by AI.</p>
          </div>
        )}
      </section>

      <NutritionGrid nutrition={p.nutrition} meta={p.nutritionMeta} basis={`100 ${p.nutritionBasis.unit}`} />

      <section className="card">
        <h2 className="text-lg font-bold">Allergens</h2>
        {!a.allergenReport.known ? <p className="mt-2 text-sm text-slate2">Unknown. No ingredient list or allergen declaration is available for this product.</p>
          : a.allergenReport.findings.length === 0 ? <p className="mt-2 text-sm">No allergens found in the ingredient list or label declarations. Always check the pack.</p>
          : <ul className="mt-3 space-y-2">{a.allergenReport.findings.map((f) => (
              <li key={f.allergen} className="flex items-start gap-2"><span className={`chip shrink-0 ${LEVEL[f.level].cls}`}>{LEVEL[f.level].label}</span><span className="text-sm"><b className="capitalize">{f.allergen}</b><br /><span className="text-slate2">{f.evidence[0]}</span></span></li>))}</ul>}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">Ingredients</h2>
        {a.ingredientInsights.length === 0 ? <p className="mt-2 text-sm text-slate2">No ingredient list available.</p> : (
          <ul className="mt-3 divide-y divide-ink/10">
            {a.ingredientInsights.map((i) => (
              <li key={i.name} className="py-2"><div className="flex items-center justify-between gap-2"><span className="font-semibold capitalize">{i.name}</span>
                {i.source === "knowledge_base" && i.riskLevel !== "none" && <span className={`chip ${i.riskLevel === "high" ? "bg-chilli text-white" : i.riskLevel === "moderate" ? "bg-turmeric text-ink" : "bg-mint text-leaf-dark"}`}>{i.riskLevel} caution</span>}
                {i.source === "ai" && <span className="chip bg-slate2/15">AI note</span>}</div>
                {i.source !== "unclassified" && <p className="text-sm text-slate2">{i.explanation}{i.source === "ai" ? " (AI-generated, not used in the score)" : ""}</p>}</li>
            ))}
          </ul>
        )}
      </section>

      <Regulations items={a.regulatory} />

      <section className="card">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Better alternatives</h2>{alts && alts.alternatives.length > 0 && <Link href={`/alternatives/${p.id}`} className="text-sm font-semibold text-leaf">Tune priorities</Link>}</div>
        {!alts ? <p className="mt-2 text-sm text-slate2">Looking for similar products…</p> : alts.alternatives.length === 0 ? <p className="mt-2 text-sm text-slate2">No better product found among {alts.candidateCount} similar items in Grocerly yet. Search for more products in this category to grow the list.</p> : (
          <ul className="mt-3 space-y-3">{alts.alternatives.slice(0, 3).map((x) => (
            <li key={x.id}><Link href={`/product/${x.id}`} className="block rounded-2xl bg-paper p-3"><div className="flex justify-between gap-2"><b>{x.product.name}</b><span className="font-display font-extrabold">{x.score ?? "–"}</span></div>
              <p className="mt-1 text-xs text-slate2">Recommended because: {x.reasons.join(" · ") || "better overall balance for your priorities"}</p></Link></li>))}</ul>
        )}
      </section>

      <div className="sticky bottom-[76px] z-10 grid grid-cols-2 gap-2 rounded-full bg-paper/90 py-2 backdrop-blur">
        <button onClick={() => { addToTray(p.id); router.push("/compare"); }} className="btn-ghost"><GitCompare size={18} />Compare</button>
        <button onClick={toggleSave} aria-pressed={saved} className={saved ? "btn-primary" : "btn-outline"}>{saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}{saved ? "Saved" : "Save"}</button>
      </div>
    </div>
  );
}

function ReasonList({ title, tone, items }: { title: string; tone: string; items: { t: string; d: string; pts: string }[] }) {
  return (<div><h3 className={`text-sm font-bold ${tone}`}>{title}</h3><ul className="mt-1 space-y-1.5">{items.map((i) => (
    <li key={i.t} className="flex items-start justify-between gap-3 text-sm"><span><b>{i.t}</b><br /><span className="text-xs text-slate2">{i.d}</span></span><span className={`shrink-0 font-bold ${tone}`}>{i.pts}</span></li>))}</ul></div>);
}

function Regulations({ items }: { items: CountryStatus[] }) {
  const icon = (s: string) => s === "banned" ? <ShieldAlert className="text-chilli" size={20} /> : s === "restricted" ? <ShieldAlert className="text-turmeric" size={20} /> : s === "allowed" ? <ShieldCheck className="text-leaf" size={20} /> : <ShieldQuestion className="text-slate2" size={20} />;
  return (
    <section className="card">
      <h2 className="text-lg font-bold">Country status</h2>
      <ul className="mt-3 space-y-3">{items.map((c) => (
        <li key={c.country}><div className="flex items-center gap-2">{icon(c.status)}<b>{c.countryName}</b><span className="ml-auto text-sm font-semibold capitalize">{c.status}</span></div>
          <p className="ml-7 text-sm text-slate2">{c.summary}</p>
          {c.details.map((d) => (<div key={d.ingredient + d.authority} className="ml-7 mt-1 rounded-xl bg-paper p-2 text-xs"><b className="capitalize">{d.ingredient}</b>: {d.reason}<br />Authority: {d.authority} · <a className="font-semibold text-leaf underline" href={d.sourceUrl} target="_blank" rel="noreferrer">Source</a> · {d.verifiedAt ? `Verified ${d.verifiedAt.slice(0, 10)}` : "Seed entry, not yet independently verified"}</div>))}</li>))}</ul>
      <p className="mt-3 text-[11px] text-slate2">Grocerly only reports verified or clearly sourced rules. Anything else is Unknown, never assumed allowed.</p>
    </section>
  );
}
