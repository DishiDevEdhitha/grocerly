import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getDb, col } from "@/lib/mongodb";
import { validateImagePayload } from "@/lib/image-server";
import { extractLabelRaw, validateExtraction, GeminiError, geminiConfigured } from "@/lib/gemini-label";
import { validateBarcode } from "@/lib/barcode";
import { checkRate, clientKey } from "@/lib/rate-limit";
import { ok, fail, handleError } from "@/lib/api";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Photos -> Gemini (reader) -> validation (our code) -> structured result for the user to confirm.
 * Nothing is saved to the catalogue here. Saving happens in /api/products/submit after the user checks the values.
 */
export async function POST(req: NextRequest) {
  try {
    if (!geminiConfigured()) return fail(503, "ai_unavailable", "AI label reading is not switched on for this site. Using the basic reader instead.");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 4_600_000) return fail(413, "too_large", "The photos are too large. Take them closer or in lower resolution.");
    const body = await req.json().catch(() => null);
    if (!body) return fail(400, "invalid_input", "Send { images: [{ mime, data, role }] }.");
    const check = validateImagePayload(body.images);
    if (!check.ok) return fail(check.status, check.code, check.message);

    const db = await getDb();
    const rate = await checkRate(db, "label-ai", clientKey(req), 8, 3600);
    if (!rate.allowed) return fail(429, "rate_limited", `You have reached the hourly limit for AI label reading. Try again in ${Math.ceil(rate.retryAfterSec / 60)} minute(s).`);

    let barcode: string | null = null;
    if (body.barcode) { const v = validateBarcode(String(body.barcode)); if (v.valid) barcode = v.normalized; }
    const existing = barcode ? await col.products(db).findOne({ barcode }, { projection: { _id: 1, name: 1 } }) : null;

    const raw = await extractLabelRaw(check.images);
    const extraction = validateExtraction(raw);
    const submissionId = typeof body.submissionId === "string" && body.submissionId.length < 64 ? body.submissionId : randomUUID();
    // Keep the evidence (model JSON + validated result), never the photos.
    await col.submissions(db).updateOne({ submissionId }, { $set: { barcode, rawAI: raw, extractedNutrition: extraction.fields, extractedIngredients: extraction.ingredients, confidence: null, processingStatus: "ai_parsed", imageCount: check.images.length }, $setOnInsert: { submissionId, createdAt: new Date(), images: [] } }, { upsert: true });
    return ok({ submissionId, extraction, existingProductId: existing ? String(existing._id) : null, usedAi: true });
  } catch (e) {
    if (e instanceof GeminiError) {
      const status = e.code === "quota" ? 429 : e.code === "not_configured" || e.code === "auth" ? 503 : e.code === "timeout" ? 504 : e.code === "bad_request" ? 502 : 502;
      return fail(status, e.code === "not_configured" || e.code === "auth" || e.code === "quota" || e.code === "unavailable" || e.code === "timeout" ? "ai_unavailable" : "ai_failed", e.message);
    }
    return handleError(e);
  }
}
