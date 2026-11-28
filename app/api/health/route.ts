import { getDb } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.ping();
    return ok({ status: "ok", database: db.name, engine: "firestore", ai: Boolean(process.env.GEMINI_API_KEY) });
  } catch (e) { return handleError(e); }
}
