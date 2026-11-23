import { describe, it, expect } from "vitest";
import { rankAlternatives, parsePrefs, DEFAULT_PREFERENCES, type Candidate } from "@/lib/ranking";
import { bestPerMetric } from "@/lib/compare";
import type { Product } from "@/lib/types";

const mk = (id: string, nutrition: Product["nutrition"], score: number | null, price?: number): Candidate => ({ id, score, product: { name: id, nutrition, price: price ? { value: price, currency: "INR" } : undefined } as Product });
const cur = mk("cur", { sodium: 900, sugars: 10, protein: 4, calories: 500, fiber: 1 }, 40, 50);
const better = mk("better", { sodium: 500, sugars: 6, protein: 9, calories: 420, fiber: 4 }, 70, 60);
const worse = mk("worse", { sodium: 1200, sugars: 20, protein: 2, calories: 600, fiber: 0 }, 20, 40);

describe("alternatives ranking", () => {
  it("returns only better products, best first, with reasons", () => {
    const r = rankAlternatives(cur, [worse, better], DEFAULT_PREFERENCES);
    expect(r.map((x) => x.id)).toEqual(["better"]);
    expect(r[0].reasons.join(" ")).toContain("30 points higher");
    expect(r[0].reasons.join(" ")).toMatch(/less sodium/);
    expect(r[0].reasons.join(" ")).toMatch(/more protein/);
  });
  it("user priorities change the ranking", () => {
    const cheapish = mk("cheap", { sodium: 800, sugars: 9, protein: 5, calories: 480, fiber: 1 }, 45, 20);
    const byScore = rankAlternatives(cur, [better, cheapish], { score: 100 });
    const byPrice = rankAlternatives(cur, [better, cheapish], { price: 100 });
    expect(byScore[0].id).toBe("better"); expect(byPrice[0].id).toBe("cheap");
  });
  it("ignores candidates that lack the prioritised data instead of assuming zero", () => {
    const nodata = mk("nodata", {}, null);
    expect(rankAlternatives(cur, [nodata], DEFAULT_PREFERENCES)).toHaveLength(0);
  });
  it("parses preference strings safely", () => {
    expect(parsePrefs("score:40,protein:30,evil:99,sodium:abc")).toEqual({ score: 40, protein: 30 });
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("comparison", () => {
  it("marks the best product per metric; missing values never win", () => {
    const w = bestPerMetric([cur, better, mk("x", {}, null)]);
    expect(w.score).toEqual(["better"]); expect(w.sodium).toEqual(["better"]); expect(w.protein).toEqual(["better"]);
    expect(w.price).toEqual(["cur"]);
  });
});
