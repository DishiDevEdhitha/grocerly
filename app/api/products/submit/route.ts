import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { saveProductWithAnalysis, recordScan } from "@/lib/products";
import { enrichProduct } from "@/lib/catalogue";
import { classify } from "@/lib/taxonomy";
import { checkRate, clientKey } from "@/lib/rate-limit";
import { validateBarcode } from "@/lib/barcode";
import { cleanNutrition } from "@/lib/nutrition";
import { parseIngredientText } from "@/lib/ingredients";
import { detectProfile } from "@/lib/scoring-config";
import { ok, fail, handleError, serialize } from "@/lib/api";
import { getUserId } from "@/lib/user";
import { NUTRIENT_KEYS, type NutritionMeta, type Product, type Provenance } from "@/lib/types";
export const runtime = "nodejs";

const ALLERGEN_TAG: Record<string, string> = { milk: "milk", dairy: "milk", gluten: "gluten", wheat: "gluten", soy: "soybeans", soya: "soybeans", soybeans: "soybeans", peanuts: "peanuts", peanut: "peanuts", "tree nuts": "nuts", nuts: "nuts", egg: "eggs", eggs: "eggs", fish: "fish", shellfish: "crustaceans", crustaceans: "crustaceans", sesame: "sesame-seeds" };

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
      meta[k] = { confidence: typeof m?.confidence === "number" ? Math.min(1, Math.max(0, m.confidence)) : 1, source: m?.source === "ocr" ? "ocr" : m?.source === "gemini" ? "gemini" : "manual", verifiedByUser: true };
    }
    const unit: "g" | "ml" = b.basisUnit === "ml" ? "ml" : "g";
    const categoryText = typeof b.category === "string" && b.category.trim() ? b.category.trim().slice(0, 60) : "";
    const now = new Date();
    const origin: Provenance = b.origin === "gemini" ? "gemini" : meta && Object.values(meta).some((m) => m?.source === "ocr") ? "ocr" : "manual";
    const cls = classify({ name: b.name, brand: b.brand, tags: categoryText ? [categoryText] : [] });
    const sv = b.servingSize && Number(b.servingSize.value) > 0 && Number(b.servingSize.value) < 2000 ? { value: Number(b.servingSize.value), unit: (b.servingSize.unit === "ml" ? "ml" : "g") as "g" | "ml" } : undefined;
    const nps = b.nutritionPerServing ? cleanNutrition(b.nutritionPerServing) : undefined;
    const declared = Array.isArray(b.allergens) ? [...new Set((b.allergens as unknown[]).map((a) => ALLERGEN_TAG[String(a).toLowerCase().trim()]).filter(Boolean))].map((t) => `en:${t}`) : [];
    const base: Product = {
      barcode, name: b.name.trim().slice(0, 120), brand: typeof b.brand === "string" ? b.brand.trim().slice(0, 60) || undefined : undefined,
      category: categoryText || cls.productType, categoryTags: categoryText ? [categoryText.toLowerCase().replace(/\s+/g, "-")] : [], profile: cls.profile ?? "default",
      quantity: b.quantity && Number(b.quantity.value) > 0 ? { value: Number(b.quantity.value), unit: b.quantity.unit === "ml" ? "ml" : "g" } : undefined,
      nutritionBasis: { amount: 100, unit }, nutrition, nutritionMeta: meta, servingSize: sv, nutritionPerServing: nps && Object.keys(nps).length ? nps : undefined,
      ingredients: [...new Set(parseIngredientText(ingredientsText).map((p) => p.name))], ingredientsText: ingredientsText || undefined,
      allergens: { declared, traces: [] }, images: {}, dietary: { vegetarian: typeof b.vegetarian === "boolean" ? b.vegetarian : null },
      price: typeof b.price === "number" && b.price > 0 ? { value: b.price, currency: "INR" } : undefined,
      source: { type: origin, confidence: origin === "gemini" ? 0.75 : 0.7, ref: b.submissionId, fetchedAt: now },
      sources: [{ source: origin, name: origin === "gemini" ? "Gemini label reading, confirmed by user" : "User-entered label data", confidence: origin === "gemini" ? 0.75 : 0.7, ref: b.submissionId, fetchedAt: now }],
      createdAt: now, updatedAt: now,
    };
    const product = enrichProduct(base, { isIndian: true, forceStatus: true });
    const db = await getDb();
    const rate = await checkRate(db, "submit", clientKey(req), 20, 3600);
    if (!rate.allowed) return fail(429, "rate_limited", "Too many submissions. Please try again later.");
    const { product: saved, analysis, created } = await saveProductWithAnalysis(db, product);
    const submissionId = typeof b.submissionId === "string" && b.submissionId ? b.submissionId : randomUUID();
    await db.collection("submissions").doc(submissionId).set({ submissionId, processingStatus: "accepted", productId: saved._id, acceptedAt: now }, { merge: true });
    const userId = getUserId(req);
    if (userId) await recordScan(db, userId, saved._id, "ocr");
    return ok(serialize({ product: { ...saved, id: String(saved._id) }, analysis, created }), created ? 201 : 200);
  } catch (e) {
    return handleError(e);
  }
}
