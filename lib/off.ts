import { validateBarcode } from "./barcode";
import { normalizeOffProduct, type OffProduct } from "./normalize";
import type { Product } from "./types";

/** Open Food Facts client. Data is ODbL licensed: attribution is shown on the About page. */
const FIELDS = "code,product_name,product_name_en,generic_name,brands,categories,categories_tags,quantity,product_quantity,ingredients_text,ingredients_text_en,allergens_tags,traces_tags,nutriments,image_front_url,image_ingredients_url,image_nutrition_url,nova_group,url";

export class ExternalApiError extends Error {
  constructor(msg: string, public status?: number) { super(msg); this.name = "ExternalApiError"; }
}

const base = () => (process.env.OFF_BASE_URL || "https://world.openfoodfacts.org").replace(/\/$/, "");
const headers = () => ({ "User-Agent": process.env.OFF_USER_AGENT || "Grocerly/1.0 (student-project)", Accept: "application/json" });

/**async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: headers(), signal: ctrl.signal, cache: "no-store" });
    if (res.status === 404) throw new ExternalApiError("Not found", 404);
    if (!res.ok) throw new ExternalApiError(`Open Food Facts responded ${res.status}`, res.status);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ExternalApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ExternalApiError("Open Food Facts timed out");
    throw new ExternalApiError("Open Food Facts is unreachable");
  } finally { clearTimeout(t); }
}
  */

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: headers(),
        signal: ctrl.signal,
        cache: "no-store",
      });

      if (res.status === 404) {
        throw new ExternalApiError("Not found", 404);
      }

      if (!res.ok) {
        const retryable = [429, 500, 502, 503, 504].includes(res.status);

        if (retryable && attempt < maxRetries) {
          console.log(
            `Open Food Facts returned ${res.status}. Retrying (${attempt}/${maxRetries - 1})...`
          );

          await new Promise((resolve) =>
            setTimeout(resolve, 1500 * attempt)
          );

          continue;
        }

        throw new ExternalApiError(
          `Open Food Facts responded ${res.status}`,
          res.status
        );
      }

      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ExternalApiError) {
        if (e.status === 404) throw e;

        if (attempt < maxRetries) {
          console.log(
            `Open Food Facts request failed. Retrying (${attempt}/${maxRetries - 1})...`
          );

          await new Promise((resolve) =>
            setTimeout(resolve, 1500 * attempt)
          );

          continue;
        }

        throw e;
      }

      if ((e as Error).name === "AbortError") {
        if (attempt < maxRetries) {
          console.log(
            `Open Food Facts timed out. Retrying (${attempt}/${maxRetries - 1})...`
          );

          await new Promise((resolve) =>
            setTimeout(resolve, 1500 * attempt)
          );

          continue;
        }

        throw new ExternalApiError("Open Food Facts timed out");
      }

      if (attempt < maxRetries) {
        console.log(
          `Open Food Facts is unreachable. Retrying (${attempt}/${maxRetries - 1})...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, 1500 * attempt)
        );

        continue;
      }

      throw new ExternalApiError("Open Food Facts is unreachable");
    } finally {
      clearTimeout(t);
    }
  }

  throw new ExternalApiError("Open Food Facts request failed");
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

export async function searchOff(query: string, limit = 10): Promise<Product[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${base()}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=${FIELDS}`;
  const data = await getJson<{ products?: OffProduct[] }>(url, 10000);
  const out: Product[] = [];
  for (const p of data.products ?? []) {
    const { product } = normalizeOffProduct(p);
    if (product) out.push(product);
  }
  return out;
}
