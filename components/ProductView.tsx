"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, GitCompare, ShieldAlert, ShieldCheck, ShieldQuestion, Info, Package, ExternalLink, Plus } from "lucide-react";
import ScoreGauge from "./ScoreGauge";
import NutrientRow from "./NutrientRow";
import ConfidenceBadge from "./ConfidenceBadge";
import VegMark from "./VegMark";
import ProductTile from "./ProductTile";
import { Loading, ErrorBox } from "./States";
import { api, addToTray, ApiError } from "@/lib/client";
import { classifyAll, REFERENCE_SOURCES } from "@/lib/levels";
import { NUTRIENT_META, formatNutrient } from "@/lib/nutrition";
import { NUTRIENT_KEYS, type CountryStatus, type Product, type ProductAnalysis, type AllergenLevel, type NutrientKey } from "@/lib/types";
import type { ProductCardData } from "@/lib/search";

type Full = { product: Product & { id: string }; analysis: ProductAnalysis; origin: string; saved: boolean };
type AltResp = { alternatives: { id: string; product: Product & { id: string }; score: number | null; reasons: string[] }[]; candidateCount: number };
type SimResp = { items: (ProductCardData & { why: string[] })[] };

const LEVEL: Record<AllergenLevel, { label: string; cls: string }> = {
  contains: { label: "Contains", cls: "bg-chilli text-white" }, derived: { label: "Derived from", cls: "bg-[#E0702B] text-white" },
  may_contain: { label: "May contain", cls: "bg-turmeric text-ink" }, unknown: { label: "Unknown source", cls: "bg-slate2/20 text-ink" },
};
const ROW_ORDER: NutrientKey[] = ["calories", "protein", "carbohydrates", "sugars", "addedSugars", "fat", "saturatedFat", "transFat", "fiber", "sodium", "cholesterol"];
const ALWAYS: NutrientKey[] = ["calories", "protein", "carbohydrates", "sugars", "fat", "saturatedFat", "fiber", "sodium"];
const SOURCE_LABEL: Record<string, string> = { openfoodfacts: "Open Food Facts", dataset: "Indian packaged-food dataset", gemini: "AI label reading (confirmed by a user)", ocr: "Label photo (text reader)", manual: "Entered by a user", ai: "AI" };

export default function ProductView({ id, via }: { id: string; via?: string }) {
  const router = useRouter();
  const [data, setData] = useState<Full | null>(null); const [error, setError] = useState<ApiError | null>(null);
  const [alts, setAlts] = useState<AltResp | null>(null); const [sim, setSim] = useState<SimResp | null>(null); const [saved, setSaved] = useState(false);
  const [basis, setBasis] = useState<"per100" | "perServing">("per100");

  useEffect(() => {
    let live = true;
    api<Full>(`/api/products/${id}${via ? `?method=${via}` : ""}`).then((d) => {
      if (!live) return; setData(d); setSaved(d.saved);
      api<AltResp>(`/api/alternatives/${d.product.id}`).then((a) => live && setAlts(a)).catch(() => undefined);
      api<SimResp>(`/api/compare/suggest?id=${d.product.id}`).then((a) => live && setSim(a)).catch(() => undefined);
    }).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [id, via]);

  if (error) return <ErrorBox message={error.message} action={error.code === "not_found" ? { label: "Add from label photo", href: `/ocr?barcode=${id}` } : { label: "Back to search", href: "/search" }} />;
  if (!data) return <Loading label="Analysing product" />;
  const { product: p, analysis: a } = data;
  const unit = p.nutritionBasis.unit; const per = `100 ${unit}`;
  const levels = classifyAll(p.nutrition, unit);
  const rows = ROW_ORDER.filter((k) => ALWAYS.includes(k) || p.nutrition[k] != null);
  const ps = p.nutritionPerServing; const hasPS = Boolean(ps && Object.keys(ps).length && p.servingSize);
  const buy = Object.entries(p.purchaseLinks ?? {}).filter(([, v]) => Boolean(v));

  async function toggleSave() {
    const next = !saved; setSaved(next);
    try { await api(next ? "/api/saved" : `/api/saved?productId=${p.id}`, next ? { method: "POST", body: JSON.stringify({ productId: p.id }) } : { method: "DELETE" }); } catch { setSaved(!next); }
  }
  function compareWith(otherId: string) { addToTray(p.id); addToTray(otherId); router.push("/compare"); }

  return (
    <div className="space-y-4 pb-4">
      {/* 1. PRODUCT INFORMATION */}
      <section className="card">
        <div className="flex gap-3">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt={`${p.brand ?? ""} ${p.name}`.trim()} className="h-28 w-28 shrink-0 rounded-2xl bg-white object-contain p-1 ring-1 ring-ink/5" />
          ) : <div className="grid h-28 w-28 shrink-0 place-items-center rounded-2xl bg-mint"><Package className="text-leaf/50" size={36} aria-hidden /></div>}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate2">{p.categoryPath?.join(" › ") ?? p.category}</p>
            <h1 className="text-[22px] font-extrabold leading-tight">{p.name}</h1>
            <p className="text-sm text-slate2">{[p.brand, p.quantity ? `${p.quantity.value >= 1000 ? p.quantity.value / 1000 : p.quantity.value} ${p.quantity.value >= 1000 ? (p.quantity.unit === "g" ? "kg" : "L") : p.quantity.unit}` : null, p.price ? `₹${p.price.value}` : null].filter(Boolean).join(" · ")}</p>
            <div className="mt-1.5 flex items-center gap-2"><VegMark veg={p.dietary?.vegetarian} />{p.barcode && <span className="text-xs text-slate2">Barcode {p.barcode}</span>}</div>
          </div>
        </div>
        {p.catalogStatus && p.catalogStatus !== "active" && <p className="mt-3 flex gap-2 rounded-2xl bg-turmeric/15 p-3 text-xs"><Info size={16} className="shrink-0" />This product is not in the main Grocerly catalogue yet (incomplete or unverified data), so it will not appear in search results.</p>}
      </section>

      {/* 2. GROCERLY ANALYSIS */}
      <section className="card">
        <h2 className="text-lg font-bold">Grocerly analysis</h2>
        <ScoreGauge score={a.score} band={a.band} />
        {a.score == null && <p className="mt-3 text-sm">{a.reasons[0]}</p>}
        {a.score != null && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-2xl bg-paper p-2"><p className="text-xs text-slate2">Nutrition score</p><p className="font-display text-xl font-extrabold">{a.nutritionScore ?? "–"}</p></div><div className="rounded-2xl bg-paper p-2"><p className="text-xs text-slate2">Ingredient score</p><p className="font-display text-xl font-extrabold">{a.ingredientScore}</p></div></div>
            {a.positives.length > 0 && <ReasonList title="What helps" tone="text-leaf" items={a.positives.map((x) => ({ t: x.label, d: x.detail, pts: `+${x.points}` }))} />}
            {a.penalties.length > 0 && <ReasonList title="What lowers it" tone="text-chilli" items={a.penalties.map((x) => ({ t: x.label, d: x.detail, pts: `${x.points}` }))} />}
            {a.missing.length > 0 && <p className="flex gap-2 rounded-2xl bg-paper p-3 text-xs text-slate2"><Info size={16} className="shrink-0" />Not scored because the data is missing: {a.missing.join(", ")}. Missing values are never treated as zero.</p>}
            <p className="text-[11px] text-slate2">Scoring v{a.scoreVersion} · {a.profile.replace("_", " ")} profile · calculated by fixed rules, never by AI.</p>
          </div>
        )}
      </section>

      {/* 3. NUTRITION */}
      <section className="card" aria-labelledby="nut-h">
        <div className="flex items-start justify-between gap-2"><h2 id="nut-h" className="text-lg font-bold">Nutrition</h2><ConfidenceBadge level={p.confidence?.nutrition} compact /></div>
        {hasPS && (
          <div role="tablist" aria-label="Nutrition basis" className="mt-3 grid grid-cols-2 rounded-full bg-paper p-1 text-sm font-semibold">
            {(["per100", "perServing"] as const).map((b) => <button key={b} role="tab" aria-selected={basis === b} onClick={() => setBasis(b)} className={`min-h-[40px] rounded-full ${basis === b ? "bg-white shadow" : "text-slate2"}`}>{b === "per100" ? `Per ${per}` : `Per serving (${p.servingSize!.value} ${p.servingSize!.unit})`}</button>)}
          </div>
        )}
        {basis === "per100" || !hasPS ? (
          <div className="mt-2">{rows.map((k) => <NutrientRow key={k} nutrientKey={k} value={p.nutrition[k]} level={levels[k] ?? null} basis={per} />)}</div>
        ) : (
          <div className="mt-2">
            <p className="rounded-2xl bg-paper p-3 text-xs text-slate2">These are the amounts in one serving ({p.servingSize!.value} {p.servingSize!.unit}). LOW / MODERATE / HIGH labels are only given per {per}, so different products can be compared fairly.</p>
            {ROW_ORDER.filter((k) => ps![k] != null).map((k) => <div key={k} className="flex items-center justify-between border-t border-ink/10 py-3 first:border-0"><span className="font-semibold">{NUTRIENT_META[k].label}</span><span className="font-display text-lg font-extrabold">{formatNutrient(k, ps![k])} <span className="text-xs font-medium text-slate2">/ serving</span></span></div>)}
          </div>
        )}
        <details className="mt-3 text-xs text-slate2"><summary className="cursor-pointer font-semibold">Where do these reference thresholds come from?</summary>
          <ul className="mt-2 space-y-1">{REFERENCE_SOURCES.map((r) => <li key={r.name}><b>{r.name}:</b> {r.note}</li>)}</ul>
          <p className="mt-2">These are Grocerly reference thresholds for comparing products. They are not medical advice and not a legal standard.</p></details>
        {NUTRIENT_KEYS.every((k) => p.nutrition[k] == null) && <p className="mt-2 text-sm text-slate2">No nutrition values are available for this product yet. <Link href={`/ocr${p.barcode ? `?barcode=${p.barcode}` : ""}`} className="font-semibold text-leaf">Add them from the label</Link>.</p>}
      </section>

      {/* 4. INGREDIENTS */}
      <section className="card">
        <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-bold">Ingredients</h2><ConfidenceBadge level={p.confidence?.ingredients} compact /></div>
        {a.ingredientInsights.length === 0 ? <p className="mt-2 text-sm text-slate2">No ingredient list available.</p> : (
          <>
            {p.ingredientsText && <p className="mt-2 text-sm leading-relaxed">{p.ingredientsText}</p>}
            {a.ingredientInsights.some((i) => i.source === "knowledge_base" && i.riskLevel !== "none") && (
              <div className="mt-3 rounded-2xl bg-turmeric/10 p-3"><p className="text-sm font-bold">Worth a look</p>
                <ul className="mt-1 space-y-2">{a.ingredientInsights.filter((i) => i.source === "knowledge_base" && i.riskLevel !== "none").map((i) => (
                  <li key={i.name}><span className="font-semibold capitalize">{i.name}</span> <span className={`chip ml-1 ${i.riskLevel === "high" ? "bg-chilli text-white" : i.riskLevel === "moderate" ? "bg-turmeric text-ink" : "bg-mint text-leaf-dark"}`}>{i.riskLevel} caution</span><p className="text-xs text-slate2">{i.explanation}</p></li>))}</ul></div>
            )}
            <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-leaf">All ingredients explained</summary>
              <ul className="mt-2 divide-y divide-ink/10">{a.ingredientInsights.map((i) => (
                <li key={i.name} className="py-2"><div className="flex items-center justify-between gap-2"><span className="font-semibold capitalize">{i.name}</span>{i.source === "ai" && <span className="chip bg-slate2/15">AI note</span>}</div>
                  {i.source !== "unclassified" && <p className="text-sm text-slate2">{i.explanation}{i.source === "ai" ? " (AI-generated, not used in the score)" : ""}</p>}</li>))}</ul></details>
          </>
        )}
      </section>

      {/* 5. ALLERGENS */}
      <section className="card">
        <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-bold">Allergens</h2><ConfidenceBadge level={p.confidence?.allergens} compact /></div>
        {!a.allergenReport.known ? <p className="mt-2 text-sm text-slate2">Unknown. No ingredient list or allergen declaration is available for this product.</p>
          : a.allergenReport.findings.length === 0 ? <p className="mt-2 text-sm">No allergens found in the ingredient list or label declarations. Always check the pack.</p>
          : <ul className="mt-3 space-y-2">{a.allergenReport.findings.map((f) => (
              <li key={f.allergen} className="flex items-start gap-2"><span className={`chip shrink-0 ${LEVEL[f.level].cls}`}>{LEVEL[f.level].label}</span><span className="text-sm"><b className="capitalize">{f.allergen}</b><br /><span className="text-slate2">{f.evidence[0]}</span></span></li>))}</ul>}
      </section>

      <Regulations items={a.regulatory} />

      {/* 6. SIMILAR PRODUCTS */}
      <section className="card">
        <h2 className="text-lg font-bold">Compare with similar products</h2>
        {!sim ? <p className="mt-2 text-sm text-slate2">Finding comparable products…</p> : sim.items.length === 0 ? <p className="mt-2 text-sm text-slate2">No comparable products with enough nutrition data in the catalogue yet.</p> : (
          <>
            <p className="mt-1 text-xs text-slate2">Same type or category, different brands first.</p>
            <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
              {sim.items.slice(0, 6).map((s) => (
                <li key={s.id} className="w-44 shrink-0 snap-start"><ProductTile item={s} action={<button onClick={() => compareWith(s.id)} className="btn-ghost mt-2 !min-h-[40px] w-full text-sm"><GitCompare size={16} />Compare</button>} />
                  {s.why[0] && <p className="mt-1 px-1 text-[11px] text-slate2">{s.why[0]}</p>}</li>))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Better alternatives</h2>{alts && alts.alternatives.length > 0 && <Link href={`/alternatives/${p.id}`} className="text-sm font-semibold text-leaf">Tune priorities</Link>}</div>
        {!alts ? <p className="mt-2 text-sm text-slate2">Looking for similar products…</p> : alts.alternatives.length === 0 ? <p className="mt-2 text-sm text-slate2">No better product found among {alts.candidateCount} similar items in Grocerly yet.</p> : (
          <ul className="mt-3 space-y-3">{alts.alternatives.slice(0, 3).map((x) => (
            <li key={x.id}><Link href={`/product/${x.id}`} className="block rounded-2xl bg-paper p-3"><div className="flex justify-between gap-2"><b>{x.product.name}</b><span className="font-display font-extrabold">{x.score ?? "–"}</span></div>
              <p className="mt-1 text-xs text-slate2">Recommended because: {x.reasons.join(" · ") || "better overall balance for your priorities"}</p></Link></li>))}</ul>
        )}
      </section>

      {/* 7. PURCHASE */}
      {buy.length > 0 && (
        <section className="card"><h2 className="text-lg font-bold">Where to buy</h2><p className="text-xs text-slate2">Optional links to the retailers' own pages. Grocerly is not affiliated with them.</p>
          <div className="mt-3 flex flex-wrap gap-2">{buy.map(([r, url]) => <a key={r} href={url as string} target="_blank" rel="noopener noreferrer nofollow" className="btn-outline capitalize">{r}<ExternalLink size={15} /></a>)}</div></section>
      )}

      {/* 8. SOURCES */}
      <section className="card text-xs text-slate2">
        <h2 className="text-base font-bold text-ink">Data sources</h2>
        <ul className="mt-2 space-y-1.5">{(p.sources?.length ? p.sources : [{ source: p.source.type, confidence: p.source.confidence, url: p.source.url } as never]).map((s: { source: string; name?: string; confidence: number; url?: string; license?: string }, i: number) => (
          <li key={i}><b className="text-ink">{s.name ?? SOURCE_LABEL[s.source] ?? s.source}</b> · confidence {Math.round(s.confidence * 100)}%{s.license ? ` · ${s.license}` : ""} {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-leaf underline">Open</a>}</li>))}</ul>
        {p.sources?.some((s) => s.source === "openfoodfacts") && <p className="mt-2">Contains data from Open Food Facts contributors, available under the Open Database License (ODbL). Product photos are licensed CC BY-SA.</p>}
        {p.sources?.some((s) => s.source === "dataset") && <p className="mt-1">Includes data from the “Indian Packaged Foods Nutritional Composition Dataset (2026)”, Mendeley Data, CC BY 4.0.</p>}
        <Link href={`/ocr${p.barcode ? `?barcode=${p.barcode}` : ""}`} className="mt-3 inline-flex items-center gap-1 font-semibold text-leaf"><Plus size={14} />Something wrong or missing? Add the label</Link>
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
