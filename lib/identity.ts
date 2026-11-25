import type { Product } from "./types";

/** Lowercase, strip accents (Würze -> wurze), drop punctuation, collapse spaces. */
export function norm(s: string | undefined | null): string {
  return (s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const BRAND_ALIASES: Record<string, string> = { "nestle india": "nestle", "nestle": "nestle", "mother dairy fruit vegetable": "mother dairy", "amul": "amul", "gujarat cooperative milk marketing federation": "amul", "parle products": "parle", "itc": "itc", "itc limited": "itc", "pepsico": "pepsico", "pepsico india": "pepsico", "haldirams": "haldiram s", "haldiram": "haldiram s" };
const BRAND_STRIP = /\b(pvt|ltd|limited|private|india|co|inc|llp|foods|food|products)\b/g;

export function normBrand(b?: string | null): string {
  let n = norm(b);
  if (BRAND_ALIASES[n]) return BRAND_ALIASES[n];
  n = n.replace(BRAND_STRIP, " ").replace(/\s+/g, " ").trim();
  return BRAND_ALIASES[n] ?? n;
}

export interface Pack { value: number; unit: "g" | "ml"; count?: number }
/** "200 g", "1 kg", "1.5 L", "2 x 70 g", "pack of 3 x 50g". Returns the TOTAL amount in g or ml. */
export function parsePack(text?: string | null): Pack | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().replace(",", ".");
  const multi = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|ml|l|ltr|litre|liter)\b/);
  const single = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|ml|l|ltr|litre|liter)\b/);
  const m = multi ?? single; if (!m) return undefined;
  const count = multi ? parseInt(m[1], 10) : 1;
  const amount = parseFloat(multi ? m[2] : m[1]); const u = multi ? m[3] : m[2];
  let value = amount, unit: "g" | "ml" = "g";
  if (u === "kg") value = amount * 1000; else if (u === "l" || u === "ltr" || u === "litre" || u === "liter") { value = amount * 1000; unit = "ml"; } else if (u === "ml") unit = "ml";
  value = Math.round(value * count * 100) / 100;
  return value > 0 ? { value, unit, count } : undefined;
}

const STOP = new Set(["the", "and", "of", "with", "new", "pack", "combo", "family", "value"]);
/** Product name without brand words and pack-size words: the "core" used for identity. */
export function nameCore(name: string, brand?: string): string {
  const b = new Set(normBrand(brand).split(" ").concat(norm(brand).split(" ")));
  const cleaned = norm(name).replace(/\b\d+(?:\s?[x×]\s?\d+)?\s?(kg|g|gm|gms|ml|l|ltr)\b/g, " ").replace(/\bpack of \d+\b/g, " ");
  return cleaned.split(" ").filter((w) => w && !STOP.has(w) && !b.has(w)).join(" ");
}

export function samePack(a?: { value: number; unit: string }, b?: { value: number; unit: string }): boolean {
  if (!a || !b) return false;
  return a.unit === b.unit && Math.abs(a.value - b.value) / Math.max(a.value, b.value) <= 0.01;
}

const jaccard = (a: string, b: string) => {
  const A = new Set(a.split(" ").filter(Boolean)), B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};

type IdentityFields = Pick<Product, "barcode" | "name" | "brand" | "quantity"> & { productType?: string };

export function identityKey(p: IdentityFields): string {
  if (p.barcode) return `bc:${p.barcode}`;
  const pack = p.quantity ? `${p.quantity.value}${p.quantity.unit}` : "nopack";
  return `id:${normBrand(p.brand)}|${nameCore(p.name, p.brand)}|${norm(p.productType)}|${pack}`;
}

/**
 * Are these two records the SAME product?
 * - Both have barcodes: same barcode only.
 * - Otherwise: same brand + same product type + near-identical name core + SAME pack size.
 *   Pack sizes that differ (200 g vs 1 kg) are different products. If only one side
 *   has a pack size we stay conservative and say "different".
 */
export function isSameProduct(a: IdentityFields, b: IdentityFields): boolean {
  if (a.barcode && b.barcode) return a.barcode === b.barcode;
  if (normBrand(a.brand) !== normBrand(b.brand) || !normBrand(a.brand)) return false;
  if (norm(a.productType) !== norm(b.productType)) return false;
  if (jaccard(nameCore(a.name, a.brand), nameCore(b.name, b.brand)) < 0.85) return false;
  if (a.quantity && b.quantity) return samePack(a.quantity, b.quantity);
  return !a.quantity && !b.quantity;
}

/** Tokens stored on the product and used by search. Ingredients are deliberately excluded. */
export function stemToken(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}
export function productSearchTokens(p: { name: string; brand?: string; productType?: string; categoryPath?: string[] }): string[] {
  const words = [p.name, p.brand, p.productType, ...(p.categoryPath ?? [])].flatMap((s) => norm(s).split(" "));
  return [...new Set(words.filter((w) => w.length > 1 && !STOP.has(w)).map(stemToken))];
}
