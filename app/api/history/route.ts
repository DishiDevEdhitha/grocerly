import type { NextRequest } from "next/server";
import { getDb, col } from "@/lib/mongodb";
import { ok, handleError, serialize } from "@/lib/api";
import { getUserId } from "@/lib/user";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req); if (!userId) return ok({ items: [] });
    const db = await getDb();
    const items = await col.history(db).aggregate([
      { $match: { userId } }, { $sort: { scannedAt: -1 } }, { $limit: 100 },
      { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "p" } }, { $unwind: "$p" },
      { $lookup: { from: "product_analysis", localField: "productId", foreignField: "productId", as: "a" } },
      { $project: { scannedAt: 1, method: 1, id: { $toString: "$p._id" }, name: "$p.name", brand: "$p.brand", image: "$p.images.front", score: { $arrayElemAt: ["$a.score", 0] } } },
    ]).toArray();
    return ok(serialize({ items }));
  } catch (e) { return handleError(e); }
}
