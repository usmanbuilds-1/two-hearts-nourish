import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Meal, MealType } from "@/lib/nutrition";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function deviceMemberId(db: Awaited<ReturnType<typeof admin>>, uid: string) {
  const { data } = await db.from("member_devices").select("member_id").eq("auth_user_id", uid).maybeSingle();
  return data?.member_id ?? null;
}

export type MealFavorite = {
  id: string;
  food_name: string;
  serving_description: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealTemplate = {
  id: string;
  name: string;
  meals: Array<{ food_name: string; calories: number; protein: number; carbs: number; fat: number; meal_type: MealType }>;
};

export const getFavoriteMeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MealFavorite[]> => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) return [];
    const { data } = await db.from("meal_favorites").select("*").eq("member_id", memberId).order("created_at", { ascending: false });
    return (data ?? []) as MealFavorite[];
  });

export const saveFavoriteMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { foodName: string; servingDescription?: string; calories: number; protein: number; carbs: number; fat: number }) => ({
    foodName: z.string().trim().min(1).max(200).parse(i.foodName),
    servingDescription: z.string().max(200).optional().default("").parse(i.servingDescription),
    calories: z.number().min(0).max(10000).parse(i.calories),
    protein: z.number().min(0).max(1000).parse(i.protein),
    carbs: z.number().min(0).max(1000).parse(i.carbs),
    fat: z.number().min(0).max(1000).parse(i.fat),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const { error } = await db.from("meal_favorites").upsert({
      member_id: memberId,
      food_name: data.foodName,
      serving_description: data.servingDescription || null,
      calories: Math.round(data.calories),
      protein: Math.round(data.protein * 10) / 10,
      carbs: Math.round(data.carbs * 10) / 10,
      fat: Math.round(data.fat * 10) / 10,
    }, { onConflict: "member_id,food_name" });
    if (error) throw new Error("SAVE_FAILED");
    return { ok: true };
  });

export const removeFavoriteMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { foodName: string }) => ({
    foodName: z.string().trim().min(1).parse(i.foodName),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    await db.from("meal_favorites").delete().eq("member_id", memberId).eq("food_name", data.foodName);
    return { ok: true };
  });

export const getRecentMeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Meal[]> => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) return [];
    const { data } = await db
      .from("meals")
      .select("*")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(15);
    return (data ?? []) as Meal[];
  });

export const copyMealToDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { mealId: string; targetDate: string }) => ({
    mealId: z.string().uuid().parse(i.mealId),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.targetDate),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const { data: meal, error: fetchError } = await db.from("meals").select("*").eq("id", data.mealId).eq("member_id", memberId).single();
    if (fetchError || !meal) throw new Error("MEAL_NOT_FOUND");
    const { data: newMeal, error: insertError } = await db
      .from("meals")
      .insert({
        room_id: meal.room_id,
        member_id: meal.member_id,
        food_name: meal.food_name,
        serving_description: meal.serving_description,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        meal_type: meal.meal_type,
        meal_date: data.targetDate,
        ai_confidence: meal.ai_confidence,
      })
      .select()
      .single();
    if (insertError || !newMeal) throw new Error("COPY_FAILED");
    return { ok: true, meal: newMeal as Meal };
  });

export const copyDayMeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { sourceDate: string; targetDate: string }) => ({
    sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.sourceDate),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.targetDate),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const { data: sourceMeals, error: fetchError } = await db
      .from("meals")
      .select("*")
      .eq("member_id", memberId)
      .eq("meal_date", data.sourceDate);
    if (fetchError || !sourceMeals) throw new Error("SOURCE_NOT_FOUND");
    const newMeals = sourceMeals.map((m) => ({
      room_id: m.room_id,
      member_id: m.member_id,
      food_name: m.food_name,
      serving_description: m.serving_description,
      calories: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      meal_type: m.meal_type as MealType,
      meal_date: data.targetDate,
      ai_confidence: m.ai_confidence,
    }));
    const { data: inserted, error: insertError } = await db.from("meals").insert(newMeals).select();
    if (insertError || !inserted) throw new Error("COPY_FAILED");
    return { ok: true, count: inserted.length };
  });

export const getMealTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MealTemplate[]> => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) return [];
    const { data } = await db.from("meal_templates").select("*").eq("member_id", memberId).order("created_at", { ascending: false });
    return (data ?? []) as unknown as MealTemplate[];
  });

export const saveMealTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; meals: any[] }) => ({
    name: z.string().trim().min(1).max(100).parse(i.name),
    meals: z.array(z.any()).parse(i.meals),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const { error } = await db.from("meal_templates").insert({
      member_id: memberId,
      name: data.name,
      meals: data.meals,
    });
    if (error) throw new Error("SAVE_FAILED");
    return { ok: true };
  });

export const deleteMealTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { templateId: string }) => ({
    templateId: z.string().uuid().parse(i.templateId),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    await db.from("meal_templates").delete().eq("id", data.templateId).eq("member_id", memberId);
    return { ok: true };
  });
