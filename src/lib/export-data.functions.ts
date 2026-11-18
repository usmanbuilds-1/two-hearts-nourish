import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DATA_EXPORT_EXCLUDED,
  DATA_EXPORT_SCHEMA_VERSION,
  safeMealForExport,
  serializeDataExport,
  type DataExportBundle,
  type SafeProfileExport,
  type SafeRoomExport,
} from "./data-export";

const MAX_EXPORT_BYTES = 12 * 1024 * 1024;
const MAX_MEALS = 10_000;
const MAX_ROWS = 20_000;
const PAGE_SIZE = 500;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function fetchPaged<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows: number,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, maxRows - 1);
    const { data, error } = await page(from, to);
    if (error) throw new Error("EXPORT_FAILED");
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }

  // Refuse a silently truncated export. One extra-row probe proves whether the
  // configured bound was reached exactly or data exists beyond it.
  const { data, error } = await page(maxRows, maxRows);
  if (error) throw new Error("EXPORT_FAILED");
  if ((data?.length ?? 0) > 0) throw new Error("EXPORT_TOO_LARGE");
  return out;
}

export const exportMyDataJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    const { data: device, error: deviceError } = await db
      .from("member_devices")
      .select("member_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();

    if (deviceError) throw new Error("SERVER_ERROR");
    if (!device) throw new Error("NOT_MEMBER");

    // Reuse the existing server-only security budget. This is not an auth
    // mechanism; it simply makes accidental/repeated large exports bounded.
    const { data: allowed, error: budgetError } = await db.rpc(
      "claim_security_attempt",
      {
        p_actor_auth_user_id: context.userId,
        p_action: "personal_data_export",
        p_window_seconds: 60,
        p_max_attempts: 3,
      },
    );
    if (budgetError) throw new Error("EXPORT_FAILED");
    if (!allowed) throw new Error("EXPORT_RATE_LIMITED");

    const memberId = device.member_id;

    const { data: member, error: memberError } = await db
      .from("members")
      .select(
        "room_id,display_name,created_at,height_cm,weight_kg,age,sex,activity_level,body_goal,daily_calorie_target,daily_protein_target,daily_carbs_target,daily_fat_target,daily_food_budget,currency,locality,adaptive_targets_enabled,adaptive_target_configured_at,physical_activity_level,target_rate_pct_per_week",
      )
      .eq("id", memberId)
      .single();

    if (memberError || !member) throw new Error("EXPORT_FAILED");

    const { data: room, error: roomError } = await db
      .from("rooms")
      .select("shared_goal,couple_message,together_since,created_at")
      .eq("id", member.room_id)
      .maybeSingle();
    if (roomError) throw new Error("EXPORT_FAILED");

    const [
      meals,
      components,
      weightHistory,
      recipes,
      mealPlans,
      mealTemplates,
      favourites,
      progressNotes,
      adaptiveTargetHistory,
      confirmedCompleteDays,
    ] = await Promise.all([
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("meals")
            .select(
              "id,meal_date,meal_type,food_name,serving_description,calories,protein,carbs,fat,is_planned,photo_url,portion_percentage,nominal_calories,nominal_protein,nominal_carbs,nominal_fat,ai_confidence,created_at,updated_at",
            )
            .eq("member_id", memberId)
            .order("created_at", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_MEALS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("meal_components")
            .select(
              "id,meal_id,position,label,grams,calories,protein,carbs,fat,source_name,source_ref,confidence,created_at",
            )
            .eq("member_id", memberId)
            .order("created_at", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("weight_logs")
            .select("id,logged_date,weight_kg,created_at")
            .eq("member_id", memberId)
            .order("logged_date", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("recipes")
            .select("id,name,ingredients,servings,created_at,updated_at")
            .eq("member_id", memberId)
            .order("created_at", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("meal_plans")
            .select("id,recipe_id,meal_date,servings,eaten,created_at")
            .eq("member_id", memberId)
            .order("created_at", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("meal_templates")
            .select("id,name,meals,created_at,updated_at")
            .eq("member_id", memberId)
            .order("created_at", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("meal_favorites")
            .select(
              "id,food_name,serving_description,calories,protein,carbs,fat,created_at",
            )
            .eq("member_id", memberId)
            .order("created_at", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("progress_notes")
            .select("id,note_date,text,created_at")
            .eq("member_id", memberId)
            .order("note_date", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("calorie_target_history")
            .select(
              "id,old_target,new_target,estimated_maintenance,maintenance_ci95_low,maintenance_ci95_high,target_ci95_low,target_ci95_high,target_rate_pct_per_week,desired_kg_per_week,model_version,model_rmse_kg,data_start,data_end,complete_days,weight_points,change_reason,source_references,created_at,seen_at",
            )
            .eq("member_id", memberId)
            .order("created_at", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
      fetchPaged(
        async (from, to) => {
          const { data, error } = await db
            .from("nutrition_day_completeness")
            .select("log_date,completed_at")
            .eq("member_id", memberId)
            .order("log_date", { ascending: true })
            .range(from, to);
          return { data, error };
        },
        MAX_ROWS,
      ),
    ]);

    const profile: SafeProfileExport = {
      display_name: member.display_name,
      created_at: member.created_at,
      height_cm: member.height_cm,
      weight_kg: member.weight_kg,
      age: member.age,
      sex: member.sex,
      activity_level: member.activity_level,
      body_goal: member.body_goal,
      daily_calorie_target: member.daily_calorie_target,
      daily_protein_target: member.daily_protein_target == null ? null : Number(member.daily_protein_target),
      daily_carbs_target: member.daily_carbs_target == null ? null : Number(member.daily_carbs_target),
      daily_fat_target: member.daily_fat_target == null ? null : Number(member.daily_fat_target),
      daily_food_budget: member.daily_food_budget == null ? null : Number(member.daily_food_budget),
      currency: member.currency,
      locality: member.locality,
      adaptive_targets_enabled: member.adaptive_targets_enabled,
      adaptive_target_configured_at: member.adaptive_target_configured_at,
      physical_activity_level: member.physical_activity_level == null ? null : Number(member.physical_activity_level),
      target_rate_pct_per_week: member.target_rate_pct_per_week == null ? null : Number(member.target_rate_pct_per_week),
    };

    const sharedSpace: SafeRoomExport | null = room
      ? {
          shared_goal: room.shared_goal,
          couple_message: room.couple_message,
          together_since: room.together_since,
          created_at: room.created_at,
        }
      : null;

    const safeMeals = meals.map(safeMealForExport);

    const counts = {
      meals: safeMeals.length,
      meal_components: components.length,
      weight_history: weightHistory.length,
      recipes: recipes.length,
      meal_plans: mealPlans.length,
      meal_templates: mealTemplates.length,
      favourites: favourites.length,
      progress_notes: progressNotes.length,
      adaptive_target_history: adaptiveTargetHistory.length,
      confirmed_complete_days: confirmedCompleteDays.length,
    };

    const bundle: DataExportBundle = {
      manifest: {
        schema: "two-hearts-nourish-personal-export",
        schema_version: DATA_EXPORT_SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        scope: "authenticated-member-only",
        format: "json",
        excluded_for_security: DATA_EXPORT_EXCLUDED,
        counts,
      },
      profile,
      shared_space: sharedSpace,
      meals: safeMeals,
      meal_components: components,
      weight_history: weightHistory,
      recipes,
      meal_plans: mealPlans,
      meal_templates: mealTemplates,
      favourites,
      progress_notes: progressNotes,
      adaptive_target_history: adaptiveTargetHistory,
      confirmed_complete_days: confirmedCompleteDays,
    };

    const json = serializeDataExport(bundle);
    const bytes = new TextEncoder().encode(json).byteLength;
    if (bytes > MAX_EXPORT_BYTES) throw new Error("EXPORT_TOO_LARGE");

    return json;
  });
