import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { resolveProduct, recordScan } from "@/lib/products";
import { isSaved } from "@/lib/user-data";
import { ok, fail, handleError, serialize } from "@/lib/api";
import { getUserId } from "@/lib/user";
import type { ScanMethod } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const METHODS: ScanMethod[] = ["barcode", "search", "ocr", "cart_screenshot"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = await getDb();
    const r = await resolveProduct(db, id);
    if (r.status === "invalid_barcode") return fail(400, "invalid_barcode", r.reason);
    if (r.status === "external_unavailable") return fail(502, "external_unavailable", "Open Food Facts could not be reached. Try again, or add the product from its label.");
    if (r.status === "not_found") return fail(404, "not_found", "We could not find this product yet. You can add it by photographing its label.");

    const method = req.nextUrl.searchParams.get("method") as ScanMethod | null;
    const userId = getUserId(req);
    if (userId && method && METHODS.includes(method)) await recordScan(db, userId, r.product._id, method);
    const saved = userId ? await isSaved(db, userId, r.product._id) : false;
    return ok(serialize({ product: { ...r.product, id: r.product._id }, analysis: r.analysis, origin: r.origin, saved }));
  } catch (e) { return handleError(e); }
}
