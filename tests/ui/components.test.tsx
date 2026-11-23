import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScoreGauge from "@/components/ScoreGauge";
import NutritionGrid from "@/components/NutritionGrid";
import CompareTable from "@/components/CompareTable";
import OcrField from "@/components/OcrField";
import ProductCard from "@/components/ProductCard";
import type { Product } from "@/lib/types";

const prod = (name: string, nutrition: Product["nutrition"]) => ({ id: name, name, nutrition, ingredients: [] } as unknown as Product & { id: string });

describe("UI components", () => {
  it("score gauge shows a score, and a dash with a clear label when there is none", () => {
    const { unmount } = render(<ScoreGauge score={63} band="moderate" />);
    expect(screen.getByRole("img", { name: /score 63 out of 100/i })).toBeTruthy(); unmount();
    render(<ScoreGauge score={null} band="insufficient" />);
    expect(screen.getByRole("img", { name: /not available/i })).toBeTruthy();
  });
  it("nutrition grid never crashes on missing fields and says 'Not available'", () => {
    render(<NutritionGrid nutrition={{ calories: 100 }} />);
    expect(screen.getByText("100 kcal")).toBeTruthy();
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(3);
  });
  it("comparison marks the winner and shows missing data", () => {
    const items = [{ id: "a", score: 80, product: prod("A", { sodium: 100 }) }, { id: "b", score: 40, product: prod("B", {}) }];
    render(<CompareTable items={items} winners={{ score: ["a"] }} />);
    expect(screen.getAllByLabelText("Best")).toHaveLength(1);
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
  });
  it("OCR field demands verification for low confidence", () => {
    render(<OcrField label="Sodium" unit="mg" value="620" confidence={0.4} onChange={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("Unable to confidently read sodium");
  });
  it("OCR field is calm for confident reads", () => {
    render(<OcrField label="Sodium" unit="mg" value="620" confidence={0.95} onChange={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("product card renders search result without image or brand", () => {
    render(<ProductCard item={{ id: "x", name: "Mystery Snack", score: null }} />);
    expect(screen.getByText("Mystery Snack")).toBeTruthy(); expect(screen.getByLabelText("No score")).toBeTruthy();
  });
});
