import { validateBarcode } from "./barcode";
import { normalizeOffProduct, type OffProduct } from "./normalize";
import type { Product } from "./types";

/** Open Food Facts client. Data is ODbL licensed: attribution is shown on the About page. */
const FIELDS = "code,product_name,product_name_en,generic_name,brands,categories,categories_tags,quantity,product_quantity,ingredients_text,ingredients_text_en,allergens_tags,traces_tags,nutriments,image_front_url,image_ingredients_url,image_nutrition_url,nova_group,url,serving_size,serving_quantity,labels_tags,ingredients_analysis_tags,countries_tags,image_front_small_url";

export type ExternalCode = "not_found" | "rate_limited" | "unavailable" | "timeout" | "network" | "bad_response";
export class ExternalApiError extends Error {
  constructor(msg: string, public status?: number, public code: ExternalCode = "unavailable", public retryAfterSec?: number) { super(msg); this.name = "ExternalApiError"; }
}

const base = () => (process.env.OFF_BASE_URL || "https://world.openfoodfacts.org").replace(/\/$/, "");
const headers = () => ({ "User-Agent": process.env.OFF_USER_AGENT || "Grocerly/1.0 (student-project)", Accept: "application/json" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with a timeout and one retry for 503. 404 / 429 / 503 / timeouts become typed errors. */
async function getJson<T>(url: string, timeoutMs = 8000, retried = false): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: headers(), signal: ctrl.signal, cache: "no-store" });
    if (res.status === 404) throw new ExternalApiError("Not found", 404, "not_found");
    if (res.status === 429) throw new ExternalApiError("Open Food Facts is rate-limiting requests. Please wait a minute and try again.", 429, "rate_limited", Number(res.headers.get("retry-after")) || 60);
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      if (!retried) { await sleep(800); return await getJson<T>(url, timeoutMs, true); }
      throw new ExternalApiError("Open Food Facts is temporarily unavailable.", res.status, "unavailable");
    }
    if (!res.ok) throw new ExternalApiError(`Open Food Facts responded ${res.status}`, res.status, "bad_response");
    try { return (await res.json()) as T; } catch { throw new ExternalApiError("Open Food Facts sent an unreadable response.", res.status, "bad_response"); }
  } catch (e) {
    if (e instanceof ExternalApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ExternalApiError("Open Food Facts timed out.", undefined, "timeout");
    throw new ExternalApiError("Open Food Facts is unreachable.", undefined, "network");
  } finally { clearTimeout(t); }
}

/** Returns a normalized Product, null when OFF has no usable record, throws ExternalApiError on outage. */
export async function fetchOffByBarcode(barcode: string): Promise<{ product: Product | null; issues: string[] }> {
  const bc = validateBarcode(barcode);
  if (!bc.valid) return { product: null, issues: [bc.reason ?? "Invalid barcode"] };
  try {
    const data = await getJson<{ status?: number; product?: OffProduct }>(`${base()}/api/v2/product/${bc.normalized}.json?fields=${FIELDS}`);
    if (data.status === 0 || !data.product) return { product: null, issues: ["Not found in Open Food Facts"] };
    return normalizeOffProduct({ ...data.product, code: data.product.code ?? bc.normalized });
  } catch (e) {
    if (e instanceof ExternalApiError && e.status === 404) return { product: null, issues: ["Not found in Open Food Facts"] };
    throw e;
  }
}

/** Text search, restricted to products sold in India (legacy CGI endpoint supports the country filter). */
export async function searchOff(query: string, limit = 10, opts: { india?: boolean } = {}): Promise<{ product: Product; isIndian: boolean }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const india = opts.india !== false ? "&tagtype_0=countries&tag_contains_0=contains&tag_0=india" : "";
  const url = `${base()}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}${india}&fields=${FIELDS}`;
  const data = await getJson<{ products?: OffProduct[] }>(url, 10000);
  const out: { product: Product; isIndian: boolean }[] = [];
  for (const p of data.products ?? []) {
    const r = normalizeOffProduct(p);
    if (r.product) out.push({ product: r.product, isIndian: Boolean(r.isIndian) });
  }
  return out;
}

/** One page of Indian products, most-scanned first. OFF allows roughly 10 search requests per minute. */
export async function fetchOffIndiaPage(page: number, pageSize = 100): Promise<{ raw: OffProduct[]; count: number }> {
  const url = `${base()}/api/v2/search?countries_tags_en=india&sort_by=unique_scans_n&page=${page}&page_size=${pageSize}&fields=${FIELDS}`;
  const data = await getJson<{ products?: OffProduct[]; count?: number }>(url, 20000);
  return { raw: data.products ?? [], count: data.count ?? 0 };
}
