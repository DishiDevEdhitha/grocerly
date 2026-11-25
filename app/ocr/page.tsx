"use client";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Camera, Image as ImageIcon, Link2, Loader2, Sparkles, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageTitle, ErrorBox } from "@/components/States";
import OcrField from "@/components/OcrField";
import ProductTile from "@/components/ProductTile";
import { api, ApiError } from "@/lib/client";
import { runOcr } from "@/lib/ocr-client";
import { prepareImage, type PreparedImage } from "@/lib/image-quality";
import { NUTRIENT_META } from "@/lib/nutrition";
import { NUTRIENT_KEYS, type NutrientKey, type Nutrition } from "@/lib/types";
import type { LabelExtraction } from "@/lib/gemini-label";
import type { ProductCardData } from "@/lib/search";

type Role = "front" | "ingredients" | "nutrition" | "other";
interface Photo { id: string; name: string; role: Role; prepared: PreparedImage }
type Vals = Partial<Record<NutrientKey, { value: string; confidence?: number; note?: string }>>;
const ROLES: { key: Role; label: string }[] = [{ key: "front", label: "Front of pack" }, { key: "ingredients", label: "Ingredients" }, { key: "nutrition", label: "Nutrition table" }, { key: "other", label: "Other" }];
const ASSUME: Role[] = ["front", "ingredients", "nutrition"];

function Flow() {
  const router = useRouter(); const barcodeParam = useSearchParams().get("barcode") ?? "";
  const [submissionId] = useState(() => crypto.randomUUID());
  const camRef = useRef<HTMLInputElement>(null); const galRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]); const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // link
  const [linkOpen, setLinkOpen] = useState(false); const [link, setLink] = useState("");
  const [linkRes, setLinkRes] = useState<{ retailer?: string; query?: string; matches: ProductCardData[]; next: string } | null>(null); const [attached, setAttached] = useState<string | null>(null);
  // review form
  const [showForm, setShowForm] = useState(false); const [origin, setOrigin] = useState<"gemini" | "ocr" | "manual">("manual");
  const [vals, setVals] = useState<Vals>({}); const [ingredients, setIngredients] = useState(""); const [name, setName] = useState(""); const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState(barcodeParam); const [category, setCategory] = useState(""); const [price, setPrice] = useState(""); const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"g" | "ml">("g"); const [serving, setServing] = useState(""); const [veg, setVeg] = useState<"" | "veg" | "nonveg">(""); const [allergens, setAllergens] = useState("");
  const [perServing, setPerServing] = useState<Nutrition | null>(null); const [needsServing, setNeedsServing] = useState(false); const [unknownBasis, setUnknownBasis] = useState<Nutrition | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null); const [saving, setSaving] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return; setPhotoError(null);
    const room = 3 - photos.length; if (room <= 0) { setPhotoError("You can add up to 3 photos."); return; }
    const next: Photo[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      try { const prepared = await prepareImage(f); next.push({ id: crypto.randomUUID(), name: f.name, role: ASSUME[(photos.length + next.length) % 3], prepared }); }
      catch (e) { setPhotoError((e as Error).message); }
    }
    setPhotos((p) => [...p, ...next]);
    if (camRef.current) camRef.current.value = ""; if (galRef.current) galRef.current.value = "";
  }

  function fillFromExtraction(ex: LabelExtraction) {
    const v: Vals = {};
    for (const k of NUTRIENT_KEYS) { const x = ex.nutritionPer100[k]; if (x != null) { const f = ex.fields[k]; v[k] = { value: String(x), confidence: f?.confidence ?? 0.7, note: f?.note }; } }
    setVals(v); if (ex.productName) setName((n) => n || ex.productName!); if (ex.brand) setBrand((b) => b || ex.brand!); if (ex.category) setCategory((c) => c || ex.category!);
    if (ex.ingredientsText) setIngredients(ex.ingredientsText);
    if (ex.servingSize) { setServing(String(ex.servingSize.value)); setUnit(ex.servingSize.unit); }
    if (ex.quantityText) setQuantity(ex.quantityText);
    setVeg(ex.vegetarian === true ? "veg" : ex.vegetarian === false ? "nonveg" : ""); setAllergens(ex.allergens.join(", "));
    setPerServing(ex.nutritionPerServing ?? null); setNeedsServing(ex.basis === "perServing" && !ex.servingSize && !Object.keys(ex.nutritionPer100).length);
    setUnknownBasis(ex.nutritionUnknownBasis ?? null); setWarnings(ex.warnings);
  }

  async function analyse() {
    setError(null); setNotice(null); setBusy("Reading your photos with AI…");
    try {
      const res = await api<{ submissionId: string; extraction: LabelExtraction; existingProductId: string | null }>("/api/label/analyze", { method: "POST", body: JSON.stringify({ submissionId, barcode: barcode || undefined, images: photos.map((p) => ({ mime: "image/jpeg", data: p.prepared.base64, role: p.role })) }) });
      fillFromExtraction(res.extraction); setOrigin("gemini"); setExistingId(res.existingProductId); setShowForm(true);
    } catch (e) {
      const ae = e as ApiError;
      if (ae.code === "ai_unavailable" || ae.code === "ai_failed" || ae.status === 0) { setNotice(`${ae.message} Switching to the basic text reader on your phone.`); await tesseractFallback(); }
      else setError(ae.message);
    } finally { setBusy(null); }
  }

  async function tesseractFallback() {
    try {
      const nut = photos.find((p) => p.role === "nutrition") ?? photos[0]; const ing = photos.find((p) => p.role === "ingredients");
      const v: Vals = {}; const w: string[] = [];
      if (nut) {
        setBusy("Reading the nutrition table…");
        const lines = await runOcr(new File([nut.prepared.blob], "n.jpg", { type: "image/jpeg" }));
        const r = await api<{ extraction: import("@/lib/nutrition").NutritionExtraction }>("/api/ocr/parse", { method: "POST", body: JSON.stringify({ kind: "nutrition", lines, submissionId, barcode: barcode || null }) });
        for (const k of NUTRIENT_KEYS) { const f = r.extraction.fields[k]; if (f) v[k] = { value: String(f.value), confidence: f.confidence, note: f.note }; }
        if (r.extraction.basis.servingSize) setServing(String(r.extraction.basis.servingSize)); setUnit(r.extraction.basis.unit); setNeedsServing(r.extraction.basis.kind === "perServing" && !r.extraction.basis.servingSize); w.push(...r.extraction.warnings);
      }
      if (ing && ing !== nut) {
        setBusy("Reading the ingredient list…");
        const lines = await runOcr(new File([ing.prepared.blob], "i.jpg", { type: "image/jpeg" }));
        const r = await api<{ ingredientsText: string; warnings: string[] }>("/api/ocr/parse", { method: "POST", body: JSON.stringify({ kind: "ingredients", lines, submissionId, barcode: barcode || null }) });
        setIngredients(r.ingredientsText); w.push(...r.warnings);
      }
      setVals(v); setWarnings([...new Set(w)]); setOrigin("ocr"); setShowForm(true);
    } catch (e) { setError((e as Error).message); }
  }

  function chooseBasis(b: "per100" | "perServing") {
    if (!unknownBasis) return;
    const v: Vals = {}; let factor = 1;
    if (b === "perServing") { const s = Number(serving); if (!(s > 0)) { setNeedsServing(true); setWarnings((w) => [...w, "Enter the serving size so values can be converted to per 100 g."]); return; } factor = 100 / s; }
    for (const k of NUTRIENT_KEYS) { const x = unknownBasis[k]; if (x != null) v[k] = { value: String(Math.round(x * factor * 100) / 100), confidence: 0.6 }; }
    setVals((cur) => ({ ...cur, ...v })); setUnknownBasis(null);
  }

  async function findLink() {
    setError(null); setLinkRes(null); setBusy("Finding the product…");
    try { setLinkRes(await api("/api/link/resolve", { method: "POST", body: JSON.stringify({ url: link }) })); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function attach(productId: string) {
    try { const r = await api<{ attached: boolean }>("/api/link/resolve", { method: "POST", body: JSON.stringify({ url: link, productId }) }); setAttached(r.attached ? productId : null); router.push(`/product/${productId}?via=search`); } catch (e) { setError((e as Error).message); }
  }

  async function submit() {
    setSaving(true); setError(null);
    try {
      let factor = 1; if (needsServing && Number(serving) > 0) factor = 100 / Number(serving);
      const nutrition: Record<string, number> = {}; const nutritionMeta: Record<string, unknown> = {};
      for (const k of NUTRIENT_KEYS) { const v = vals[k]; if (v && v.value !== "" && Number.isFinite(Number(v.value))) { nutrition[k] = Number(v.value) * factor; nutritionMeta[k] = { confidence: v.confidence ?? 1, source: origin === "gemini" && v.confidence != null ? "gemini" : v.confidence != null ? "ocr" : "manual" }; } }
      const r = await api<{ product: { id: string } }>("/api/products/submit", { method: "POST", body: JSON.stringify({
        submissionId, origin, name, brand, barcode: barcode || undefined, category, price: price ? Number(price) : undefined, basisUnit: unit, nutrition, nutritionMeta, ingredientsText: ingredients,
        servingSize: Number(serving) > 0 ? { value: Number(serving), unit } : undefined, nutritionPerServing: perServing ?? undefined, allergens: allergens.split(",").map((s) => s.trim()).filter(Boolean),
        vegetarian: veg === "veg" ? true : veg === "nonveg" ? false : undefined, quantity: parseQty(quantity) }) });
      router.push(`/product/${r.product.id}?via=ocr`);
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  const blocked = photos.some((p) => p.prepared.quality.level === "block");
  return (
    <>
      <PageTitle title="Upload label" sub="Add photos of the pack. Grocerly reads the label and you confirm the values." />
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => camRef.current?.click()} disabled={Boolean(busy)} className="card flex min-h-[104px] flex-col items-center justify-center gap-2 text-center text-sm font-semibold"><Camera />Scan with camera</button>
        <button onClick={() => galRef.current?.click()} disabled={Boolean(busy)} className="card flex min-h-[104px] flex-col items-center justify-center gap-2 text-center text-sm font-semibold"><ImageIcon />Upload from gallery</button>
        <button onClick={() => setLinkOpen((o) => !o)} aria-expanded={linkOpen} className="card flex min-h-[104px] flex-col items-center justify-center gap-2 text-center text-sm font-semibold"><Link2 />Paste product link</button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
      <input ref={galRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />

      {linkOpen && (
        <form className="card mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); findLink(); }}>
          <label htmlFor="plink" className="text-sm font-semibold">Product link (Blinkit, Zepto, BigBasket…)</label>
          <input id="plink" className="input" inputMode="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
          <p className="text-xs text-slate2">Grocerly only reads the product name written inside the link and searches its own catalogue. It never opens or copies the shop&apos;s page.</p>
          <button className="btn-primary w-full" disabled={!link || Boolean(busy)}>Find product</button>
          {linkRes && (linkRes.matches.length ? (
            <div className="space-y-2"><p className="text-sm">Looking for “{linkRes.query}”. Is it one of these?</p>
              <ul className="grid grid-cols-2 gap-3">{linkRes.matches.slice(0, 4).map((m) => <li key={m.id}><ProductTile item={m} action={linkRes.retailer && linkRes.retailer !== "other" ? <button type="button" onClick={() => attach(m.id)} className="btn-ghost mt-2 !min-h-[40px] w-full text-xs">This is it · save buy link</button> : null} /></li>)}</ul>{attached && <p className="text-sm text-leaf-dark">Link saved.</p>}</div>
          ) : <p className="rounded-2xl bg-turmeric/10 p-3 text-sm">“{linkRes.query}” is not in Grocerly yet. Take photos of the pack above and Grocerly will read the label for you.</p>)}
        </form>
      )}

      {photoError && <div className="mt-3"><ErrorBox message={photoError} /></div>}
      {photos.length > 0 && (
        <section className="mt-4 space-y-3" aria-label="Your photos">
          {photos.map((p) => (
            <div key={p.id} className="card flex gap-3 !p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.prepared.previewUrl} alt={p.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><select aria-label="What does this photo show" value={p.role} onChange={(e) => setPhotos((ps) => ps.map((x) => (x.id === p.id ? { ...x, role: e.target.value as Role } : x)))} className="input !min-h-[40px] !py-0 text-sm">{ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
                  <button onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} aria-label="Remove photo" className="p-2"><X size={18} /></button></div>
                {p.prepared.quality.level === "ok" ? <p className="mt-1 flex items-center gap-1 text-xs text-leaf-dark"><CheckCircle2 size={14} />Looks readable</p> : <ul className={`mt-1 space-y-0.5 text-xs ${p.prepared.quality.level === "block" ? "text-chilli" : "text-[#9a6a00]"}`}>{p.prepared.quality.issues.map((i) => <li key={i} className="flex gap-1"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{i}</li>)}</ul>}
              </div>
            </div>
          ))}
          <button onClick={analyse} disabled={Boolean(busy) || blocked} className="btn-primary w-full">{busy ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}{busy ?? "Read the label"}</button>
          {blocked && <p className="text-center text-xs text-chilli">Replace the photo marked unreadable, then continue.</p>}
        </section>
      )}
      {!photos.length && !showForm && <button onClick={() => { setShowForm(true); setOrigin("manual"); }} className="mt-4 w-full text-center text-sm font-semibold text-leaf">No photos? Enter the details by hand</button>}
      {notice && <p className="card mt-3 bg-turmeric/10 text-sm">{notice}</p>}
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}

      {showForm && (
        <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="card bg-mint text-sm"><b>Check before saving.</b> {origin === "gemini" ? "These values were read by AI from your photos. AI can misread, so please compare with the pack and correct anything wrong." : origin === "ocr" ? "These values were read by the basic text reader. Highlighted boxes are ones it was unsure about." : "Enter what is printed on the pack."}</div>
          {existingId && <p className="card bg-turmeric/10 text-sm">This barcode is already in Grocerly. <Link href={`/product/${existingId}`} className="font-semibold text-leaf underline">Open the existing product</Link> instead, or continue to add your data (it only fills gaps).</p>}
          {warnings.length > 0 && <ul className="card space-y-1 bg-turmeric/10 text-sm">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
          <div className="card space-y-3"><h2 className="font-bold">Product</h2>
            <input className="input" required minLength={2} placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Product name" />
            <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand" /><input className="input" placeholder="Type (e.g. processed cheese)" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" /></div>
            <div className="grid grid-cols-2 gap-2"><input className="input" inputMode="numeric" placeholder="Barcode (optional)" value={barcode} onChange={(e) => setBarcode(e.target.value)} aria-label="Barcode" /><input className="input" placeholder="Pack size (e.g. 200 g)" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Pack size" /></div>
            <div className="grid grid-cols-2 gap-2"><input className="input" inputMode="decimal" placeholder="Price ₹ (optional)" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price" />
              <select className="input" value={veg} onChange={(e) => setVeg(e.target.value as typeof veg)} aria-label="Veg or non-veg mark"><option value="">Veg mark: not sure</option><option value="veg">Vegetarian (green dot)</option><option value="nonveg">Non-vegetarian (red dot)</option></select></div>
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Values are per"><span className="text-sm text-slate2">Per 100</span>{(["g", "ml"] as const).map((u) => <button type="button" key={u} role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} className={unit === u ? "btn-primary !min-h-[40px]" : "btn-outline !min-h-[40px]"}>{u}</button>)}</div>
            <input className="input" inputMode="decimal" placeholder={`Serving size in ${unit} (if printed)`} value={serving} onChange={(e) => setServing(e.target.value)} aria-label="Serving size" />
          </div>
          <div className="card space-y-2"><h2 className="font-bold">Nutrition per 100 {unit}</h2>
            {unknownBasis && <div className="rounded-2xl bg-turmeric/15 p-3 text-sm"><p className="font-semibold">Are the values on the label per 100 {unit} or per serving?</p><div className="mt-2 flex gap-2"><button type="button" className="btn-outline !min-h-[40px]" onClick={() => chooseBasis("per100")}>Per 100 {unit}</button><button type="button" className="btn-outline !min-h-[40px]" onClick={() => chooseBasis("perServing")}>Per serving</button></div></div>}
            {needsServing && <p className="rounded-2xl bg-turmeric/15 p-3 text-sm">Values are per serving. Enter the serving size above and they will be converted to per 100 {unit}.</p>}
            <div className="grid grid-cols-2 gap-2">{NUTRIENT_KEYS.map((k) => <OcrField key={k} label={NUTRIENT_META[k].label} unit={NUTRIENT_META[k].unit} value={vals[k]?.value ?? ""} confidence={vals[k]?.confidence} note={vals[k]?.note} onChange={(v) => setVals({ ...vals, [k]: { ...vals[k], value: v, confidence: vals[k]?.confidence != null && v === vals[k]?.value ? vals[k]?.confidence : undefined } })} />)}</div></div>
          <div className="card space-y-2"><label className="font-bold" htmlFor="ing">Ingredients</label><textarea id="ing" className="input min-h-[110px] py-3" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Potato, palm oil, salt…" />
            <label className="text-sm font-semibold" htmlFor="alg">Allergens printed on the pack (comma separated)</label><input id="alg" className="input" value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="milk, soy" /></div>
          <button className="btn-primary w-full" disabled={saving || Boolean(busy) || (needsServing && !(Number(serving) > 0))}>{saving ? "Analysing…" : "Confirm and analyse"}</button>
        </form>
      )}
    </>
  );
}
function parseQty(t: string): { value: number; unit: "g" | "ml" } | undefined {
  const m = t.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/); if (!m) return undefined;
  let v = parseFloat(m[1]); let u: "g" | "ml" = "g"; if (m[2] === "kg") v *= 1000; else if (m[2] === "l") { v *= 1000; u = "ml"; } else if (m[2] === "ml") u = "ml";
  return { value: v, unit: u };
}
export default function OcrPage() { return <Suspense><Flow /></Suspense>; }
