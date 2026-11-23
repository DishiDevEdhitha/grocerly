import { describe, it, expect } from "vitest";
import { parseNutritionLines, convertUnit, fixDigits } from "@/lib/nutrition";

const L = (...t: string[]) => t.map((text) => ({ text, confidence: 0.9 }));

describe("units", () => {
  it("converts mg/g/kJ", () => {
    expect(convertUnit(1, "g", "sodium")).toBe(1000);
    expect(convertUnit(620, "mg", "protein")).toBeCloseTo(0.62);
    expect(convertUnit(2092, "kJ", "calories")!).toBeCloseTo(500, 0);
    expect(convertUnit(5, "parsec", "protein")).toBeNull();
  });
  it("fixes O/0 OCR confusions", () => { expect(fixDigits("Protein 1O.5 g")).toContain("10.5"); });
});

describe("nutrition label parser", () => {
  it("reads a per-100g table", () => {
    const r = parseNutritionLines(L("Nutrition Facts per 100 g", "Energy 520 kcal / 2174 kJ", "Protein 6.2 g", "Total Carbohydrate 58 g", "of which Sugars 4 g", "Total Fat 28 g", "Saturated Fat 12 g", "Trans Fat 0 g", "Dietary Fibre 3 g", "Sodium 620 mg"));
    expect(r.basis.kind).toBe("per100");
    expect(r.fields.calories?.value).toBe(520);
    expect(r.fields.fat?.value).toBe(28);           // not confused with saturated fat
    expect(r.fields.saturatedFat?.value).toBe(12);
    expect(r.fields.sugars?.value).toBe(4);
    expect(r.fields.sodium).toMatchObject({ value: 620, unit: "mg" });
  });
  it("converts salt to sodium and kJ to kcal", () => {
    const r = parseNutritionLines(L("per 100g", "Energy 1046 kJ", "Salt 1.5 g"));
    expect(r.fields.calories?.value).toBeCloseTo(250, 0);
    expect(r.fields.sodium?.value).toBeCloseTo(600, 0);
  });
  it("converts per-serving to per-100g", () => {
    const r = parseNutritionLines(L("Serving size 30 g", "Protein 6 g", "Sodium 150 mg"));
    expect(r.basis).toMatchObject({ kind: "perServing", servingSize: 30 });
    expect(r.fields.protein?.value).toBeCloseTo(20); expect(r.fields.sodium?.value).toBeCloseTo(500);
  });
  it("flags low-confidence reads for verification", () => {
    const r = parseNutritionLines([{ text: "per 100 g", confidence: 0.9 }, { text: "Sodium 62O mg", confidence: 0.41 }]);
    expect(r.fields.sodium?.value).toBe(620);
    expect(r.fields.sodium?.needsVerification).toBe(true);
    expect(r.lowConfidence).toContain("sodium");
    expect(r.warnings.join(" ")).toContain("Unable to confidently read sodium");
  });
  it("flags inconsistent values", () => {
    const r = parseNutritionLines(L("per 100 g", "Total Fat 5 g", "Saturated Fat 12 g"));
    expect(r.warnings.join(" ")).toContain("Saturated fat is higher");
    expect(r.fields.saturatedFat?.needsVerification).toBe(true);
  });
  it("returns nothing (not zeros) for garbage", () => {
    const r = parseNutritionLines(L("Best before: 12/2026", "Mfg. by ABC Foods"));
    expect(Object.keys(r.fields)).toHaveLength(0); expect(r.warnings.length).toBeGreaterThan(0);
  });
});
