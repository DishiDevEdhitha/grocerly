import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { resolveProduct } from "@/lib/products";
import { bestPerMetric } from "@/lib/compare";
import { ok, fail, handleError, serialize } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
    if (ids.length < 2) return fail(400, "invalid_input", "Pick at least two products to compare.");
    const db = await getDb();
    const items = [];
    for (const id of ids) {
      const r = await resolveProduct(db, id);
      if (r.status === "found") items.push({ id: String(r.product._id), product: { ...r.product, id: String(r.product._id) }, score: r.analysis.score, analysis: r.analysis });
    }
    if (items.length < 2) return fail(404, "not_found", "Some products could not be loaded.");
    return ok(serialize({ items, winners: bestPerMetric(items) }));
  } catch (e) { return handleError(e); }
}
