import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { resolveProduct } from "@/lib/products";
import { findAlternatives, parsePrefs } from "@/lib/alternatives";
import { ok, fail, handleError, serialize } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = await getDb();
    const r = await resolveProduct(db, id);
    if (r.status !== "found") return fail(404, "not_found", "Product not found.");
    const prefs = parsePrefs(req.nextUrl.searchParams.get("prefs"));
    const { alternatives, candidateCount } = await findAlternatives(db, r.product, r.analysis, prefs, 5);
    return ok(serialize({ prefs, candidateCount, alternatives: alternatives.map((a) => ({ ...a, product: { ...a.product, id: a.id } })) }));
  } catch (e) { return handleError(e); }
}
