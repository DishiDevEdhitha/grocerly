import { describe, it, expect } from "vitest";
import { parseCsv, csvToObjects } from "@/lib/csv";
import { mapHeaders, rowToProduct, describeMap } from "@/lib/dataset-mapper";
import { validateForImport, mergeStats, emptyStats } from "@/lib/importer";
import { validateExtraction, numbersIn } from "@/lib/gemini-label";
import { validateImagePayload, sniffMime } from "@/lib/image-server";
import { laplacianVariance, meanBrightness, assessQuality } from "@/lib/image-quality";
import { parseProductLink } from "@/lib/links";
import { enrichProduct } from "@/lib/catalogue";
import type { Product } from "@/lib/types";

describe("csv parser", () => {
  it("handles quotes, commas, escaped quotes, newlines inside cells and BOM", () => {
    const t = '\uFEFFName,Notes\n"Salt, iodised","He said ""hi"""\n"Multi\nline",x\n';
    expect(parseCsv(t)).toEqual([["Name", "Notes"], ["Salt, iodised", 'He said "hi"'], ["Multi\nline", "x"]]);
    expect(csvToObjects("a,b\n1,2").rows).toEqual([{ a: "1", b: "2" }]);
  });
});

const HEAD = ["Product Name", "Brand", "Category", "Sub-category", "Barcode", "Ingredients", "Pack Size", "Serving Size (g)", "MRP (Rs)", "Energy (kcal) per 100 g", "Protein (g) per 100 g", "Total Fat (g) per 100 g", "Saturated Fat (g) per 100 g", "Total Sugar (g) per 100 g", "Sodium (mg) per 100 g", "Dietary Fibre (g)"];
describe("dataset column mapper + row conversion", () => {
  const map = mapHeaders(HEAD);
  it("detects columns and basis from headers", () => {
    expect(map.name).toBe("Product Name"); expect(map.brand).toBe("Brand"); expect(map.serving).toBe("Serving Size (g)"); expect(map.price).toBe("MRP (Rs)");
    const by = Object.fromEntries(map.nutrients.map((n) => [n.key, n]));
    expect(by.calories).toMatchObject({ basis: "per100" }); expect(by.saturatedFat.key).toBe("saturatedFat"); expect(by.sugars.header).toContain("Sugar");
    expect(by.fiber.basis).toBe("unspecified");
    expect(describeMap(map)).toContain("Detected columns");
  });
  const opts = { basis: "auto" as const, sourceRef: "t", sourceUrl: "u", sourceName: "DS", license: "CC BY 4.0" };
  it("builds a normalised product with provenance and keeps per-100 values", () => {
    const r = rowToProduct({ "Product Name": "Amul Processed Cheese", Brand: "Amul", Category: "Dairy", "Sub-category": "Cheese", Barcode: "8901262010030", Ingredients: "Cheese, salt, emulsifier (331)", "Pack Size": "200 g", "Serving Size (g)": "20", "MRP (Rs)": "125", "Energy (kcal) per 100 g": "300", "Protein (g) per 100 g": "20", "Total Fat (g) per 100 g": "25", "Saturated Fat (g) per 100 g": "15", "Total Sugar (g) per 100 g": "2", "Sodium (mg) per 100 g": "900", "Dietary Fibre (g)": "" }, map, opts);
    expect(r.product!).toMatchObject({ barcode: "8901262010030", productType: "Processed Cheese", price: { value: 125, currency: "INR" }, catalogStatus: "active" });
    expect(r.product!.quantity).toEqual({ value: 200, unit: "g" }); expect(r.product!.servingSize).toMatchObject({ value: 20, unit: "g" });
    expect(r.product!.sources![0]).toMatchObject({ source: "dataset", license: "CC BY 4.0" });
    expect(r.product!.nutrition.fiber).toBeUndefined();
  });
  it("rejects impossible values instead of storing them (negative, text)", () => {
    const r = rowToProduct({ "Product Name": "Test Snack", Brand: "B", "Protein (g) per 100 g": "-20", "Sodium (mg) per 100 g": "very salty", "Energy (kcal) per 100 g": "400" }, map, opts);
    expect(r.reasons).toEqual(expect.arrayContaining(["negative_protein", "non_numeric_sodium"]));
    expect(r.product!.nutrition).toEqual({ calories: 400 });
  });
  it("never mixes per-serving with per-100 g: ambiguous columns are skipped unless a basis is given", () => {
    const m2 = mapHeaders(["Name", "Brand", "Serving Size", "Protein (g)", "Energy (kcal)"]);
    const row = { Name: "Test Bar", Brand: "B", "Serving Size": "30 g", "Protein (g)": "6", "Energy (kcal)": "150" };
    const skipped = rowToProduct(row, m2, opts); expect(skipped.reasons).toContain("nutrition_basis_unknown"); expect(skipped.product!.nutrition).toEqual({});
    const asServing = rowToProduct(row, m2, { ...opts, basis: "perServing" });
    expect(asServing.product!.nutrition.protein).toBeCloseTo(20); expect(asServing.product!.nutritionPerServing!.protein).toBe(6);
    const as100 = rowToProduct(row, m2, { ...opts, basis: "per100" }); expect(as100.product!.nutrition.protein).toBe(6);
  });
  it("rows without a name are invalid", () => { expect(rowToProduct({ "Product Name": "", Brand: "x" }, map, opts)).toMatchObject({ product: null, reasons: ["no_name"] }); });
});

const prod = (o: Partial<Product>): Product => enrichProduct({ barcode: null, name: "Parle G", brand: "Parle", category: "c", categoryTags: [], profile: "default", nutritionBasis: { amount: 100, unit: "g" }, nutrition: { calories: 450, protein: 7, fat: 12, sugars: 24 }, ingredients: ["wheat flour"], allergens: { declared: [], traces: [] }, images: {}, source: { type: "dataset", confidence: 0.9, fetchedAt: new Date() }, createdAt: new Date(), updatedAt: new Date(), ...o }, { isIndian: true, forceStatus: true });
describe("import validation", () => {
  it("drops inconsistent values and keeps the record", () => {
    const stats = emptyStats();
    const v = validateForImport(prod({ nutrition: { calories: 450, fat: 5, saturatedFat: 12, protein: 7 } }), stats);
    expect(v.ok).toBe(true); expect(v.product.nutrition.saturatedFat).toBeUndefined(); expect(stats.droppedValues).toBe(1);
  });
  it("rejects nameless or brand-less-and-barcode-less records", () => {
    expect(validateForImport(prod({ name: "ab" })).ok).toBe(false);
    expect(validateForImport(prod({ brand: undefined, barcode: null })).reasons).toContain("no_brand_and_no_barcode");
  });
  it("statistics add up", () => { const a = emptyStats(); a.inserted = 2; a.reasons.x = 1; const b = emptyStats(); b.inserted = 3; b.reasons.x = 2; const m = mergeStats(a, b); expect(m.inserted).toBe(5); expect(m.reasons.x).toBe(3); });
});

describe("Gemini output validation (anti-hallucination)", () => {
  const good = { productName: "Test Chips", brand: "Acme", quantityText: "52 g", servingSizeText: "26 g", ingredientsText: "Potato, palm oil, salt, maltodextrin", allergensDeclared: ["Soy"], vegetarianMark: "veg", nutrition: [
    { nutrient: "calories", value: 540, unit: "kcal", basis: "per_100", rawText: "Energy 540 kcal" },
    { nutrient: "sodium", value: 620, unit: "mg", basis: "per_100", rawText: "Sodium 620 mg" },
    { nutrient: "protein", value: 6.2, unit: "g", basis: "per_100", rawText: "Protein 6.2 g" }] };
  it("accepts verified rows, converts, and caps confidence", () => {
    const x = validateExtraction(good);
    expect(x.nutritionPer100).toEqual({ calories: 540, sodium: 620, protein: 6.2 }); expect(x.basis).toBe("per100");
    expect(x.fields.sodium!.confidence).toBeLessThanOrEqual(0.85); expect(x.vegetarian).toBe(true); expect(x.allergens).toEqual(["soy"]); expect(x.ingredients).toContain("palm oil");
  });
  it("drops a number that is NOT in the text the model says it read", () => {
    const x = validateExtraction({ ...good, nutrition: [{ nutrient: "sodium", value: 999, unit: "mg", basis: "per_100", rawText: "Sodium 620 mg" }] });
    expect(x.nutritionPer100).toEqual({}); expect(x.dropped[0].reason).toBe("not_verifiable_against_label_text");
  });
  it("null / negative / unknown nutrient / bad unit rows are dropped, never zeroed", () => {
    const x = validateExtraction({ nutrition: [{ nutrient: "fat", value: null, unit: "g", basis: "per_100", rawText: "" }, { nutrient: "protein", value: -3, unit: "g", basis: "per_100", rawText: "Protein -3 g" }, { nutrient: "magic", value: 1, unit: "g", basis: "per_100", rawText: "1" }, { nutrient: "fat", value: 5, unit: "parsec", basis: "per_100", rawText: "Fat 5 parsec" }], allergensDeclared: [], vegetarianMark: "none" });
    expect(x.nutritionPer100).toEqual({}); expect(x.dropped.map((d) => d.reason)).toEqual(["no_valid_value", "no_valid_value", "unknown_nutrient", "bad_unit"]);
    expect(x.warnings.join(" ")).toContain("difficult to read");
  });
  it("converts salt to sodium and per-serving to per-100 using the serving size", () => {
    const x = validateExtraction({ servingSizeText: "25 g", allergensDeclared: [], vegetarianMark: "none", nutrition: [{ nutrient: "salt", value: 0.5, unit: "g", basis: "per_serving", rawText: "Salt 0.5 g" }, { nutrient: "protein", value: 2.5, unit: "g", basis: "per_serving", rawText: "Protein 2.5 g" }] });
    expect(x.basis).toBe("perServing"); expect(x.nutritionPer100.protein).toBeCloseTo(10); expect(x.nutritionPer100.sodium).toBeCloseTo(800); expect(x.nutritionPerServing!.protein).toBe(2.5);
  });
  it("unknown basis is held back for the user to decide", () => {
    const x = validateExtraction({ allergensDeclared: [], vegetarianMark: "none", nutrition: [{ nutrient: "protein", value: 8, unit: "g", basis: "unknown", rawText: "Protein 8 g" }] });
    expect(x.nutritionPer100).toEqual({}); expect(x.nutritionUnknownBasis).toEqual({ protein: 8 });
  });
  it("flags cross-field inconsistencies for verification", () => {
    const x = validateExtraction({ allergensDeclared: [], vegetarianMark: "none", nutrition: [{ nutrient: "fat", value: 5, unit: "g", basis: "per_100", rawText: "Fat 5 g" }, { nutrient: "saturatedFat", value: 12, unit: "g", basis: "per_100", rawText: "Saturated Fat 12 g" }] });
    expect(x.fields.saturatedFat!.needsVerification).toBe(true); expect(x.warnings.join(" ")).toContain("Saturated fat is higher");
  });
  it("survives garbage output", () => { expect(validateExtraction(null).nutritionPer100).toEqual({}); expect(validateExtraction("nope").ingredients).toEqual([]); expect(numbersIn("Sodium 1,5 g")).toEqual([1.5]); });
});

describe("upload validation", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]).toString("base64");
  it("accepts real images by signature", () => { const r = validateImagePayload([{ data: jpeg }, { data: `data:image/png;base64,${png}` }]); expect(r.ok).toBe(true); if (r.ok) expect(r.images.map((i) => i.mime)).toEqual(["image/jpeg", "image/png"]); });
  it("rejects wrong types, bad base64, too many, too large, none", () => {
    expect(validateImagePayload([{ data: Buffer.from("<?php echo 1;").toString("base64") }])).toMatchObject({ ok: false, code: "unsupported_type" });
    expect(validateImagePayload([{ data: "%%%not-base64%%%" }])).toMatchObject({ ok: false, code: "invalid_image" });
    expect(validateImagePayload([{ data: jpeg }, { data: jpeg }, { data: jpeg }, { data: jpeg }])).toMatchObject({ ok: false, code: "too_many_images" });
    expect(validateImagePayload([{ data: jpeg + "A".repeat(3_500_000) }, { data: jpeg + "A".repeat(600_000) }])).toMatchObject({ ok: false, code: "too_large" });
    expect(validateImagePayload([])).toMatchObject({ ok: false, code: "no_images" }); expect(validateImagePayload("x")).toMatchObject({ ok: false });
    expect(sniffMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("image quality (browser pre-check)", () => {
  const W = 40, H = 40;
  const flat = new Uint8ClampedArray(W * H).fill(120);
  const checker = new Uint8ClampedArray(W * H).map((_, i) => ((Math.floor(i / W) + (i % W)) % 2 ? 230 : 20));
  it("sharp image has high Laplacian variance, flat has none", () => { expect(laplacianVariance(checker, W, H)).toBeGreaterThan(1000); expect(laplacianVariance(flat, W, H)).toBe(0); });
  it("blocks blank/black images with the helpful message, warns on dark/blurry, passes good ones", () => {
    const blank = assessQuality({ blur: 0, brightness: 120, width: 1200, height: 900 }); expect(blank.level).toBe("block"); expect(blank.issues.join(" ")).toContain("difficult to read");
    expect(assessQuality({ blur: 200, brightness: 5, width: 1200, height: 900 }).level).toBe("block");
    expect(assessQuality({ blur: 25, brightness: 120, width: 1200, height: 900 }).level).toBe("warn");
    expect(assessQuality({ blur: 200, brightness: 120, width: 300, height: 300 }).level).toBe("warn");
    expect(assessQuality({ blur: 200, brightness: meanBrightness(checker), width: 1200, height: 900 }).level).toBe("ok");
  });
});

describe("product links (no scraping, safe parsing)", () => {
  it("extracts product names from retailer-style links", () => {
    const b = parseProductLink("https://blinkit.com/prn/amul-processed-cheese-slices/prid/12345");
    expect(b).toMatchObject({ ok: true, retailer: "blinkit", query: "amul processed cheese slices" });
    const z = parseProductLink("https://www.zeptonow.com/pn/maggi-2-minute-masala-noodles-280-g/pvid/8f2b1c3a-1111-4222-8333-444455556666?utm=x");
    expect(z).toMatchObject({ ok: true, retailer: "zepto" }); expect(z.query).toContain("maggi 2 minute masala noodles");
    expect(z.url).not.toContain("utm");
  });
  it("rejects unsafe or useless links", () => {
    for (const bad of ["http://blinkit.com/prn/x-y/prid/1", "https://localhost/prn/amul-cheese/prid/1", "https://192.168.0.10/amul-cheese", "https://user:pw@blinkit.com/prn/amul-cheese/prid/1", "https://blinkit.com:8443/prn/amul-cheese/prid/1", "javascript:alert(1)", "not a url", "", "https://blinkit.com/"]) expect(parseProductLink(bad).ok).toBe(false);
  });
  it("labels unknown shops as 'other' (name lookup only, no buy link)", () => { expect(parseProductLink("https://example.com/p/britannia-cheese-slices-200g")).toMatchObject({ ok: true, retailer: "other" }); });
});
