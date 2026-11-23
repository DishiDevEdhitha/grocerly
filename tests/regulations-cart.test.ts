import { describe, it, expect } from "vitest";
import { evaluateRegulations, SEED_REGULATIONS } from "@/lib/regulations";
import { extractCartItems } from "@/lib/cart";
import type { IngredientInsight, RegulationRecord } from "@/lib/types";

const ing = (name: string): IngredientInsight => ({ name, category: "x", type: "x", riskLevel: "none", explanation: "", source: "knowledge_base", confidence: 1 });
const recs = SEED_REGULATIONS as RegulationRecord[];

describe("regulation engine", () => {
  it("never reports 'allowed' from missing data", () => {
    const r = evaluateRegulations([ing("salt"), ing("sugar")], recs);
    expect(r.every((c) => c.status === "unknown")).toBe(true);
    expect(r[0].summary).toMatch(/insufficient verified regulatory data/i);
  });
  it("rolls up banned/restricted per country", () => {
    const r = evaluateRegulations([ing("potassium bromate (e924)")], recs);
    const by = Object.fromEntries(r.map((c) => [c.country, c.status]));
    expect(by).toMatchObject({ IN: "banned", GB: "banned", US: "restricted", AU: "unknown" });
    expect(r.find((c) => c.country === "IN")!.details[0]).toMatchObject({ authority: "FSSAI", verification: "seed-unverified", verifiedAt: null });
  });
});

describe("cart screenshot parsing", () => {
  it("keeps product-like lines and drops prices/buttons", () => {
    const items = extractCartItems(["My Cart", "Maggi 2-minute Masala Noodles 70 g", "₹14.00", "Qty: 2", "Remove", "Lay's Classic Salted Chips 52 g - Pack of 3", "Subtotal ₹120", "Lay's Classic Salted Chips 52 g - Pack of 3"]);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Maggi");
  });
});
