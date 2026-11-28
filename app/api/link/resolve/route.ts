import type { NextRequest } from "next/server";
import { getDb, C, isDocId } from "@/lib/db";
import { parseProductLink, PURCHASE_RETAILERS } from "@/lib/links";
import { searchCatalogue } from "@/lib/search";
import { checkRate, clientKey } from "@/lib/rate-limit";
import { ok, fail, handleError } from "@/lib/api";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST { url }                  -> find the product in Grocerly's catalogue by the name inside the link.
 * POST { url, productId }       -> attach the retailer link to that product as an optional "Buy" link.
 * The retailer page is never downloaded or scraped.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const info = parseProductLink(String(body?.url ?? ""));
    if (!info.ok) return fail(400, "invalid_link", info.reason ?? "Invalid link.");
    const db = await getDb();
    const rate = await checkRate(db, "link", clientKey(req), 30, 600);
    if (!rate.allowed) return fail(429, "rate_limited", "Too many link lookups. Please wait a few minutes.");

    if (body?.productId) {
      if (!isDocId(body.productId)) return fail(400, "invalid_input", "Bad product id.");
      if (!info.retailer || !PURCHASE_RETAILERS.includes(info.retailer)) return fail(400, "unsupported_retailer", "Only Blinkit, Zepto and BigBasket links can be attached.");
      const ref = db.collection(C.products).doc(String(body.productId)); const snap = await ref.get();
      if (!snap.exists) return fail(404, "not_found", "Product not found.");
      if (snap.data()?.purchaseLinks?.[info.retailer]) return ok({ attached: false, retailer: info.retailer });
      await ref.update({ [`purchaseLinks.${info.retailer}`]: info.url });
      return ok({ attached: true, retailer: info.retailer });
    }

    let res = await searchCatalogue(db, { q: info.query! });
    let externalTried = false;
    if (!res.items.length) { // not in Grocerly -> one explicit look at Open Food Facts (India), rate-limited
      const r2 = await checkRate(db, "search-ext", clientKey(req), 20, 3600);
      if (r2.allowed) { externalTried = true; res = await searchCatalogue(db, { q: info.query!, external: true }); }
    }
    return ok({ retailer: info.retailer, query: info.query, matches: res.items.slice(0, 6), externalTried, next: res.items.length ? "choose" : "upload_label", externalError: res.externalError });
  } catch (e) { return handleError(e); }
}
