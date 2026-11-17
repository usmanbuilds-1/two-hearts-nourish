import { describe, expect, it } from "vitest";
import { normalizeFdcFood, scoreFoodCandidate, scaleUsda } from "./usda-food.server";

describe("USDA grounding", () => {
  it("requires meaningful lexical overlap", () => {
    expect(scoreFoodCandidate("chicken breast", "Chicken breast, roasted")).toBeGreaterThan(0.5);
    expect(scoreFoodCandidate("chicken breast", "Chocolate cake")).toBe(0);
  });

  it("normalizes a complete FDC result and scales per 100g values", () => {
    const match = normalizeFdcFood({
      fdcId: 123,
      description: "Chicken breast, roasted",
      dataType: "Foundation",
      foodNutrients: [
        { nutrientName: "Energy", value: 165 },
        { nutrientName: "Protein", value: 31 },
        { nutrientName: "Carbohydrate, by difference", value: 0 },
        { nutrientName: "Total lipid (fat)", value: 3.6 },
      ],
    }, "chicken breast");
    expect(match).not.toBeNull();
    expect(scaleUsda(match!, 150)).toEqual({ calories: 248, protein: 46.5, carbs: 0, fat: 5.4 });
  });
});
