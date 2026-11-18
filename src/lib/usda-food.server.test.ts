import { describe, expect, it } from "vitest";
import { foodEnergyKcal, normalizeFdcFood, scoreFoodCandidate, scaleUsda } from "./usda-food.server";

describe("USDA grounding", () => {
  it("never treats FDC kJ values as kcal", () => {
    expect(foodEnergyKcal({
      foodNutrients: [
        { nutrientName: "Energy", unitName: "kJ", value: 690.36 },
        { nutrientName: "Energy", unitName: "kcal", value: 165 },
      ],
    })).toBe(165);
    expect(foodEnergyKcal({
      foodNutrients: [{ nutrientName: "Energy", unitName: "kJ", value: 690.36 }],
    })).toBeCloseTo(165, 1);
    expect(foodEnergyKcal({
      foodNutrients: [{ nutrientName: "Energy", value: 690.36 }],
    })).toBeNull();
  });
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
        { nutrientName: "Energy", unitName: "kJ", value: 690.36 },
        { nutrientName: "Energy", unitName: "kcal", value: 165 },
        { nutrientName: "Protein", value: 31 },
        { nutrientName: "Carbohydrate, by difference", value: 0 },
        { nutrientName: "Total lipid (fat)", value: 3.6 },
      ],
    }, "chicken breast");
    expect(match).not.toBeNull();
    expect(scaleUsda(match!, 150)).toEqual({ calories: 248, protein: 46.5, carbs: 0, fat: 5.4 });
  });
});
