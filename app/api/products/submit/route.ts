import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getDb, col } from "@/lib/mongodb";
import { saveProductWithAnalysis } from "@/lib/products";
import { validateBarcode } from "@/lib/barcode";
import { cleanNutrition } from "@/lib/nutrition";
import { parseIngredientText } from "@/lib/ingredients";
import { detectProfile } from "@/lib/scoring-config";
import { ok, fail, handleError, serialize } from "@/lib/api";
import { getUserId } from "@/lib/user";
import { NUTRIENT_KEYS, type NutritionMeta, type Product } from "@/lib/types";
export const runtime = "nodejs";

/** Create a product from user-verified OCR/manual input. */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => null);
    if (!b || typeof b.name !== "string" || b.name.trim().length < 2) return fail(400, "invalid_input", "Product name is required.");
    let barcode: string | null = null;
    if (b.barcode) {
      const bc = validateBarcode(String(b.barcode));
      if (!bc.valid) return fail(400, "invalid_barcode", bc.reason ?? "Invalid barcode");
      barcode = bc.normalized;
    }
    const nutrition = cleanNutrition(b.nutrition ?? {});
    const ingredientsText = typeof b.ingredientsText === "string" ? b.ingredientsText.slice(0, 4000).trim() : "";
    if (!Object.keys(nutrition).length && !ingredientsText) return fail(400, "invalid_input", "Add at least one nutrition value or an ingredient list.");

    const meta: NutritionMeta = {};
    for (const k of NUTRIENT_KEYS) if (nutrition[k] != null) {
      const m = b.nutritionMeta?.[k];
      meta[k] = { confidence: typeof m?.confidence === "number" ? Math.min(1, Math.max(0, m.confidence)) : 1, source: b.nutritionMeta?.[k]?.source === "ocr" ? "ocr" : "manual", verifiedByUser: true };
    }
    const unit: "g" | "ml" = b.basisUnit === "ml" ? "ml" : "g";
    const categoryText = typeof b.category === "string" && b.category.trim() ? b.category.trim().slice(0, 60) : "Uncategorised";
    const now = new Date();
    const hasOcr = Object.values(meta).some((m) => m?.source === "ocr");
    const product: Product = {
      barcode, name: b.name.trim().slice(0, 120), brand: typeof b.brand === "string" ? b.brand.trim().slice(0, 60) || undefined : undefined,
      category: categoryText, categoryTags: [categoryText.toLowerCase().replace(/\s+/g, "-")], profile: detectProfile([categoryText.toLowerCase().replace(/\s+/g, "-")], b.name),
      nutritionBasis: { amount: 100, unit }, nutrition, nutritionMeta: meta,
      ingredients: [...new Set(parseIngredientText(ingredientsText).map((p) => p.name))], ingredientsText: ingredientsText || undefined,
      allergens: { declared: [], traces: [] }, images: {},
      price: typeof b.price === "number" && b.price > 0 ? { value: b.price, currency: "INR" } : undefined,
      source: { type: hasOcr ? "ocr" : "manual", confidence: hasOcr ? 0.8 : 0.7, ref: b.submissionId, fetchedAt: now }, createdAt: now, updatedAt: now,
    };
    const db = await getDb();
    const { product: saved, analysis, created } = await saveProductWithAnalysis(db, product);
    const submissionId = typeof b.submissionId === "string" && b.submissionId ? b.submissionId : randomUUID();
    await col.submissions(db).updateOne({ submissionId }, { $set: { processingStatus: "accepted", productId: saved._id, acceptedAt: now } }, { upsert: true });
    const userId = getUserId(req);
    if (userId) await db.collection("scan_history").insertOne({ userId, productId: saved._id, method: "ocr", scannedAt: now });
    return ok(serialize({ product: { ...saved, id: String(saved._id) }, analysis, created }), created ? 201 : 200);
  } catch (e) {
    if ((e as { code?: number }).code === 121) return fail(422, "validation_failed", "The database rejected the product because it did not match the schema.");
    return handleError(e);
  }
}
