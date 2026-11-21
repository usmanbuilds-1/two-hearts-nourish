import { describe, expect, it } from "vitest";
import { ingredientFromBarcode, ingredientFromLabel } from "./recipe-scanned-ingredients";
import { recipeInputSchema } from "./recipe-input";
import type { PackagedFood } from "./off-food";

const oats: PackagedFood = {
  code: "1234567890123",
  brand: "Sample",
  name: "Oats",
  calories: 380,
  protein: 13,
  carbs: 64,
  fat: 7,
  servingDescription: "Per 100 g or 100 ml · verify package label",
  source: "Open Food Facts",
};

describe("recipe scanning sources and saving", () => {
  it("uses the selected barcode quantity once and retains provenance", () => {
    const ingredient = ingredientFromBarcode(oats, 50);
    expect(ingredient).toMatchObject({
      name: "Sample Oats", amountLabel: "50 g/ml",
      calories: 190, protein: 6.5, carbs: 32, fat: 3.5,
      source: "Open Food Facts", sourceRef: "1234567890123",
    });
    expect(recipeInputSchema.safeParse({
      name: "Breakfast oats", servings: 2, ingredients: [ingredient],
    }).success).toBe(true);
  });

  it("never pretends a package label contains a known weight when it does not", () => {
    const ingredient = ingredientFromLabel({
      food_name: "Soup",
      serving_description: "Per package",
      calories: 220, protein: 7, carbs: 18, fat: 12, confidence: "medium",
    });
    expect(ingredient.grams).toBeNull();
    expect(ingredient.caloriesPer100g).toBeNull();
    expect(ingredient.source).toBe("nutrition-label");
    expect(recipeInputSchema.safeParse({
      name: "Soup and bread", servings: 1, ingredients: [ingredient],
    }).success).toBe(true);
  });

  it("uses a per 100 g label's actual reference basis without guessing", () => {
    const ingredient = ingredientFromLabel({
      food_name: "Chickpeas",
      serving_description: "Per 100 g",
      calories: 160, protein: 9, carbs: 27, fat: 2.6, confidence: "high",
    });
    expect(ingredient.grams).toBe(100);
    expect(ingredient.caloriesPer100g).toBe(160);
    expect(ingredient.proteinPer100g).toBe(9);
  });

  it("reports invalid ingredients instead of silently treating a save as success", () => {
    const ingredient = ingredientFromBarcode(oats, 50);
    const invalid = recipeInputSchema.safeParse({
      name: "Oats", servings: 1, ingredients: [{ ...ingredient, protein: -5 }],
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues[0]?.path).toEqual(["ingredients", 0, "protein"]);
  });
});
