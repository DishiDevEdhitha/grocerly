import { describe, it, expect } from "vitest";
import { classifyNutrient, classifyAll, keyIndicators } from "@/lib/levels";
import { parseIntent, relevance, buildChips, sortCandidates, tokenizeQuery } from "@/lib/search-core";
import { rankSimilar } from "@/lib/similar";
import type { Product } from "@/lib/types";

describe("nutrient levels", () => {
  it("classifies limit nutrients with the reference text", () => {
    expect(classifyNutrient("sugars", 3)!.label).toBe("LOW");
    expect(classifyNutrient("sugars", 12)!.label).toBe("MODERATE");
    const hi = classifyNutrient("sugars", 30)!; expect(hi.label).toBe("HIGH"); expect(hi.tone).toBe("bad");
    expect(hi.referenceText).toContain("per 100 g"); expect(hi.range.source).toContain("FSA");
  });
  it("sodium uses the FSSAI-proposal high threshold (250 mg)", () => {
    expect(classifyNutrient("sodium", 250)!.label).toBe("MODERATE");
    expect(classifyNutrient("sodium", 251)!.label).toBe("HIGH");
    expect(classifyNutrient("sodium", 100)!.label).toBe("LOW");
  });
  it("benefit nutrients read GOOD / MODERATE / LOW", () => {
    expect(classifyNutrient("fiber", 3)!.label).toBe("GOOD");
    expect(classifyNutrient("protein", 8)!.label).toBe("MODERATE");
    expect(classifyNutrient("protein", 2)!.label).toBe("LOW");
  });
  it("liquids use per-100 ml thresholds", () => {
    expect(classifyNutrient("sugars", 10.6, "g")!.label).toBe("MODERATE");
    expect(classifyNutrient("sugars", 10.6, "ml")!.label).toBe("MODERATE");
    expect(classifyNutrient("sugars", 12, "ml")!.label).toBe("HIGH");
  });
  it("missing values and unclassified nutrients return null, never zero", () => {
    expect(classifyNutrient("sugars", undefined)).toBeNull();
    expect(classifyNutrient("carbohydrates", 50)).toBeNull();
    expect(classifyAll({})).toEqual({});
  });
  it("card indicators are at most 3", () => { expect(keyIndicators({ sodium: 900, sugars: 2, fat: 20, protein: 9, saturatedFat: 8 }).length).toBe(3); });
});

const brands = ["maggi", "amul", "britannia", "mother dairy", "go"];
describe("search understanding", () => {
  it("handles spelling and plurals", () => { expect(tokenizeQuery("Maggie Nodles")).toEqual(["maggi", "noodle"]); });
  it("maggi -> brand only", () => { const i = parseIntent("maggi", brands); expect(i.brand).toBe("maggi"); expect(i.nodes).toEqual([]); expect(i.freeTokens).toEqual([]); });
  it("maggi noodles -> brand + noodle categories", () => { const i = parseIntent("maggi noodles", brands); expect(i.brand).toBe("maggi"); expect(i.nodeNames).toEqual(expect.arrayContaining(["Instant Noodles", "Cup Noodles"])); });
  it("cheese -> category, not a brand", () => { const i = parseIntent("cheese", brands); expect(i.brand).toBeUndefined(); expect(i.nodeNames).toContain("Cheese"); });
  it("processed cheese -> only that type", () => { expect(parseIntent("processed cheese", brands).nodeNames).toEqual(["Processed Cheese"]); });
  it("amul cheese -> brand + category; multi-word brand works", () => { const i = parseIntent("amul cheese", brands); expect(i.brand).toBe("amul"); expect(i.nodeNames).toContain("Cheese"); expect(parseIntent("mother dairy milk", brands).brand).toBe("mother dairy"); });
  it("unknown words become free tokens", () => { expect(parseIntent("oreo", brands).freeTokens).toEqual(["oreo"]); });
  it("brand + exact type outranks brand-only and other types", () => {
    const i = parseIntent("maggi noodles", brands);
    const noodles = { id: "1", name: "Maggi Masala Noodles", brandNorm: "maggi", productType: "Instant Noodles", categoryPath: ["Instant Foods", "Instant Noodles"], qualityScore: 70 };
    const sauce = { id: "2", name: "Maggi Ketchup", brandNorm: "maggi", productType: "Ketchup", categoryPath: ["Sauces & Condiments", "Ketchup"], qualityScore: 90 };
    expect(relevance(noodles, i)).toBeGreaterThan(relevance(sauce, i));
  });
  it("chips come from the matched data, with counts", () => {
    const chips = buildChips([{ productType: "Cup Noodles" }, { productType: "Instant Noodles" }, { productType: "Instant Noodles" }, { productType: "Uncategorised" }]);
    expect(chips).toEqual([{ label: "Instant Noodles", count: 2 }, { label: "Cup Noodles", count: 1 }]);
  });
  it("sorting puts missing metrics last (never treated as zero)", () => {
    const items = [{ relevance: 1, score: null, nutrition: {} }, { relevance: 1, score: 40, nutrition: { sodium: 500 } }, { relevance: 1, score: 80, nutrition: { sodium: 100 } }];
    expect(sortCandidates(items, "score").map((x) => x.score)).toEqual([80, 40, null]);
    expect(sortCandidates(items, "sodium").map((x) => x.nutrition.sodium)).toEqual([100, 500, undefined]);
  });
});

const P = (o: Partial<Product>) => ({ name: "n", brandNorm: "x", categoryPath: ["Dairy", "Cheese", "Processed Cheese"], productType: "Processed Cheese", profile: "default", nutrition: { calories: 1, protein: 1, fat: 1, sodium: 1 }, quantity: { value: 200, unit: "g" }, barcode: null, ...o } as unknown as Product);
describe("comparison candidates", () => {
  const base = P({ brandNorm: "amul", name: "Amul Processed Cheese", barcode: "1" });
  it("prefers same type + different brands, excludes unrelated categories and sparse data", () => {
    const c = [
      { id: "a", score: 70, product: P({ brandNorm: "britannia", name: "Britannia Processed Cheese", barcode: "2" }) },
      { id: "b", score: 60, product: P({ brandNorm: "amul", name: "Amul Cheese Slices", productType: "Cheese Slices", barcode: "3" }) },
      { id: "c", score: 80, product: P({ brandNorm: "maggi", categoryPath: ["Instant Foods", "Instant Noodles"], productType: "Instant Noodles", barcode: "4" }) },
      { id: "d", score: 50, product: P({ brandNorm: "go", nutrition: { calories: 1 }, barcode: "5" }) },
      { id: "e", score: null, product: P({ brandNorm: "milky", barcode: "6" }) },
      { id: "f", score: 55, product: P({ brandNorm: "amul", name: "Amul Processed Cheese", barcode: "1" }) },
    ];
    const r = rankSimilar(base, c);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("does not compare Amul 200 g with Amul 1 kg as 'the same product'", () => {
    const big = { id: "z", score: 60, product: P({ brandNorm: "amul", name: "Amul Processed Cheese", quantity: { value: 1000, unit: "g" }, barcode: null }) };
    const noBc = P({ brandNorm: "amul", name: "Amul Processed Cheese", barcode: null, brand: "Amul" });
    expect(rankSimilar({ ...noBc, brand: "Amul" } as Product, [big]).length).toBe(1);
  });
  it("limits to two per brand", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, score: 60 + i, product: P({ brandNorm: "go", name: `Go cheese ${i}`, barcode: `9${i}` }) }));
    expect(rankSimilar(base, many).length).toBe(2);
  });
});
