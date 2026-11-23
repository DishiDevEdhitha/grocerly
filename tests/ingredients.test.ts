import { describe, it, expect } from "vitest";
import { parseIngredientText, classifyIngredients, buildIndex, BASE_KNOWLEDGE, detectAllergens } from "@/lib/ingredients";

describe("ingredient parser", () => {
  it("splits top-level, handles brackets and e-numbers", () => {
    const p = parseIngredientText("Ingredients: Refined Wheat Flour (Maida), Palm Oil, Salt, Emulsifier (322, 471), Acidity Regulator (E330).");
    const names = p.map((x) => x.name);
    expect(names).toContain("palm oil"); expect(names).toContain("salt");
    expect(p.some((x) => x.eNumber === "e322")).toBe(true);
    expect(p.some((x) => x.eNumber === "e330")).toBe(true);
  });
  it("classifies known ingredients and leaves unknown ones unclassified", () => {
    const out = classifyIngredients(parseIngredientText("maltodextrin, tartrazine, dragon fruit extract"), buildIndex(BASE_KNOWLEDGE));
    expect(out.find((i) => i.name === "maltodextrin")?.source).toBe("knowledge_base");
    expect(out.find((i) => i.name.includes("dragon"))?.source).toBe("unclassified");
  });
});

describe("allergen engine", () => {
  const mk = (ing: string[], declared: string[] = [], traces: string[] = []) => ({ ingredients: ing, allergens: { declared, traces } });
  it("separates contains / derived / may contain", () => {
    const r = detectAllergens(mk(["wheat flour", "whey", "soy lecithin"], [], ["en:peanuts"]));
    const lvl = (a: string) => r.findings.find((f) => f.allergen === a)?.level;
    expect(lvl("wheat")).toBe("contains"); expect(lvl("gluten")).toBe("contains");
    expect(lvl("milk")).toBe("derived"); expect(lvl("soy")).toBe("derived");
    expect(lvl("peanuts")).toBe("may_contain");
  });
  it("does not claim allergens without evidence", () => {
    const r = detectAllergens(mk(["potato", "palm oil", "salt"]));
    expect(r.known).toBe(true); expect(r.findings).toHaveLength(0);
  });
  it("reports unknown when there is no data at all", () => { expect(detectAllergens(mk([])).known).toBe(false); });
  it("flags source-unspecified lecithin as unknown, not contains", () => {
    expect(detectAllergens(mk(["lecithin"])).findings[0]).toMatchObject({ allergen: "soy", level: "unknown" });
  });
  it("uses declared allergen tags", () => { expect(detectAllergens(mk([], ["en:milk"])).findings[0]).toMatchObject({ allergen: "milk", level: "contains" }); });
});
