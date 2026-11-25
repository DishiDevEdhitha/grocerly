import { getDb, validatorStatus } from "@/lib/mongodb";
import { ok, handleError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    const v = await validatorStatus(db);
    return ok({ status: "ok", database: db.databaseName, ai: Boolean(process.env.GEMINI_API_KEY), validator: v.ok ? "ok" : "outdated", ...(v.ok ? {} : { fix: v.reason }) });
  } catch (e) { return handleError(e); }
}
