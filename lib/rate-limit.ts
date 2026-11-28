import { C, increment, type DB } from "./db";

/**
 * Fixed-window rate limiter stored in Firestore (works across serverless instances).
 * Each window is one document in `rate_limits`. Enable a TTL policy on its `expireAt` field
 * (Firebase console > Firestore > Indexes/TTL) so old counters delete themselves.
 */
export async function checkRate(db: DB, bucket: string, who: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSec * 1000));
  const id = `${bucket}_${who}_${windowStart}`.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 150);
  const expireAt = new Date((windowStart + 1) * windowSec * 1000 + 60_000);
  try {
    const ref = db.collection(C.rateLimits).doc(id);
    await ref.set({ n: increment(1), expireAt }, { merge: true });
    const n = ((await ref.get()).data()?.n as number | undefined) ?? 1;
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
