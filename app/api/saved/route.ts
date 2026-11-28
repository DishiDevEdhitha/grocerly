import type { NextRequest } from "next/server";
import { getDb, isDocId } from "@/lib/db";
import { listSaved, saveProduct, unsaveProduct } from "@/lib/user-data";
import { ok, fail, handleError, serialize } from "@/lib/api";
import { getUserId } from "@/lib/user";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req); if (!userId) return ok({ items: [] });
    return ok(serialize({ items: await listSaved(await getDb(), userId) }));
  } catch (e) { return handleError(e); }
}
export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req); if (!userId) return fail(400, "no_user", "Missing user id.");
    const b = await req.json().catch(() => null);
    if (!isDocId(b?.productId)) return fail(400, "invalid_input", "productId required.");
    await saveProduct(await getDb(), userId, b.productId);
    return ok({ saved: true }, 201);
  } catch (e) { return handleError(e); }
}
export async function DELETE(req: NextRequest) {
  try {
    const userId = getUserId(req); const pid = req.nextUrl.searchParams.get("productId");
    if (!userId || !isDocId(pid)) return fail(400, "invalid_input", "productId required.");
    await unsaveProduct(await getDb(), userId, pid);
    return ok({ saved: false });
  } catch (e) { return handleError(e); }
}
