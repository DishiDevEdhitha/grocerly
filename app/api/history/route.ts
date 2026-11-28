import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { listHistory } from "@/lib/user-data";
import { ok, handleError, serialize } from "@/lib/api";
import { getUserId } from "@/lib/user";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent scans: users/{id}/history newest first, joined with each product's name, image and score (in code). */
export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req); if (!userId) return ok({ items: [] });
    return ok(serialize({ items: await listHistory(await getDb(), userId) }));
  } catch (e) { return handleError(e); }
}
