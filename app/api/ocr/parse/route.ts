import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getDb, col } from "@/lib/mongodb";
import { parseNutritionLines, type OcrLine } from "@/lib/nutrition";
import { parseIngredientText } from "@/lib/ingredients";
import { ok, fail, handleError } from "@/lib/api";
export const runtime = "nodejs";

/**
 * The browser runs Tesseract (images never leave the phone) and sends only text lines.
 * This endpoint does the deterministic extraction + validation and stores the raw evidence
 * in `submissions`.
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => null);
    const kind = b?.kind === "ingredients" ? "ingredients" : b?.kind === "nutrition" ? "nutrition" : null;
    if (!kind || !Array.isArray(b.lines)) return fail(400, "invalid_input", "Send { kind, lines[] }.");
    const lines: OcrLine[] = b.lines.slice(0, 300).map((l: { text?: unknown; confidence?: unknown }) => ({ text: String(l.text ?? "").slice(0, 300), confidence: Math.min(1, Math.max(0, Number(l.confidence) || 0)) })).filter((l: OcrLine) => l.text.trim());
    if (!lines.length) return fail(422, "ocr_empty", "No text was detected in the image. Retake it in good light, close to the label.");
    const avg = lines.reduce((s, l) => s + l.confidence, 0) / lines.length;

    const submissionId = typeof b.submissionId === "string" && b.submissionId.length < 64 ? b.submissionId : randomUUID();
    let extractedNutrition: unknown = undefined, extractedIngredients: unknown = undefined, result: Record<string, unknown>;
    if (kind === "nutrition") {
      const e = parseNutritionLines(lines);
      extractedNutrition = e; result = { kind, submissionId, confidence: avg, extraction: e };
    } else {
      const text = lines.map((l) => l.text).join(" ").replace(/\s+/g, " ").replace(/^.*?ingredients?\s*[:\-]?\s*/i, "");
      const parsed = parseIngredientText(text);
      extractedIngredients = { text, items: parsed.map((p) => p.name) };
      result = { kind, submissionId, confidence: avg, ingredientsText: text, items: parsed.map((p) => p.name), warnings: avg < 0.6 ? ["Text was hard to read. Please check the ingredient list for typos."] : [] };
    }
    const db = await getDb();
    await col.submissions(db).updateOne({ submissionId }, { $set: { barcode: b.barcode ?? null, rawOCR: { [kind]: lines.map((l) => l.text).join("\n") }, [kind === "nutrition" ? "extractedNutrition" : "extractedIngredients"]: kind === "nutrition" ? extractedNutrition : extractedIngredients, confidence: avg, processingStatus: "parsed" }, $setOnInsert: { submissionId, createdAt: new Date(), images: [] } }, { upsert: true });
    return ok(result);
  } catch (e) { return handleError(e); }
}
