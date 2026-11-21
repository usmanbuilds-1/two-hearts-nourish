import { z } from "zod";

/** Shared validation for browser preview and authenticated server writes. */
export const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  amountLabel: z.string().trim().min(1).max(100),
  grams: z.number().finite().positive().max(10000).nullable(),
  calories: z.number().finite().min(0).max(20000),
  protein: z.number().finite().min(0).max(2000),
  carbs: z.number().finite().min(0).max(2000),
  fat: z.number().finite().min(0).max(2000),
  caloriesPer100g: z.number().finite().min(0).max(2000).nullable(),
  proteinPer100g: z.number().finite().min(0).max(100).nullable(),
  carbsPer100g: z.number().finite().min(0).max(100).nullable(),
  fatPer100g: z.number().finite().min(0).max(100).nullable(),
  source: z.enum(["USDA", "model-estimate", "manual", "nutrition-label", "Open Food Facts"]),
  sourceRef: z.string().max(200).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const recipeInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  servings: z.number().finite().min(0.25).max(100),
  ingredients: z.array(ingredientSchema).min(1).max(30),
});


