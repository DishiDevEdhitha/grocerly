import type { NextRequest } from "next/server";
import { getDb, col } from "@/lib/mongodb";
import { searchProducts } from "@/lib/products";
import { ok, fail, handleError, serialize } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    if (q.trim().length < 2) return fail(400, "invalid_input", "Type at least 2 characters.");
    const db = await getDb();
    const { results, externalError } = await searchProducts(db, q, { external: req.nextUrl.searchParams.get("external") !== "0" });
    const scores = await col.analysis(db).find({ productId: { $in: results.map((r) => r._id!) } }, { projection: { productId: 1, score: 1, scoreVersion: 1 } }).toArray();
    const byId = new Map(scores.map((s) => [String(s.productId), s.score]));
    return ok(serialize({ results: results.map((p) => ({ id: String(p._id), barcode: p.barcode, name: p.name, brand: p.brand, category: p.category, image: p.images?.front, score: byId.get(String(p._id)) ?? null })), externalError }));
  } catch (e) { return handleError(e); }
}
