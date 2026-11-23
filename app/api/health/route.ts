import { getDb } from "@/lib/mongodb";
import { ok, handleError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return ok({ status: "ok", database: db.databaseName, ai: Boolean(process.env.GEMINI_API_KEY) });
  } catch (e) { return handleError(e); }
}
