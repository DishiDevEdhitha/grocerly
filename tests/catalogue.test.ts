import { describe, it, expect } from "vitest";
import { classify, findNodesForPhrase } from "@/lib/taxonomy";
import { isSameProduct, parsePack, identityKey, nameCore, normBrand } from "@/lib/identity";
import { enrichProduct, mergeProducts, computeStatus, prio } from "@/lib/catalogue";
import type { Product } from "@/lib/types";

const base = (o: Partial<Product>): Product => ({ barcode: null, name: "x", brand: "b", category: "c", categoryTags: [], profile: "default", nutritionBasis: { amount: 100, unit: "g" }, nutrition: {}, ingredients: [], allergens: { declared: [], traces: [] }, images: {}, source: { type: "openfoodfacts", confidence: 0.7, fetchedAt: new Date() }, createdAt: new Date(), updatedAt: new Date(), ...o });

describe("taxonomy classification", () => {
  it("distinguishes the Maggi product family", () => {
    expect(classify({ name: "Maggi 2-Minute Masala Noodles", brand: "Maggi" }).path).toEqual(["Instant Foods", "Instant Noodles"]);
    expect(classify({ name: "Maggi Masala Cup Noodles" }).productType).toBe("Cup Noodles");
    expect(classify({ name: "Maggi Pazzta Cheese Macaroni Pasta" }).productType).toBe("Pasta");
    expect(classify({ name: "Maggi Rich Tomato Ketchup" }).path).toEqual(["Sauces & Condiments", "Ketchup"]);
    expect(classify({ name: "Maggi Maggi Würze Seasoning" }).productType).toBe("Seasonings");
  });
  it("finds cheese types", () => {
    expect(classify({ name: "Amul Processed Cheese Block" }).path).toEqual(["Dairy", "Cheese", "Processed Cheese"]);
    expect(classify({ name: "Britannia Cheese Slices" }).productType).toBe("Cheese Slices");
    expect(classify({ name: "Amul Cheese Spread" }).productType).toBe("Cheese Spread");
    expect(classify({ name: "Go Cheese Cubes" }).productType).toBe("Cheese Cubes");
  });
  it("longest keyword wins: chocolate cream biscuit is a biscuit, not a chocolate", () => {
    expect(classify({ name: "Chocolate Cream Biscuits" }).department).toBe("Biscuits");
    expect(classify({ name: "Jim Jam biscuit" }).department).toBe("Biscuits");
  });
  it("falls back to Uncategorised and uses tags as a weaker signal", () => {
    expect(classify({ name: "Mystery thing" }).department).toBe("Uncategorised");
    expect(classify({ name: "Crunchy rings", tags: ["en:salty-snacks", "en:chips-and-fries"] }).department).toBe("Snacks");
  });
  it("maps search phrases to nodes", () => {
    expect(findNodesForPhrase("noodles").map((p) => p[p.length - 1]).sort()).toEqual(["Cup Noodles", "Instant Noodles"]);
    expect(findNodesForPhrase("processed cheese")).toEqual([["Dairy", "Cheese", "Processed Cheese"]]);
    expect(findNodesForPhrase("cheese")).toEqual([["Dairy", "Cheese"]]);
    expect(findNodesForPhrase("zzzz")).toEqual([]);
  });
});

describe("product identity", () => {
  it("parses pack sizes", () => {
    expect(parsePack("200 g")).toMatchObject({ value: 200, unit: "g" });
    expect(parsePack("1 kg")).toMatchObject({ value: 1000, unit: "g" });
    expect(parsePack("1.5 L")).toMatchObject({ value: 1500, unit: "ml" });
    expect(parsePack("6 x 70 g")).toMatchObject({ value: 420 });
    expect(parsePack("no size")).toBeUndefined();
  });
  it("Amul Cheese 200 g and 1 kg are DIFFERENT products", () => {
    const a = { name: "Amul Processed Cheese", brand: "Amul", productType: "Processed Cheese", quantity: { value: 200, unit: "g" }, barcode: null };
    const b = { ...a, quantity: { value: 1000, unit: "g" } };
    expect(isSameProduct(a, b)).toBe(false);
    expect(identityKey(a)).not.toBe(identityKey(b));
  });
  it("same product from two sources is detected (case, accents, pack words)", () => {
    const a = { name: "AMUL Processed Cheese 200g", brand: "Amul", productType: "Processed Cheese", quantity: { value: 200, unit: "g" }, barcode: null };
    const b = { name: "Processed Cheese", brand: "Gujarat Cooperative Milk Marketing Federation", productType: "Processed Cheese", quantity: { value: 200, unit: "g" }, barcode: null };
    expect(normBrand(b.brand)).toBe("amul");
    expect(nameCore(a.name, a.brand)).toBe("processed cheese");
    expect(isSameProduct(a, b)).toBe(true);
  });
  it("different barcodes are different products, and Maggi variants never merge", () => {
    expect(isSameProduct({ name: "x", brand: "a", barcode: "1" }, { name: "x", brand: "a", barcode: "2" })).toBe(false);
    const n = { name: "Maggi Masala Noodles", brand: "Maggi", productType: "Instant Noodles", barcode: null };
    expect(isSameProduct(n, { ...n, name: "Maggi Cup Noodles", productType: "Cup Noodles" })).toBe(false);
    expect(isSameProduct(n, { ...n, name: "Maggi Atta Noodles" })).toBe(false);
  });
});

describe("enrich + status + merge", () => {
  const off = enrichProduct(base({ name: "Amul Processed Cheese", brand: "Amul", barcode: "8901262010030", nutrition: { calories: 300, protein: 20, sodium: 900, fat: 25, sugars: 2, saturatedFat: 15 } }), { isIndian: true, forceStatus: true });
  it("fills v2 fields and is active when brand+name+3 core nutrients exist", () => {
    expect(off).toMatchObject({ productType: "Processed Cheese", brandNorm: "amul", catalogStatus: "active" });
    expect(off.categoryPath).toEqual(["Dairy", "Cheese", "Processed Cheese"]);
    expect(off.searchTokens).toEqual(expect.arrayContaining(["amul", "cheese", "processed"]));
    expect(off.qualityScore).toBeGreaterThan(50);
  });
  it("non-Indian or incomplete products are not active", () => {
    expect(computeStatus(off, { isIndian: false })).toBe("hidden");
    expect(computeStatus({ ...off, nutrition: { calories: 1 } }, { isIndian: true })).toBe("needs_review");
    expect(computeStatus({ ...off, brand: undefined }, { isIndian: true })).toBe("needs_review");
  });
  it("higher-priority source wins; lower priority only fills gaps; agreement marks values corroborated", () => {
    const dataset = enrichProduct(base({ name: "Amul Processed Cheese", brand: "Amul", barcode: "8901262010030", source: { type: "dataset", confidence: 0.9, fetchedAt: new Date() }, nutrition: { calories: 305, protein: 21, sodium: 880, fat: 24 } }), { isIndian: true, forceStatus: true });
    const { merged, corroborated } = mergeProducts(off, dataset);
    expect(merged.source.type).toBe("dataset");
    expect(merged.nutrition.protein).toBe(21);          // dataset (higher priority) wins the conflict
    expect(merged.nutrition.saturatedFat).toBe(15);     // gap filled from OFF
    expect(corroborated).toEqual(expect.arrayContaining(["calories", "protein", "sodium"]));
    expect(merged.confidence?.nutrition).toBe("verified");
    expect(merged.sources!.map((s) => s.source).sort()).toEqual(["dataset", "openfoodfacts"]);
  });
  it("a lower-priority source never overwrites a value", () => {
    const user = enrichProduct(base({ name: "Amul Processed Cheese", brand: "Amul", barcode: "8901262010030", source: { type: "manual", confidence: 0.7, fetchedAt: new Date() }, nutrition: { protein: 99, fiber: 1 } }), { isIndian: true, forceStatus: true });
    const { merged } = mergeProducts(off, user);
    expect(merged.nutrition.protein).toBe(20); expect(merged.nutrition.fiber).toBe(1);
    expect(prio("dataset")).toBeGreaterThan(prio("openfoodfacts")); expect(prio("openfoodfacts")).toBeGreaterThan(prio("gemini"));
  });
});
