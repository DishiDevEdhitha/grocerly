import { NextResponse } from "next/server";
import { DbConfigError } from "./db";

export const ok = (data: unknown, init?: number) => NextResponse.json(data, { status: init ?? 200 });
export const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** Maps internal errors to safe, user-readable responses (never leaks keys or connection details). */
export function handleError(e: unknown) {
  if (e instanceof DbConfigError) return fail(503, "db_not_configured", e.message);
  const code = (e as { code?: number | string })?.code;
  if (code === 8 || code === "resource-exhausted") { console.error("[grocerly] Firestore quota:", e); return fail(503, "db_quota", "The free daily database limit was reached. Please try again later."); }
  if (code === 5) { console.error("[grocerly] Firestore not found:", e); return fail(503, "db_not_created", "The Firestore database has not been created yet. Create it in the Firebase console (guide, Step 1)."); }
  if (code === 7 || code === 16) { console.error("[grocerly] Firestore permission:", e); return fail(503, "db_permission", "The database key does not have permission. Check the service account (guide, Step 2)."); }
  if (code === 14 || code === 4 || code === 2) { console.error("[grocerly] Firestore unavailable:", e); return fail(503, "db_unavailable", "The database is temporarily unavailable. Please try again."); }
  console.error("[grocerly] Unexpected error:", e);
  return fail(500, "internal_error", "Something went wrong on our side.");
}

/** Make a value JSON-safe (Dates become text). */
export function serialize<T>(doc: T): T { return JSON.parse(JSON.stringify(doc)) as T; }
