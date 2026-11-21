import { scalePackagedLabel } from "./packaged-scan";
import type { PackagedFood } from "./off-food";
import type { RecipeIngredient } from "./recipe";

const rounded = (number: number) => Math.round(number * 10) / 10;

/** A barcode result is per 100 g/ml; the chosen amount must be applied once. */
export function ingredientFromBarcode(food: PackagedFood, amount: number): RecipeIngredient {
  const n = scalePackagedLabel(food, amount);
  return {
    name: [food.brand, food.name].filter(Boolean).join(" ").slice(0, 160),
    amountLabel: `${amount} g/ml`,
    // Open Food Facts does not distinguish weight from volume; never claim ml are grams.
    grams: null,
    calories: n.calories, protein: n.protein, carbs: n.carbs, fat: n.fat,
    caloriesPer100g: null, proteinPer100g: null, carbsPer100g: null, fatPer100g: null,
    source: "Open Food Facts", sourceRef: food.code, confidence: "medium",
  };
}

export type ScannedNutritionLabel = {
  food_name: string; serving_description: string;
  calories: number; protein: number; carbs: number; fat: number;
  confidence: "low" | "medium" | "high";
};

/** Only use the numbers actually returned by the label reader, never guessed values. */
export function ingredientFromLabel(label: ScannedNutritionLabel): RecipeIngredient {
  const per100g = /^per 100 g$/i.test(label.serving_description.trim());
  return {
    name: label.food_name.slice(0, 160),
    amountLabel: label.serving_description.slice(0, 100) || "Label serving",
    grams: per100g ? 100 : null,
    calories: label.calories,
    protein: label.protein,
    carbs: label.carbs,
    fat: label.fat,
    caloriesPer100g: per100g ? rounded(label.calories) : null,
    proteinPer100g: per100g ? rounded(label.protein) : null,
    carbsPer100g: per100g ? rounded(label.carbs) : null,
    fatPer100g: per100g ? rounded(label.fat) : null,
    source: "nutrition-label", sourceRef: null, confidence: label.confidence,
  };
}
