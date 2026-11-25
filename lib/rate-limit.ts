import type { Db } from "mongodb";

/**
 * Fixed-window rate limiter stored in MongoDB (works across serverless instances).
 * A TTL index on `expireAt` deletes old counters automatically.
 */
export async function checkRate(db: Db, bucket: string, who: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSec * 1000));
  const key = `${bucket}:${who}:${windowStart}`;
  const expireAt = new Date((windowStart + 1) * windowSec * 1000 + 60_000);
  try {
    const r = await db.collection("rate_limits").findOneAndUpdate({ _id: key as never }, { $inc: { n: 1 }, $setOnInsert: { expireAt } }, { upsert: true, returnDocument: "after" });
    const n = (r as unknown as { n?: number })?.n ?? 1;
    return { allowed: n <= limit, remaining: Math.max(0, limit - n), retryAfterSec: Math.ceil(((windowStart + 1) * windowSec * 1000 - now) / 1000) };
  } catch {
    return { allowed: true, remaining: limit, retryAfterSec: 0 }; // never block users because the limiter itself failed
  }
}

/** Best-effort client identity: our anonymous device id, else the first forwarded IP. */
export function clientKey(req: Request): string {
  const id = req.headers.get("x-grocerly-user");
  if (id && /^[a-zA-Z0-9-]{16,64}$/.test(id)) return id;
  return (req.headers.get("x-forwarded-for") ?? "anon").split(",")[0].trim().slice(0, 45) || "anon";
}
