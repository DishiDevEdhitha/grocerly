"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { PageTitle, ErrorBox } from "@/components/States";
import OcrField from "@/components/OcrField";
import { api } from "@/lib/client";
import { runOcr } from "@/lib/ocr-client";
import { NUTRIENT_META } from "@/lib/nutrition";
import { NUTRIENT_KEYS, type NutrientKey } from "@/lib/types";
import type { NutritionExtraction } from "@/lib/nutrition";

type Vals = Partial<Record<NutrientKey, { value: string; confidence?: number; note?: string }>>;

function OcrFlow() {
  const router = useRouter(); const barcodeParam = useSearchParams().get("barcode") ?? "";
  const [submissionId] = useState(() => crypto.randomUUID());
  const [progress, setProgress] = useState<{ kind: string; p: number } | null>(null);
  const [error, setError] = useState<string | null>(null); const [warnings, setWarnings] = useState<string[]>([]);
  const [vals, setVals] = useState<Vals>({}); const [ingredients, setIngredients] = useState("");
  const [name, setName] = useState(""); const [brand, setBrand] = useState(""); const [barcode, setBarcode] = useState(barcodeParam);
  const [category, setCategory] = useState(""); const [price, setPrice] = useState(""); const [unit, setUnit] = useState<"g" | "ml">("g");
  const [serving, setServing] = useState(""); const [basis, setBasis] = useState<NutritionExtraction["basis"] | null>(null);
  const [saving, setSaving] = useState(false);

  async function onFile(kind: "ingredients" | "nutrition", file?: File) {
    if (!file) return; setError(null); setProgress({ kind, p: 0 });
    try {
      const lines = await runOcr(file, (p) => setProgress({ kind, p }));
      const res = await api<any>("/api/ocr/parse", { method: "POST", body: JSON.stringify({ kind, lines, submissionId, barcode: barcode || null }) });
      if (kind === "ingredients") { setIngredients(res.ingredientsText); setWarnings((w) => [...new Set([...w, ...res.warnings])]); }
      else {
        const ex: NutritionExtraction = res.extraction; const next: Vals = {};
        for (const k of NUTRIENT_KEYS) { const f = ex.fields[k]; if (f) next[k] = { value: String(f.value), confidence: f.confidence, note: f.note }; }
        setVals(next); setBasis(ex.basis); setUnit(ex.basis.unit); setWarnings((w) => [...new Set([...w, ...ex.warnings])]);
        if (ex.basis.servingSize) setServing(String(ex.basis.servingSize));
      }
    } catch (e) { setError((e as Error).message); } finally { setProgress(null); }
  }

  async function submit() {
    setSaving(true); setError(null);
    try {
      let factor = 1;
      if (basis?.kind === "perServing" && !basis.servingSize && Number(serving) > 0) factor = 100 / Number(serving);
      const nutrition: Record<string, number> = {}; const nutritionMeta: Record<string, unknown> = {};
      for (const k of NUTRIENT_KEYS) { const v = vals[k]; if (v && v.value !== "" && Number.isFinite(Number(v.value))) { nutrition[k] = Number(v.value) * factor; nutritionMeta[k] = { confidence: v.confidence ?? 1, source: v.confidence != null ? "ocr" : "manual" }; } }
      const r = await api<{ product: { id: string } }>("/api/products/submit", { method: "POST", body: JSON.stringify({ submissionId, name, brand, barcode: barcode || undefined, category, price: price ? Number(price) : undefined, basisUnit: unit, nutrition, nutritionMeta, ingredientsText: ingredients }) });
      router.push(`/product/${r.product.id}?via=ocr`);
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  const needsServing = basis?.kind === "perServing" && !basis.servingSize;
  const blocked = basis?.kind === "unknown" && Object.keys(vals).length > 0;
  return (
    <>
      <PageTitle title="Add from label" sub="Photos are read on your phone. Only the text is sent to Grocerly." />
      <div className="grid grid-cols-2 gap-3">
        {(["nutrition", "ingredients"] as const).map((k) => (
          <label key={k} className="card flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 text-center font-semibold focus-within:ring-2 focus-within:ring-turmeric">
            {progress?.kind === k ? <><Loader2 className="animate-spin" /><span className="text-sm">Reading {Math.round(progress.p * 100)}%</span></> : <><Camera /><span>{k === "nutrition" ? "Nutrition label" : "Ingredient list"}</span></>}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(k, e.target.files?.[0])} disabled={Boolean(progress)} />
          </label>))}
      </div>
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}
      {warnings.length > 0 && <ul className="card mt-3 space-y-1 bg-turmeric/10 text-sm">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}

      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="card space-y-3">
          <h2 className="font-bold">Product</h2>
          <input className="input" required minLength={2} placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Product name" />
          <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand" /><input className="input" placeholder="Category (e.g. chips)" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" /></div>
          <div className="grid grid-cols-2 gap-2"><input className="input" inputMode="numeric" placeholder="Barcode (optional)" value={barcode} onChange={(e) => setBarcode(e.target.value)} aria-label="Barcode" /><input className="input" inputMode="decimal" placeholder="Price ₹ (optional)" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price" /></div>
          <div className="flex gap-2" role="radiogroup" aria-label="Values are per"><span className="self-center text-sm text-slate2">Per 100</span>{(["g", "ml"] as const).map((u) => <button type="button" key={u} role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} className={unit === u ? "btn-primary !min-h-[40px]" : "btn-outline !min-h-[40px]"}>{u}</button>)}</div>
        </div>
        <div className="card space-y-2">
          <h2 className="font-bold">Nutrition per 100 {unit}</h2>
          {needsServing && <div className="rounded-2xl bg-turmeric/15 p-3 text-sm"><label>Values were per serving. Serving size ({unit}) <input className="input mt-1" inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} /></label></div>}
          {blocked && <p className="text-sm text-slate2">Confirm these values are per 100 {unit}. If the label shows per serving, convert them first.</p>}
          <div className="grid grid-cols-2 gap-2">{NUTRIENT_KEYS.map((k) => <OcrField key={k} label={NUTRIENT_META[k].label} unit={NUTRIENT_META[k].unit} value={vals[k]?.value ?? ""} confidence={vals[k]?.confidence} note={vals[k]?.note} onChange={(v) => setVals({ ...vals, [k]: { ...vals[k], value: v, confidence: vals[k]?.confidence != null && v === vals[k]?.value ? vals[k]?.confidence : undefined } })} />)}</div>
        </div>
        <div className="card"><label className="font-bold" htmlFor="ing">Ingredients</label><textarea id="ing" className="input mt-2 min-h-[110px] py-3" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Potato, palm oil, salt…" /></div>
        <button className="btn-primary w-full" disabled={saving || Boolean(progress) || (needsServing && !Number(serving))}>{saving ? "Analysing…" : "Check values and analyse"}</button>
        <p className="text-center text-xs text-slate2">Edit any value before saving. Highlighted fields are ones the reader was unsure about.</p>
      </form>
    </>
  );
}
export default function OcrPage() { return <Suspense><OcrFlow /></Suspense>; }
