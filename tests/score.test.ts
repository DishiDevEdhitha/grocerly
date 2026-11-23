import { describe, it, expect } from "vitest";
import { computeScore } from "@/lib/score";
import { classifyIngredients, buildIndex, BASE_KNOWLEDGE, parseIngredientText } from "@/lib/ingredients";

const chips = { calories: 540, protein: 6, carbohydrates: 52, sugars: 3, fat: 33, saturatedFat: 14, fiber: 3, sodium: 900 };

describe("scoring engine", () => {
  it("is deterministic", () => {
    expect(computeScore({ nutrition: chips, profile: "chips_snacks" })).toEqual(computeScore({ nutrition: chips, profile: "chips_snacks" }));
  });
  it("penalises salty fatty chips and explains why", () => {
    const r = computeScore({ nutrition: chips, profile: "chips_snacks" });
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeLessThan(50);
    expect(r.warnings.map((w) => w.label.toLowerCase()).join()).toContain("sodium");
    expect(r.positives.some((p) => p.key === "fiber")).toBe(true);
  });
  it("rewards a healthy product", () => {
    const r = computeScore({ nutrition: { calories: 120, protein: 12, sugars: 1, fat: 2, saturatedFat: 0.5, sodium: 80, fiber: 7 }, profile: "default" });
    expect(r.score!).toBeGreaterThan(90); expect(r.band).toBe("better");
  });
  it("missing nutrients are NOT treated as zero (no bonus, no penalty, listed as missing)", () => {
    const r = computeScore({ nutrition: { calories: 300, sodium: 700, sugars: 3 }, profile: "default" });
    expect(r.missing).toEqual(expect.arrayContaining(["protein", "saturatedFat", "fat"]));
    expect(r.positives).toHaveLength(0);
  });
  it("refuses to score with too little data", () => {
    const r = computeScore({ nutrition: { sodium: 700 }, profile: "default" });
    expect(r.score).toBeNull(); expect(r.band).toBe("insufficient");
  });
  it("beverage profile punishes sugar more than default", () => {
    const n = { calories: 45, sugars: 10.6, sodium: 10, fat: 0, saturatedFat: 0, protein: 0 };
    expect(computeScore({ nutrition: n, profile: "beverage" }).score!).toBeLessThan(computeScore({ nutrition: n, profile: "default" }).score!);
  });
  it("ingredient risk lowers score, AI-sourced ingredients do not", () => {
    const idx = buildIndex(BASE_KNOWLEDGE);
    const insights = classifyIngredients(parseIngredientText("sugar, tartrazine, sodium nitrite"), idx);
    const base = computeScore({ nutrition: chips, profile: "default" }).score!;
    expect(computeScore({ nutrition: chips, profile: "default", ingredientInsights: insights }).score!).toBeLessThan(base);
    const ai = insights.map((i) => ({ ...i, source: "ai" as const }));
    expect(computeScore({ nutrition: chips, profile: "default", ingredientInsights: ai }).score).toBe(base);
  });
  it("score is always within 0..100", () => {
    const worst = computeScore({ nutrition: { calories: 900, sodium: 5000, sugars: 80, fat: 90, saturatedFat: 50, transFat: 10, protein: 0 }, profile: "default", nova: 4 });
    expect(worst.score!).toBeGreaterThanOrEqual(0); expect(worst.score!).toBeLessThanOrEqual(100);
  });
});
