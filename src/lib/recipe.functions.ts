import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { claimAiQuota } from "./ai-quota.server";
import { mapInBatches } from "./bounded-batch";
import { normalizeFoodAlias } from "./scan-v2";
import { scaleUsda, searchUsdaFood } from "./usda-food.server";
import { perServing, recipeTotals, scaledRecipeNutrition, type RecipeIngredient, type RecipeRecord } from "./recipe";
import type { Meal, MealType } from "./nutrition";

const MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function memberIdFor(db: Awaited<ReturnType<typeof admin>>, authUserId: string) {
  const { data, error } = await db.from("member_devices")
    .select("member_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error("SERVER_ERROR");
  return data?.member_id ?? null;
}

const ingredientSchema = z.object({
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
  source: z.enum(["USDA", "model-estimate", "manual"]),
  sourceRef: z.string().max(200).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

const recipeInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  servings: z.number().finite().min(0.25).max(100),
  ingredients: z.array(ingredientSchema).min(1).max(30),
});

const modelIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount_label: z.string().trim().min(1).max(100),
  grams: z.number().finite().positive().max(10000).nullable(),
  fallback_nutrition: z.object({
    calories: z.number().finite().min(0).max(10000),
    protein: z.number().finite().min(0).max(1000),
    carbs: z.number().finite().min(0).max(1000),
    fat: z.number().finite().min(0).max(1000),
  }),
});

const modelRecipeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  servings: z.number().finite().min(0.25).max(100),
  ingredients: z.array(modelIngredientSchema).min(1).max(16),
});

const SYSTEM = `You parse a recipe description into ingredients for a nutrition tracker.
Return JSON only:
{
  "name": string,
  "servings": number,
  "ingredients": [
    {
      "name": string,
      "amount_label": string,
      "grams": number|null,
      "fallback_nutrition": {"calories":number,"protein":number,"carbs":number,"fat":number}
    }
  ]
}

Rules:
- Split the recipe into distinct edible ingredients.
- Preserve preparation/variant words that materially change nutrition: whole milk vs skim, peanut butter, cooked oats, oil/ghee, dates, whey, etc.
- When the user gives grams or millilitres, preserve that amount. For common count-based foods or household measures, estimate edible grams only when a reasonable standard portion exists. Otherwise use null.
- fallback_nutrition is for the STATED AMOUNT, not per 100g. It is a fallback only; another database will replace it when possible.
- Never invent a brand or package size that the user did not provide.
- Do not add ingredients the user did not mention.
- If servings are not stated, use 1.
- A recipe like "bulking shake: 2 bananas, 50g oats, 2 tbsp peanut butter, 250ml whole milk, 5 dates" should become five editable ingredients.
`;

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

async function callParser(apiKey: string, description: string) {
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: description }] }],
            generationConfig: { response_mime_type: "application/json", temperature: 0.1, maxOutputTokens: 1800 },
          }),
        },
      );
      if (response.ok) {
        const payload = await response.json() as GeminiResponse;
        return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      }
      lastError = Object.assign(new Error(`Gemini HTTP ${response.status}`), { status: response.status });
      if (response.status !== 404 && response.status !== 503 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("RECIPE_AI_FAILED");
}

function parseModelRecipe(text: string) {
  const match = text.replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = modelRecipeSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function roundedPer100(value: number, grams: number | null) {
  if (!grams || grams <= 0) return null;
  return Math.round((value / grams) * 1000) / 10;
}

async function groundIngredient(input: z.infer<typeof modelIngredientSchema>): Promise<RecipeIngredient> {
  const query = normalizeFoodAlias(input.name);
  // USDA can be temporarily unavailable; retain explicitly labeled model
  // estimates instead of losing the entire editable recipe.
  const match = await searchUsdaFood(query).catch(() => null);
  if (match && input.grams) {
    const nutrition = scaleUsda(match, input.grams);
    return {
      name: input.name,
      amountLabel: input.amount_label,
      grams: input.grams,
      ...nutrition,
      caloriesPer100g: match.caloriesPer100g,
      proteinPer100g: match.proteinPer100g,
      carbsPer100g: match.carbsPer100g,
      fatPer100g: match.fatPer100g,
      source: "USDA",
      sourceRef: `fdc:${match.fdcId}`,
      confidence: match.score >= 0.78 ? "high" : "medium",
    };
  }

  const fallback = input.fallback_nutrition;
  return {
    name: input.name,
    amountLabel: input.amount_label,
    grams: input.grams,
    calories: Math.round(fallback.calories),
    protein: Math.round(fallback.protein * 10) / 10,
    carbs: Math.round(fallback.carbs * 10) / 10,
    fat: Math.round(fallback.fat * 10) / 10,
    caloriesPer100g: roundedPer100(fallback.calories, input.grams),
    proteinPer100g: roundedPer100(fallback.protein, input.grams),
    carbsPer100g: roundedPer100(fallback.carbs, input.grams),
    fatPer100g: roundedPer100(fallback.fat, input.grams),
    source: "model-estimate",
    sourceRef: null,
    confidence: input.grams ? "medium" : "low",
  };
}

export const analyzeRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { description: string }) => ({
    description: z.string().trim().min(3).max(1800).parse(input.description),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) return { ok: false as const, error: "NOT_MEMBER" };

    try {
      if (!(await claimAiQuota(memberId, "text"))) return { ok: false as const, error: "AI_LIMIT" };
    } catch {
      return { ok: false as const, error: "AI_QUOTA_UNAVAILABLE" };
    }

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "AI_UNAVAILABLE" };

    let text: string;
    try {
      text = await callParser(apiKey, data.description);
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
      if (status === 429) return { ok: false as const, error: "AI_BUSY" };
      if (status === 402 || status === 403) return { ok: false as const, error: "AI_CREDITS" };
      return { ok: false as const, error: "AI_FAILED" };
    }

    const parsed = parseModelRecipe(text);
    if (!parsed) return { ok: false as const, error: "AI_MALFORMED" };

    // Batch network lookups to reduce latency without flooding USDA.
    const ingredients = await mapInBatches(parsed.ingredients, 4, groundIngredient);
    const totals = recipeTotals(ingredients);
    return {
      ok: true as const,
      recipe: {
        name: parsed.name,
        servings: parsed.servings,
        ingredients,
        totals,
        perServing: perServing(totals, parsed.servings),
      },
    };
  });

export const getRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecipeRecord[]> => {
    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) return [];
    const { data, error } = await db.from("recipes")
      .select("id,name,ingredients,servings,created_at,updated_at")
      .eq("member_id", memberId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error("RECIPES_UNAVAILABLE");

    return (data ?? []).flatMap((row) => {
      const parsed = z.array(ingredientSchema).safeParse(row.ingredients);
      if (!parsed.success) return [];
      return [{
        id: row.id,
        name: row.name,
        servings: Number(row.servings),
        ingredients: parsed.data,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }];
    });
  });

export const saveRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; servings: number; ingredients: RecipeIngredient[] }) =>
    recipeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const { data: saved, error } = await db.from("recipes").insert({
      member_id: memberId,
      name: data.name,
      servings: data.servings,
      ingredients: data.ingredients,
      updated_at: new Date().toISOString(),
    }).select("id,name,ingredients,servings,created_at,updated_at").single();
    if (error || !saved) throw new Error("SAVE_RECIPE_FAILED");
    return { ok: true as const, recipeId: saved.id };
  });

/** Update only the signed-in member's existing recipe; no delete/recreate. */
export const updateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recipeId: string; name: string; servings: number; ingredients: RecipeIngredient[] }) => ({
    recipeId: z.string().uuid().parse(input.recipeId),
    ...recipeInputSchema.parse(input),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const { data: updated, error } = await db.from("recipes").update({
      name: data.name,
      servings: data.servings,
      ingredients: data.ingredients,
      updated_at: new Date().toISOString(),
    }).eq("id", data.recipeId).eq("member_id", memberId)
      .select("id").maybeSingle();
    if (error || !updated) throw new Error("UPDATE_RECIPE_FAILED");
    return { ok: true as const, recipeId: updated.id };
  });

export const deleteRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recipeId: string }) => ({
    recipeId: z.string().uuid().parse(input.recipeId),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const { error } = await db.from("recipes")
      .delete()
      .eq("id", data.recipeId)
      .eq("member_id", memberId);
    if (error) throw new Error("DELETE_RECIPE_FAILED");
    return { ok: true as const };
  });

export const logRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recipeId: string; servings: number; mealType: MealType; mealDate: string }) => ({
    recipeId: z.string().uuid().parse(input.recipeId),
    servings: z.number().finite().positive().max(20).parse(input.servings),
    mealType: z.enum(["breakfast", "lunch", "snack", "dinner"]).parse(input.mealType),
    mealDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input.mealDate),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true; meal: Meal }> => {
    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");

    const [{ data: member, error: memberError }, { data: recipe, error: recipeError }] = await Promise.all([
      db.from("members").select("room_id").eq("id", memberId).single(),
      db.from("recipes").select("id,name,ingredients,servings").eq("id", data.recipeId).eq("member_id", memberId).single(),
    ]);
    if (memberError || !member || recipeError || !recipe) throw new Error("RECIPE_NOT_FOUND");

    const parsed = z.array(ingredientSchema).safeParse(recipe.ingredients);
    if (!parsed.success || parsed.data.length === 0) throw new Error("RECIPE_INVALID");

    const nutrients = scaledRecipeNutrition(
      recipeTotals(parsed.data),
      Number(recipe.servings),
      data.servings,
    );
    const { data: meal, error } = await db.from("meals").insert({
      room_id: member.room_id,
      member_id: memberId,
      meal_date: data.mealDate,
      meal_type: data.mealType,
      food_name: recipe.name,
      serving_description: `${data.servings} serving${data.servings === 1 ? "" : "s"} · saved recipe`,
      calories: nutrients.calories,
      protein: nutrients.protein,
      carbs: nutrients.carbs,
      fat: nutrients.fat,
      ai_confidence: null,
      is_planned: false,
    }).select().single();
    if (error || !meal) throw new Error("LOG_RECIPE_FAILED");
    return { ok: true, meal: meal as Meal };
  });
