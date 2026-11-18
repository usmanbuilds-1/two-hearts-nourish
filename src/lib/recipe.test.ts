import { describe, expect, it } from "vitest";
import { perServing, recipeGoalFit, recipeTotals, scaleIngredientGrams, type RecipeIngredient } from "./recipe";
import type { Member } from "./nutrition";

const ingredient: RecipeIngredient = {
  name: "Oats",
  amountLabel: "50 g",
  grams: 50,
  calories: 190,
  protein: 6.5,
  carbs: 32,
  fat: 3.5,
  caloriesPer100g: 380,
  proteinPer100g: 13,
  carbsPer100g: 64,
  fatPer100g: 7,
  source: "USDA",
  sourceRef: "fdc:1",
  confidence: "high",
};

const member = (goal: Member["body_goal"], calories = 2500, protein = 120): Member => ({
  id: "m1",
  room_id: "r1",
  auth_user_id: null,
  seat: 1,
  display_name: "User",
  daily_calorie_target: calories,
  daily_protein_target: protein,
  daily_carbs_target: 300,
  daily_fat_target: 80,
  created_at: "2026-01-01",
  height_cm: 180,
  weight_kg: 70,
  age: 25,
  sex: "male",
  activity_level: "moderate",
  body_goal: goal,
  daily_food_budget: null,
  currency: null,
  locality: null,
});

describe("recipe nutrition helpers", () => {
  it("recalculates a grounded ingredient when grams change", () => {
    const scaled = scaleIngredientGrams(ingredient, 100);
    expect(scaled.calories).toBe(380);
    expect(scaled.protein).toBe(13);
    expect(scaled.amountLabel).toBe("100 g");
  });

  it("calculates totals and per-serving nutrition", () => {
    const totals = recipeTotals([ingredient, ingredient]);
    expect(totals.calories).toBe(380);
    expect(perServing(totals, 2).calories).toBe(190);
  });

  it("identifies an energy-and-protein-dense serving as useful for a gain goal", () => {
    const fit = recipeGoalFit({ calories: 650, protein: 30, carbs: 80, fat: 20 }, member("gain"));
    expect(fit.label).toBe("Strong fit for gain");
  });

  it("does not present goal fit as medical truth when no goal/target exists", () => {
    const fit = recipeGoalFit({ calories: 500, protein: 30, carbs: 50, fat: 20 }, member(null, 0, 0));
    expect(fit.label).toBe("Set your goal");
  });
});
