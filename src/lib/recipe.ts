import type { Member } from "./nutrition";

export type RecipeIngredient = {
  name: string;
  amountLabel: string;
  grams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  source: "USDA" | "model-estimate" | "manual" | "nutrition-label" | "Open Food Facts";
  sourceRef: string | null;
  confidence: "high" | "medium" | "low";
};

export type RecipeRecord = {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  created_at: string;
  updated_at: string;
};

export type RecipeTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function recipeTotals(ingredients: RecipeIngredient[]): RecipeTotals {
  return ingredients.reduce<RecipeTotals>(
    (sum, item) => ({
      calories: sum.calories + Number(item.calories || 0),
      protein: sum.protein + Number(item.protein || 0),
      carbs: sum.carbs + Number(item.carbs || 0),
      fat: sum.fat + Number(item.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function perServing(totals: RecipeTotals, servings: number): RecipeTotals {
  const divisor = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return {
    calories: Math.round(totals.calories / divisor),
    protein: Math.round((totals.protein / divisor) * 10) / 10,
    carbs: Math.round((totals.carbs / divisor) * 10) / 10,
    fat: Math.round((totals.fat / divisor) * 10) / 10,
  };
}

/** Scale full recipe totals once, then round for the stored meal.
 * Rounding an individual serving before multiplying biases fractional portions.
 */
export function scaledRecipeNutrition(
  totals: RecipeTotals,
  recipeServings: number,
  consumedServings: number,
): RecipeTotals {
  if (!Number.isFinite(recipeServings) || recipeServings <= 0 ||
      !Number.isFinite(consumedServings) || consumedServings <= 0) {
    throw new Error("INVALID_RECIPE_SERVINGS");
  }
  const factor = consumedServings / recipeServings;
  return {
    calories: Math.round(totals.calories * factor),
    protein: Math.round(totals.protein * factor * 10) / 10,
    carbs: Math.round(totals.carbs * factor * 10) / 10,
    fat: Math.round(totals.fat * factor * 10) / 10,
  };
}

export function scaleIngredientGrams(item: RecipeIngredient, grams: number): RecipeIngredient {
  if (!Number.isFinite(grams) || grams <= 0) return item;
  const canScale = [
    item.caloriesPer100g,
    item.proteinPer100g,
    item.carbsPer100g,
    item.fatPer100g,
  ].every((value) => typeof value === "number" && Number.isFinite(value));

  if (!canScale) return { ...item, grams, amountLabel: `${Math.round(grams)} g` };

  const factor = grams / 100;
  return {
    ...item,
    grams,
    amountLabel: `${Math.round(grams)} g`,
    calories: Math.round((item.caloriesPer100g ?? 0) * factor),
    protein: Math.round((item.proteinPer100g ?? 0) * factor * 10) / 10,
    carbs: Math.round((item.carbsPer100g ?? 0) * factor * 10) / 10,
    fat: Math.round((item.fatPer100g ?? 0) * factor * 10) / 10,
  };
}

export function bodyGoalLabel(goal: Member["body_goal"]): string {
  if (goal === "gain") return "Gain";
  if (goal === "lose") return "Lose";
  if (goal === "maintain") return "Maintain";
  return "No goal set";
}

export type GoalFit = {
  label: string;
  detail: string;
  tone: "good" | "neutral" | "watch";
};

export function recipeGoalFit(recipe: RecipeTotals, member: Member): GoalFit {
  const targetKcal = Number(member.daily_calorie_target ?? 0);
  const targetProtein = Number(member.daily_protein_target ?? 0);
  if (!member.body_goal || targetKcal <= 0) {
    return {
      label: "Set your goal",
      detail: "Add a body goal and daily targets to see how this serving fits your day.",
      tone: "neutral",
    };
  }

  const kcalShare = recipe.calories / targetKcal;
  const proteinShare = targetProtein > 0 ? recipe.protein / targetProtein : 0;
  const proteinDensity = recipe.calories > 0 ? (recipe.protein / recipe.calories) * 100 : 0;

  if (member.body_goal === "gain") {
    if (kcalShare >= 0.2 && (targetProtein <= 0 || proteinShare >= 0.18)) {
      return {
        label: "Strong fit for gain",
        detail: "This serving contributes meaningful energy and protein toward your current targets.",
        tone: "good",
      };
    }
    if (kcalShare < 0.12) {
      return {
        label: "Light for a gain meal",
        detail: "Useful as a snack, but it may be small relative to your daily energy target.",
        tone: "watch",
      };
    }
    return {
      label: "Fits a gain day",
      detail: "A moderate share of your calorie target. Check the rest of the day before adding more.",
      tone: "neutral",
    };
  }

  if (member.body_goal === "lose") {
    if (proteinDensity >= 6 && kcalShare <= 0.3) {
      return {
        label: "Protein-forward",
        detail: "This serving gives relatively high protein for its calorie load.",
        tone: "good",
      };
    }
    if (kcalShare > 0.4) {
      return {
        label: "Large calorie share",
        detail: "This serving uses a large part of your daily target. Portion size matters here.",
        tone: "watch",
      };
    }
    return {
      label: "Fits your target",
      detail: "A reasonable share of your day. Protein and total daily intake still matter most.",
      tone: "neutral",
    };
  }

  if (kcalShare <= 0.35) {
    return {
      label: "Balanced fit",
      detail: "This serving sits comfortably within your current maintenance target.",
      tone: "good",
    };
  }
  return {
    label: "Substantial meal",
    detail: "This serving is a larger part of your day, so plan the remaining meals around it.",
    tone: "neutral",
  };
}
