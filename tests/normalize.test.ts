import { describe, it, expect } from "vitest";
import { normalizeOffProduct, parseQuantity } from "@/lib/normalize";

const off = { code: "4006381333931", product_name: "Instant Noodles", brands: "Maggi, Nestle", categories_tags: ["en:meals", "en:instant-noodles"], quantity: "70 g",
  ingredients_text: "Noodles (wheat flour, palm oil), salt, flavour enhancer (621)", allergens_tags: ["en:gluten"], traces_tags: ["en:milk"],
  nutriments: { "energy-kcal_100g": 430, proteins_100g: 9, carbohydrates_100g: 60, sugars_100g: 2, fat_100g: 17, "saturated-fat_100g": 8, salt_100g: 3.75, fiber_100g: "2.5" }, nova_group: 4 };

describe("Open Food Facts normaliser", () => {
  it("maps to the Grocerly schema with correct units", () => {
    const { product } = normalizeOffProduct(off);
    expect(product).toMatchObject({ barcode: "4006381333931", name: "Instant Noodles", brand: "Maggi", profile: "noodles", nova: 4 });
    expect(product!.nutrition.sodium).toBeCloseTo(1500);   // salt 3.75 g -> 1500 mg sodium
    expect(product!.nutrition.fiber).toBe(2.5);
    expect(product!.quantity).toEqual({ value: 70, unit: "g" });
    expect(product!.source.type).toBe("openfoodfacts");
  });
  it("leaves missing nutrition fields absent (not zero)", () => {
    const { product } = normalizeOffProduct({ ...off, nutriments: { "energy-kcal_100g": 100 } });
    expect(product!.nutrition).toEqual({ calories: 100 });
    expect("protein" in product!.nutrition).toBe(false);
  });
  it("rejects invalid barcodes and nameless products", () => {
    expect(normalizeOffProduct({ ...off, code: "123" }).product).toBeNull();
    expect(normalizeOffProduct({ ...off, product_name: " " }).issues.join()).toContain("no name");
  });
  it("parses quantities", () => { expect(parseQuantity("1.5 L")).toEqual({ value: 1500, unit: "ml" }); expect(parseQuantity("2 kg")).toEqual({ value: 2000, unit: "g" }); });
});
