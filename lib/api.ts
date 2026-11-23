import { NextResponse } from "next/server";
import { MongoConfigError } from "./mongodb";

export const ok = (data: unknown, init?: number) => NextResponse.json(data, { status: init ?? 200 });
export const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** Maps internal errors to safe, user-readable responses (never leaks connection strings). */
export function handleError(e: unknown) {
  if (e instanceof MongoConfigError) return fail(503, "db_not_configured", e.message);
  const name = (e as Error)?.name ?? "";
  if (name.startsWith("Mongo")) { console.error("[grocerly] MongoDB error:", e); return fail(503, "db_unavailable", "The database is temporarily unavailable. Please try again."); }
  console.error("[grocerly] Unexpected error:", e);
  return fail(500, "internal_error", "Something went wrong on our side.");
}

/** Convert Mongo documents (ObjectId, Date) to JSON-safe objects with string ids. */
export function serialize<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc, (_k, v) => (v && typeof v === "object" && v._bsontype === "ObjectId" ? String(v) : v))) as T;
}
