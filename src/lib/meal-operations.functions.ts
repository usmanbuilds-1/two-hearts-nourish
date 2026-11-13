import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Meal, MealType } from "@/lib/nutrition";
import { addDays, adherencePct, adherenceLabel } from "@/lib/nutrition";
import { mealCopyFields } from "@/lib/meal-copy";

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

export type DayBreakdown = {
  date: string;
  shortDay: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logged: boolean;
};

export type WeeklySummary = {
  startDate: string;
  endDate: string;
  weekLabel: string;
  // 7-day cumulative totals
  weeklyTotal: { calories: number; protein: number; carbs: number; fat: number };
  // averages
  dailyAverageLogged: { calories: number; protein: number; carbs: number; fat: number };
  dailyAverageFullWeek: { calories: number; protein: number; carbs: number; fat: number };
  daysLogged: number;
  calorieTarget: number;
  // adherence: % of *completed* logged days within ±10% of target (no 100% clamp on overeating)
  targetAdherence: number;
  adherenceLabel: string;
  // per-day breakdown (always 7 entries)
  dailyBreakdown: DayBreakdown[];
  // delta vs previous 7-day window
  previousWeekDelta: { calories: number; protein: number } | null;
  // data-backed insight
  observation: { headline: string; detail: string; calculation: string } | null;
  // legacy aliases kept so existing callers don't break
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
};

export type WeekHistoryEntry = {
  startDate: string;
  endDate: string;
  weekLabel: string;
  avgCalories: number;
  daysLogged: number;
  targetAdherence: number;
};

export type MealSuggestion = {
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "high" | "medium" | "low";
};

// ============================================================================
// PHASE 1: Favorites, Templates, Copy Actions
// ============================================================================

export const getFavoriteMeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MealFavorite[]> => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) return [];
    const { data,error } = await db.from("meal_favorites").select("*").eq("member_id", memberId).order("created_at", { ascending: false });
    if(error) throw new Error("FAVOURITES_UNAVAILABLE");
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
    const {error}=await db.from("meal_favorites").delete().eq("member_id", memberId).eq("food_name", data.foodName);
    if(error)throw new Error("REMOVE_FAVOURITE_FAILED");
    return { ok: true };
  });

/** A bounded, fresh snapshot for quick-logging one member's recent and repeated foods.
 *  Never read partner meals; this endpoint is entirely scoped to the authenticated device.
 */
export const getQuickMeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{clientDate:string})=>({
    clientDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.clientDate),
  }))
  .handler(async ({data,context}):Promise<Meal[]>=>{
    const db=await admin();
    const memberId=await deviceMemberId(db,context.userId);
    if(!memberId)throw new Error("NOT_MEMBER");
    const {data:rows,error}=await db.from("meals")
      .select("*")
      .eq("member_id",memberId)
      .eq("is_planned",false)
      .gte("meal_date",addDays(data.clientDate,-120))
      .lte("meal_date",data.clientDate)
      .order("meal_date",{ascending:false})
      .order("created_at",{ascending:false})
      .limit(240);
    if(error)throw new Error("QUICK_MEALS_UNAVAILABLE");
    return (rows??[]) as Meal[];
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
      .insert(mealCopyFields(meal as Meal, data.targetDate))
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
    const newMeals = sourceMeals.map((m) => mealCopyFields(m as Meal,data.targetDate));
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

const mealTemplateItemsSchema = z.array(z.object({
  food_name: z.string().trim().min(1).max(200),
  calories: z.number().finite().min(0).max(20000),
  protein: z.number().finite().min(0).max(2000),
  carbs: z.number().finite().min(0).max(2000),
  fat: z.number().finite().min(0).max(2000),
  meal_type: z.enum(["breakfast","lunch","snack","dinner"])
})).max(30);

export const saveMealTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; meals: MealTemplate["meals"] }) => ({
    name: z.string().trim().min(1).max(100).parse(i.name),
    meals: mealTemplateItemsSchema.parse(i.meals),
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

/** Update the original recipe in place; never delete it before saving replacement data. */
export const updateMealTemplate = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{templateId:string;meals:MealTemplate["meals"]})=>({
    templateId:z.string().uuid().parse(i.templateId),
    meals:mealTemplateItemsSchema.parse(i.meals),
  }))
  .handler(async({data,context})=>{
    const db=await admin();
    const memberId=await deviceMemberId(db,context.userId);
    if(!memberId)throw new Error("NOT_MEMBER");
    const {data:updated,error}=await db.from("meal_templates")
      .update({meals:data.meals})
      .eq("id",data.templateId)
      .eq("member_id",memberId)
      .select("id").maybeSingle();
    if(error||!updated)throw new Error("SAVE_FAILED");
    return {ok:true};
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

// ============================================================================
// PHASE 4: Analytics — rebuilt
// ============================================================================

/** Helper: safe division returning 0 on divide-by-zero */
const safeDivR  = (n: number, d: number) => (d > 0 ? Math.round(n / d) : 0);
const safeDivD  = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10) / 10 : 0);

const fmtShort  = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const getWeeklySummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clientDate: string; weekOffset?: number; memberId?: string }) => ({
    clientDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.clientDate),
    weekOffset:  z.number().int().min(-52).max(0).default(0).parse(i.weekOffset ?? 0),
    memberId:    z.string().uuid().optional().parse(i.memberId),
  }))
  .handler(async ({ data, context }): Promise<WeeklySummary> => {
    const db       = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    const wo       = data.weekOffset ?? 0;

    // Compute this week's window using client-local dates (no UTC drift)
    const endDate      = addDays(data.clientDate, wo * 7);
    const startDate    = addDays(endDate, -6);
    const prevEndDate  = addDays(startDate, -1);
    const prevStart    = addDays(prevEndDate, -6);
    const weekLabel    = `${fmtShort(startDate)} – ${fmtShort(endDate)}`;

    const EMPTY: WeeklySummary = {
      startDate, endDate, weekLabel,
      weeklyTotal: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      dailyAverageLogged:   { calories: 0, protein: 0, carbs: 0, fat: 0 },
      dailyAverageFullWeek: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      daysLogged: 0, calorieTarget: 0, targetAdherence: 0,
      adherenceLabel: "No target set", dailyBreakdown: [],
      previousWeekDelta: null, observation: null,
      avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0,
    };

    if (!memberId) return EMPTY;

    // Get caller's room_id for security validation
    const { data: callerMember } = await db
      .from("members").select("room_id").eq("id", memberId).single();
    if (!callerMember) return EMPTY;

    // If a partner memberId is requested, validate it belongs to the same room
    let targetMemberId = memberId;
    if (data.memberId && data.memberId !== memberId) {
      const { data: sameRoom } = await db
        .from("members").select("id")
        .eq("id", data.memberId).eq("room_id", callerMember.room_id)
        .maybeSingle();
      if (sameRoom) targetMemberId = data.memberId;
      // silently falls back to caller if not in same room
    }

    const { data: member } = await db
      .from("members")
      .select("daily_calorie_target, daily_protein_target, room_id")
      .eq("id", targetMemberId)
      .single();
    if (!member) return EMPTY;

    const calorieTarget = member.daily_calorie_target ?? 0;

    // Fetch both current + previous window in one query (no UTC toISOString)
    const { data: raw, error: mealError } = await db
      .from("meals")
      .select("meal_date, calories, protein, carbs, fat, meal_type")
      .eq("member_id", targetMemberId)
      .eq("is_planned", false)
      .gte("meal_date", prevStart)
      .lte("meal_date", endDate);

    if (mealError) throw new Error("SERVER_ERROR");
    const allMeals = raw ?? [];
    const curMeals  = allMeals.filter(m => m.meal_date >= startDate && m.meal_date <= endDate);
    const prevMeals = allMeals.filter(m => m.meal_date >= prevStart  && m.meal_date <= prevEndDate);

    // Bucket current-week meals by date
    type DayData = { calories: number; protein: number; carbs: number; fat: number };
    const byDate = new Map<string, DayData>();
    for (const m of curMeals) {
      const ex = byDate.get(m.meal_date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      ex.calories += m.calories;
      ex.protein  += Number(m.protein);
      ex.carbs    += Number(m.carbs);
      ex.fat      += Number(m.fat);
      byDate.set(m.meal_date, ex);
    }

    const daysLogged = byDate.size;

    // Build 7-entry daily breakdown
    const dailyBreakdown: DayBreakdown[] = Array.from({ length: 7 }, (_, i) => {
      const date    = addDays(startDate, i);
      const day     = byDate.get(date);
      const shortDay = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
      return {
        date, shortDay,
        calories: day?.calories ?? 0,
        protein:  day?.protein  ?? 0,
        carbs:    day?.carbs    ?? 0,
        fat:      day?.fat      ?? 0,
        logged: !!day,
      };
    });

    // Cumulative totals
    const totCal  = dailyBreakdown.reduce((a, d) => a + d.calories, 0);
    const totProt = dailyBreakdown.reduce((a, d) => a + d.protein,  0);
    const totCarb = dailyBreakdown.reduce((a, d) => a + d.carbs,    0);
    const totFat  = dailyBreakdown.reduce((a, d) => a + d.fat,      0);

    const weeklyTotal = {
      calories: Math.round(totCal),
      protein:  Math.round(totProt * 10) / 10,
      carbs:    Math.round(totCarb * 10) / 10,
      fat:      Math.round(totFat  * 10) / 10,
    };

    const dailyAverageLogged = {
      calories: safeDivR(totCal,  daysLogged),
      protein:  safeDivD(totProt, daysLogged),
      carbs:    safeDivD(totCarb, daysLogged),
      fat:      safeDivD(totFat,  daysLogged),
    };
    const dailyAverageFullWeek = {
      calories: safeDivR(totCal,  7),
      protein:  safeDivD(totProt, 7),
      carbs:    safeDivD(totCarb, 7),
      fat:      safeDivD(totFat,  7),
    };

    // Adherence — uses client today (not server now) so today is correctly excluded
    const tadPct = adherencePct(byDate, calorieTarget, data.clientDate);
    const tadLabel = adherenceLabel(tadPct, calorieTarget, dailyAverageLogged.calories);

    // Previous-week delta (avg on logged days only)
    let previousWeekDelta: WeeklySummary["previousWeekDelta"] = null;
    if (prevMeals.length > 0) {
      const pByDate = new Map<string, { calories: number; protein: number }>();
      for (const m of prevMeals) {
        const ex = pByDate.get(m.meal_date) ?? { calories: 0, protein: 0 };
        ex.calories += m.calories;
        ex.protein  += Number(m.protein);
        pByDate.set(m.meal_date, ex);
      }
      const pDays = pByDate.size;
      if (pDays > 0) {
        const pCal  = Array.from(pByDate.values()).reduce((a, v) => a + v.calories, 0);
        const pProt = Array.from(pByDate.values()).reduce((a, v) => a + v.protein,  0);
        previousWeekDelta = {
          calories: dailyAverageLogged.calories - safeDivR(pCal, pDays),
          protein:  Math.round((dailyAverageLogged.protein - safeDivD(pProt, pDays)) * 10) / 10,
        };
      }
    }

    // One grounded observation
    let observation: WeeklySummary["observation"] = null;
    if (daysLogged >= 3) {
      const weekdays = dailyBreakdown.filter(d => {
        const dow = new Date(d.date + "T12:00:00").getDay();
        return d.logged && dow >= 1 && dow <= 5;
      });
      const weekends = dailyBreakdown.filter(d => {
        const dow = new Date(d.date + "T12:00:00").getDay();
        return d.logged && (dow === 0 || dow === 6);
      });
      if (weekdays.length > 0 && weekends.length > 0) {
        const wdAvg = weekdays.reduce((a, d) => a + d.calories, 0) / weekdays.length;
        const weAvg = weekends.reduce((a, d) => a + d.calories, 0) / weekends.length;
        if (Math.abs(wdAvg - weAvg) > 200) {
          const diff = Math.round(Math.abs(weAvg - wdAvg));
          observation = {
            headline: weAvg > wdAvg ? `Weekend calories run +${diff} kcal higher` : `Weekends are ${diff} kcal lighter`,
            detail: `Your weekday average is ${Math.round(wdAvg)} kcal vs ${Math.round(weAvg)} kcal on weekends.`,
            calculation: `Weekday average computed from ${weekdays.length} logged Mon–Fri days; weekend from ${weekends.length} logged Sat–Sun days. Days with no log are excluded from both averages.`,
          };
        }
      }
      // Fallback: dinner dominance
      if (!observation) {
        const dinnerCal = curMeals
          .filter(m => m.meal_type === "dinner")
          .reduce((a, m) => a + m.calories, 0);
        if (totCal > 0) {
          const dinnerPct = Math.round((dinnerCal / totCal) * 100);
          if (dinnerPct >= 40) {
            observation = {
              headline: `Dinner drives ${dinnerPct}% of weekly intake`,
              detail: "Front-loading calories earlier in the day may help with energy and appetite control.",
              calculation: `Dinner total this week: ${Math.round(dinnerCal)} kcal ÷ weekly total ${Math.round(totCal)} kcal = ${dinnerPct}%.`,
            };
          }
        }
      }
    }

    return {
      startDate, endDate, weekLabel,
      weeklyTotal, dailyAverageLogged, dailyAverageFullWeek,
      daysLogged, calorieTarget, targetAdherence: tadPct, adherenceLabel: tadLabel,
      dailyBreakdown, previousWeekDelta, observation,
      // legacy
      avgCalories: dailyAverageLogged.calories,
      avgProtein:  dailyAverageLogged.protein,
      avgCarbs:    dailyAverageLogged.carbs,
      avgFat:      dailyAverageLogged.fat,
    };
  });

export const getWeeklyHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clientDate: string; weeksBack?: number }) => ({
    clientDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.clientDate),
    weeksBack:  z.number().int().min(1).max(12).default(4).parse(i.weeksBack ?? 4),
  }))
  .handler(async ({ data, context }): Promise<WeekHistoryEntry[]> => {
    const db       = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) return [];

    const { data: member } = await db.from("members").select("daily_calorie_target").eq("id", memberId).single();
    const target = member?.daily_calorie_target ?? 0;
    const wb     = data.weeksBack ?? 4;

    // Fetch all meals across past N complete weeks (exclude current week)
    const endDate   = addDays(data.clientDate, -7);
    const startDate = addDays(endDate, -(wb * 7 - 1));

    const { data: raw, error: mealError } = await db
      .from("meals")
      .select("meal_date, calories")
      .eq("member_id", memberId)
      .eq("is_planned", false)
      .gte("meal_date", startDate)
      .lte("meal_date", endDate);

    if (mealError) throw new Error("SERVER_ERROR");
    const meals = raw ?? [];
    const results: WeekHistoryEntry[] = [];

    for (let w = 0; w < wb; w++) {
      const wEnd   = addDays(endDate, -(w * 7));
      const wStart = addDays(wEnd, -6);
      const wMeals = meals.filter(m => m.meal_date >= wStart && m.meal_date <= wEnd);

      const byDate = new Map<string, number>();
      for (const m of wMeals) byDate.set(m.meal_date, (byDate.get(m.meal_date) ?? 0) + m.calories);

      const dl    = byDate.size;
      const totCal = Array.from(byDate.values()).reduce((a, b) => a + b, 0);
      const threshold = Math.max(target * 0.1, 150);
      const hits = target > 0 ? [...byDate.values()].filter(c => Math.abs(c - target) <= threshold).length : 0;

      results.unshift({
        startDate:       wStart,
        endDate:         wEnd,
        weekLabel:       `${fmtShort(wStart)} – ${fmtShort(wEnd)}`,
        avgCalories:     safeDivR(totCal, dl),
        daysLogged:      dl,
        targetAdherence: dl > 0 && target > 0 ? Math.round((hits / dl) * 100) : 0,
      });
    }
    return results;
  });

// ============================================================================
// PHASE 6: AI Suggestions
// ============================================================================

export const suggestMealsForMacros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { remainingCalories: number; targetProtein: number; targetCarbs: number; targetFat: number }) => ({
    remainingCalories: z.number().min(0).max(10000).parse(i.remainingCalories),
    targetProtein: z.number().min(0).max(1000).parse(i.targetProtein),
    targetCarbs: z.number().min(0).max(1000).parse(i.targetCarbs),
    targetFat: z.number().min(0).max(1000).parse(i.targetFat),
  }))
  .handler(async ({ data, context }): Promise<MealSuggestion[]> => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    
    const commonMeals: MealSuggestion[] = [
      { name: "Grilled chicken breast", serving: "150g", calories: 275, protein: 52, carbs: 0, fat: 6, confidence: "high" },
      { name: "Salmon fillet", serving: "150g", calories: 280, protein: 38, carbs: 0, fat: 14, confidence: "high" },
      { name: "Brown rice", serving: "1 cup cooked", calories: 215, protein: 5, carbs: 45, fat: 2, confidence: "high" },
      { name: "Broccoli", serving: "2 cups steamed", calories: 70, protein: 7, carbs: 14, fat: 1, confidence: "high" },
      { name: "Eggs", serving: "2 large", calories: 155, protein: 13, carbs: 1, fat: 11, confidence: "high" },
    ];
    
    return commonMeals.filter(m => m.calories <= data.remainingCalories).slice(0, 5);
  });
