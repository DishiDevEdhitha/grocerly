import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { recordScan } from "@/lib/products";
import { searchCatalogue } from "@/lib/search";
import { extractCartItems } from "@/lib/cart";
import { resolveProduct } from "@/lib/products";
import { findAlternatives } from "@/lib/alternatives";
import { ok, fail, handleError, serialize } from "@/lib/api";
import { getUserId } from "@/lib/user";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => null);
    if (!b || !Array.isArray(b.lines)) return fail(400, "invalid_input", "Send { lines: string[] } from the OCR step.");
    const names = extractCartItems(b.lines.map(String), 8);
    if (!names.length) return fail(422, "no_items", "No product names were found. Upload a clearer screenshot of the cart.");
    const db = await getDb(); const userId = getUserId(req);

    const settled = await Promise.all(names.map(async (query) => {
      const { items } = await searchCatalogue(db, { q: query, external: true });
      const hit = items[0]; if (!hit) return { query, matched: false as const };
      const r = await resolveProduct(db, hit.id);
      if (r.status !== "found") return { query, matched: false as const };
      const { alternatives } = await findAlternatives(db, r.product, r.analysis, undefined, 1);
      if (userId) await recordScan(db, userId, r.product._id, "cart_screenshot");
      return { query, matched: true as const, product: { id: String(r.product._id), name: r.product.name, brand: r.product.brand, image: r.product.images?.front }, score: r.analysis.score, warnings: r.analysis.warnings.map((w) => w.label), alternativeAvailable: alternatives.length > 0 };
    }));
    const matched = settled.filter((s) => s.matched);
    const scored = matched.filter((m) => m.matched && m.score != null) as Extract<(typeof matched)[number], { matched: true }>[];
    const count = (re: RegExp) => scored.filter((m) => m.warnings.some((w) => re.test(w))).length;
    return ok(serialize({
      items: settled, analyzed: matched.length, unmatched: settled.length - matched.length,
      averageScore: scored.length ? Math.round(scored.reduce((s, m) => s + (m.score as number), 0) / scored.length) : null,
      highSodium: count(/sodium/i), highSugar: count(/sugar/i), highSatFat: count(/saturated/i),
    }));
  } catch (e) { return handleError(e); }
}
