import { getDb } from "@/lib/db";
import { homeData } from "@/lib/search";
import { ok, handleError } from "@/lib/api";
export const runtime = "nodejs";
export const revalidate = 60;

/** Public data only (no user info), so it is safe to cache for a minute at the edge. */
export async function GET() {
  try {
    const res = ok(await homeData(await getDb()));
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res;
  } catch (e) { return handleError(e); }
}
