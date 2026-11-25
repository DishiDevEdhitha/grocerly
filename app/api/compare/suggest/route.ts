import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { resolveProduct } from "@/lib/products";
import { findSimilar } from "@/lib/similar";
import { toCard } from "@/lib/search";
import { ok, fail, handleError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/compare/suggest?id=<productId or barcode>: comparable products (same type/category, other brands first). */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return fail(400, "invalid_input", "id is required.");
    const db = await getDb();
    const r = await resolveProduct(db, id);
    if (r.status !== "found") return fail(404, "not_found", "Product not found.");
    const similar = await findSimilar(db, r.product, 8);
    return ok({ base: String(r.product._id), items: similar.map((s) => ({ ...toCard({ ...s.product, _id: new ObjectId(s.id) } as never, s.score), why: s.why, rank: s.rank })) });
  } catch (e) { return handleError(e); }
}
