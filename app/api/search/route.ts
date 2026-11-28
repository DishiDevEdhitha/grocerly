import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { searchCatalogue } from "@/lib/search";
import { checkRate, clientKey } from "@/lib/rate-limit";
import { ok, fail, handleError } from "@/lib/api";
import type { SortKey } from "@/lib/search-core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SORTS = new Set(["relevance", "score", "protein", "sodium", "sugars"]);

/** GET /api/search?q=maggi&type=Cup%20Noodles&brand=maggi&sort=score&veg=1&page=1&external=1 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q") ?? ""; const cat = sp.get("cat") ?? undefined;
    if (q.trim().length < 2 && !cat) return fail(400, "invalid_input", "Type at least 2 characters.");
    const db = await getDb();
    const external = sp.get("external") === "1";
    if (external) { // the only path that talks to Open Food Facts: explicit and rate-limited
      const r = await checkRate(db, "search-ext", clientKey(req), 20, 3600);
      if (!r.allowed) return fail(429, "rate_limited", `Too many wider searches. Try again in ${Math.ceil(r.retryAfterSec / 60)} minute(s).`);
    }
    const sort = (sp.get("sort") ?? "relevance") as SortKey;
    const res = await searchCatalogue(db, { q, cat: cat?.slice(0, 40), type: sp.get("type")?.slice(0, 60) || undefined, brand: sp.get("brand")?.slice(0, 60) || undefined, veg: sp.get("veg") === "1", sort: SORTS.has(sort) ? sort : "relevance", page: Math.min(50, Number(sp.get("page")) || 1), external });
    return ok(res);
  } catch (e) { return handleError(e); }
}
