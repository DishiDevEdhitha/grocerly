import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, col } from "@/lib/mongodb";
import { ok, fail, handleError, serialize } from "@/lib/api";
import { getUserId } from "@/lib/user";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req); if (!userId) return ok({ items: [] });
    const db = await getDb();
    const items = await col.saved(db).aggregate([
      { $match: { userId } }, { $sort: { savedAt: -1 } }, { $limit: 200 },
      { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "p" } }, { $unwind: "$p" },
      { $lookup: { from: "product_analysis", localField: "productId", foreignField: "productId", as: "a" } },
      { $project: { savedAt: 1, id: { $toString: "$p._id" }, name: "$p.name", brand: "$p.brand", image: "$p.images.front", category: "$p.category", score: { $arrayElemAt: ["$a.score", 0] } } },
    ]).toArray();
    return ok(serialize({ items }));
  } catch (e) { return handleError(e); }
}
export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req); if (!userId) return fail(400, "no_user", "Missing user id.");
    const b = await req.json().catch(() => null);
    if (!b?.productId || !/^[a-f0-9]{24}$/i.test(b.productId)) return fail(400, "invalid_input", "productId required.");
    const db = await getDb(); const productId = new ObjectId(b.productId);
    await col.users(db).updateOne({ userId }, { $setOnInsert: { userId, createdAt: new Date() } }, { upsert: true });
    await col.saved(db).updateOne({ userId, productId }, { $setOnInsert: { userId, productId, savedAt: new Date() } }, { upsert: true });
    return ok({ saved: true }, 201);
  } catch (e) { return handleError(e); }
}
export async function DELETE(req: NextRequest) {
  try {
    const userId = getUserId(req); const pid = req.nextUrl.searchParams.get("productId");
    if (!userId || !pid || !/^[a-f0-9]{24}$/i.test(pid)) return fail(400, "invalid_input", "productId required.");
    const db = await getDb();
    await col.saved(db).deleteOne({ userId, productId: new ObjectId(pid) });
    return ok({ saved: false });
  } catch (e) { return handleError(e); }
}
