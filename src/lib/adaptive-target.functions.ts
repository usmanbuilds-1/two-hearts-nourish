import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { addDays, daysBetween } from "./nutrition";
import { bmr } from "./health";
import {
  fitHallMaintenance,
  hallLongTermParameters,
  hallTargetCalories,
  isEvidenceSupportedRate,
  type AdaptiveGoal,
} from "./adaptive-target";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function memberIdFor(
  db: Awaited<ReturnType<typeof admin>>,
  authUserId: string,
) {
  const { data, error } = await db
    .from("member_devices")
    .select("member_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error("SERVER_ERROR");
  return data?.member_id ?? null;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type AdaptiveMember = {
  id: string;
  created_at: string;
  daily_calorie_target: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  age: number | null;
  sex: string | null;
  body_goal: string | null;
  adaptive_targets_enabled: boolean;
  adaptive_target_configured_at: string | null;
  physical_activity_level: number | null;
  target_rate_pct_per_week: number | null;
};

export type AdaptiveTargetChange = {
  id: string;
  oldTarget: number | null;
  newTarget: number;
  estimatedMaintenance: number;
  maintenanceCi95Low: number;
  maintenanceCi95High: number;
  targetCi95Low: number;
  targetCi95High: number;
  targetRatePctPerWeek: number;
  desiredKgPerWeek: number;
  modelRmseKg: number;
  dataStart: string;
  dataEnd: string;
  completeDays: number;
  weightPoints: number;
  createdAt: string;
  sourceReferences: string[];
};

export type AdaptiveTargetStatus = {
  enabled: boolean;
  configurationReady: boolean;
  yesterdayComplete: boolean;
  latestUnseenChange: AdaptiveTargetChange | null;
};

function consecutiveEndingAtLatest(dates: string[]): string[] {
  const unique = [...new Set(dates)].sort();
  if (!unique.length) return [];
  const set = new Set(unique);
  const result: string[] = [];
  let cursor = unique[unique.length - 1]!;
  while (set.has(cursor)) {
    result.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return result.reverse();
}

function sourceReferences(goal: AdaptiveGoal): string[] {
  const refs = [
    "Hall KD et al. Lancet. 2011;378:826-837. PMID 21872751. doi:10.1016/S0140-6736(11)60812-X",
    "NIDDK Body Weight Planner research model: https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner",
  ];
  if (goal === "gain") {
    refs.push("Iraki J et al. Sports (Basel). 2019;7(7):154. PMID 31247944.");
  } else if (goal === "lose") {
    refs.push("Helms ER et al. J Int Soc Sports Nutr. 2014;11:20. PMID 24864135.");
  }
  return refs;
}

function configurationReady(member: AdaptiveMember): member is AdaptiveMember & {
  height_cm: number;
  age: number;
  sex: "male" | "female";
  body_goal: AdaptiveGoal;
  physical_activity_level: number;
  target_rate_pct_per_week: number;
} {
  const goal =
    member.body_goal === "lose" ||
    member.body_goal === "maintain" ||
    member.body_goal === "gain"
      ? member.body_goal
      : null;

  if (
    !member.adaptive_targets_enabled ||
    !member.height_cm ||
    !member.age ||
    (member.sex !== "male" && member.sex !== "female") ||
    !goal ||
    member.physical_activity_level == null
  ) {
    return false;
  }

  const rate =
    goal === "maintain" ? 0 : member.target_rate_pct_per_week;

  return (
    rate != null &&
    isEvidenceSupportedRate(goal, Number(rate))
  );
}

async function readMember(
  db: Awaited<ReturnType<typeof admin>>,
  memberId: string,
): Promise<AdaptiveMember | null> {
  const { data, error } = await db
    .from("members")
    .select(
      "id,created_at,daily_calorie_target,height_cm,weight_kg,age,sex,body_goal,adaptive_targets_enabled,adaptive_target_configured_at,physical_activity_level,target_rate_pct_per_week",
    )
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error("SERVER_ERROR");
  return data as AdaptiveMember | null;
}

function historyToPublic(row: {
  id: string;
  old_target: number | null;
  new_target: number;
  estimated_maintenance: number;
  maintenance_ci95_low: number;
  maintenance_ci95_high: number;
  target_ci95_low: number;
  target_ci95_high: number;
  target_rate_pct_per_week: number;
  desired_kg_per_week: number;
  model_rmse_kg: number;
  data_start: string;
  data_end: string;
  complete_days: number;
  weight_points: number;
  created_at: string;
  source_references: unknown;
}): AdaptiveTargetChange {
  return {
    id: row.id,
    oldTarget: row.old_target,
    newTarget: row.new_target,
    estimatedMaintenance: row.estimated_maintenance,
    maintenanceCi95Low: row.maintenance_ci95_low,
    maintenanceCi95High: row.maintenance_ci95_high,
    targetCi95Low: row.target_ci95_low,
    targetCi95High: row.target_ci95_high,
    targetRatePctPerWeek: Number(row.target_rate_pct_per_week),
    desiredKgPerWeek: Number(row.desired_kg_per_week),
    modelRmseKg: Number(row.model_rmse_kg),
    dataStart: row.data_start,
    dataEnd: row.data_end,
    completeDays: row.complete_days,
    weightPoints: row.weight_points,
    createdAt: row.created_at,
    sourceReferences: Array.isArray(row.source_references)
      ? row.source_references.filter((item): item is string => typeof item === "string")
      : [],
  };
}

async function evaluateAdaptiveTargetForMember(
  db: Awaited<ReturnType<typeof admin>>,
  member: AdaptiveMember,
  clientDate: string,
): Promise<AdaptiveTargetChange | null> {
  if (!configurationReady(member)) return null;

  const goal = member.body_goal;
  const rate =
    goal === "maintain" ? 0 : Number(member.target_rate_pct_per_week);

  const configuredDate =
    member.adaptive_target_configured_at?.slice(0, 10) ??
    member.created_at.slice(0, 10);

  const { data: lastChange } = await db
    .from("calorie_target_history")
    .select("data_end")
    .eq("member_id", member.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const minDate =
    lastChange?.data_end && lastChange.data_end >= configuredDate
      ? addDays(lastChange.data_end, 1)
      : configuredDate;

  const { data: completeRows, error: completeError } = await db
    .from("nutrition_day_completeness")
    .select("log_date")
    .eq("member_id", member.id)
    .gte("log_date", minDate)
    .lte("log_date", clientDate)
    .order("log_date", { ascending: true });
  if (completeError) throw new Error("SERVER_ERROR");

  const segment = consecutiveEndingAtLatest(
    (completeRows ?? []).map((row) => row.log_date),
  );
  if (!segment.length) return null;

  const segmentStart = segment[0]!;
  const segmentEnd = segment[segment.length - 1]!;

  const { data: weightRows, error: weightError } = await db
    .from("weight_logs")
    .select("logged_date,weight_kg")
    .eq("member_id", member.id)
    .gte("logged_date", segmentStart)
    .lte("logged_date", segmentEnd)
    .order("logged_date", { ascending: true });
  if (weightError) throw new Error("SERVER_ERROR");

  if (!weightRows || weightRows.length < 3) return null;

  // Start the model on an actually observed weight date, then use only the
  // consecutive complete-intake days from that date onward.
  const startDate = weightRows[0]!.logged_date;
  const trimmedSegment = segment.filter((day) => day >= startDate);
  if (!trimmedSegment.length) return null;
  const endDate = trimmedSegment[trimmedSegment.length - 1]!;

  const usableWeights = weightRows.filter(
    (row) => row.logged_date >= startDate && row.logged_date <= endDate,
  );
  if (usableWeights.length < 3) return null;

  const { data: mealRows, error: mealError } = await db
    .from("meals")
    .select("meal_date,calories,is_planned")
    .eq("member_id", member.id)
    .gte("meal_date", startDate)
    .lte("meal_date", endDate);
  if (mealError) throw new Error("SERVER_ERROR");

  const caloriesByDate = new Map<string, number>();
  for (const day of trimmedSegment) caloriesByDate.set(day, 0);
  for (const row of mealRows ?? []) {
    if (row.is_planned) continue;
    if (!caloriesByDate.has(row.meal_date)) continue;
    caloriesByDate.set(
      row.meal_date,
      (caloriesByDate.get(row.meal_date) ?? 0) + Number(row.calories),
    );
  }

  const intakesKcal = trimmedSegment.map(
    (day) => caloriesByDate.get(day) ?? 0,
  );

  const initialWeightKg = Number(usableWeights[0]!.weight_kg);
  const currentWeightKg = Number(
    usableWeights[usableWeights.length - 1]!.weight_kg,
  );

  const restingMetabolicRateKcal = bmr({
    heightCm: member.height_cm,
    weightKg: initialWeightKg,
    age: member.age,
    sex: member.sex,
  });

  const parameters = hallLongTermParameters({
    weightKg: initialWeightKg,
    heightCm: member.height_cm,
    age: member.age,
    sex: member.sex,
    pal: Number(member.physical_activity_level),
    restingMetabolicRateKcal,
  });
  if (!parameters) return null;

  const weights = usableWeights.map((row) => ({
    dayIndex: daysBetween(startDate, row.logged_date),
    weightKg: Number(row.weight_kg),
  }));

  const fit = fitHallMaintenance({
    initialWeightKg,
    intakesKcal,
    weights,
    parameters,
  });
  if (!fit) return null;

  const target = hallTargetCalories({
    fittedBaselineMaintenanceKcal: fit.maintenanceKcal,
    fittedMaintenanceCi95Low: fit.maintenanceCi95Low,
    fittedMaintenanceCi95High: fit.maintenanceCi95High,
    initialWeightKg,
    currentWeightKg,
    targetRatePctPerWeek: rate,
    parameters,
  });

  const currentTarget =
    member.daily_calorie_target == null
      ? null
      : Number(member.daily_calorie_target);

  // A target changes only when the current value is outside the model-derived
  // 95% confidence interval. If uncertainty still includes the current target,
  // the app keeps the target unchanged.
  const outsideCi =
    currentTarget == null ||
    currentTarget < target.targetCi95Low ||
    currentTarget > target.targetCi95High;

  if (!outsideCi) return null;

  const newTarget = Math.round(target.targetKcal);
  if (!Number.isFinite(newTarget) || newTarget <= 0 || newTarget > 10_000) {
    return null;
  }
  if (currentTarget === newTarget) return null;

  const refs = sourceReferences(goal);

  const { data: historyId, error: applyError } = await db.rpc(
    "apply_adaptive_target_change",
    {
      p_member_id: member.id,
      p_expected_old_target: currentTarget,
      p_new_target: newTarget,
      p_estimated_maintenance: Math.round(target.maintenanceKcal),
      p_maintenance_ci95_low: Math.round(target.maintenanceCi95Low),
      p_maintenance_ci95_high: Math.round(target.maintenanceCi95High),
      p_target_ci95_low: Math.round(target.targetCi95Low),
      p_target_ci95_high: Math.round(target.targetCi95High),
      p_target_rate_pct_per_week: rate,
      p_desired_kg_per_week:
        Math.round(target.desiredKgPerWeek * 1000) / 1000,
      p_model_rmse_kg: Math.round(fit.residualRmseKg * 1000) / 1000,
      p_data_start: startDate,
      p_data_end: endDate,
      p_complete_days: trimmedSegment.length,
      p_weight_points: fit.weightPoints,
      p_source_references: refs,
    },
  );
  if (applyError || !historyId) return null;

  const { data: created, error: historyError } = await db
    .from("calorie_target_history")
    .select("*")
    .eq("id", historyId)
    .eq("member_id", member.id)
    .single();
  if (historyError || !created) return null;

  return historyToPublic(created);
}

export const getAdaptiveTargetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientDate: string }) => ({
    clientDate: dateSchema.parse(input.clientDate),
  }))
  .handler(async ({ data, context }): Promise<AdaptiveTargetStatus> => {
    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) {
      return {
        enabled: false,
        configurationReady: false,
        yesterdayComplete: false,
        latestUnseenChange: null,
      };
    }

    const member = await readMember(db, memberId);
    if (!member) {
      return {
        enabled: false,
        configurationReady: false,
        yesterdayComplete: false,
        latestUnseenChange: null,
      };
    }

    const yesterday = addDays(data.clientDate, -1);
    const [{ data: completed }, { data: unseen }] = await Promise.all([
      db
        .from("nutrition_day_completeness")
        .select("log_date")
        .eq("member_id", memberId)
        .eq("log_date", yesterday)
        .maybeSingle(),
      db
        .from("calorie_target_history")
        .select("*")
        .eq("member_id", memberId)
        .is("seen_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      enabled: member.adaptive_targets_enabled,
      configurationReady: configurationReady(member),
      yesterdayComplete: Boolean(completed),
      latestUnseenChange: unseen ? historyToPublic(unseen) : null,
    };
  });

export const markNutritionDayComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    logDate: string;
    clientDate: string;
    complete: boolean;
  }) => ({
    logDate: dateSchema.parse(input.logDate),
    clientDate: dateSchema.parse(input.clientDate),
    complete: z.boolean().parse(input.complete),
  }))
  .handler(async ({ data, context }) => {
    if (data.logDate > data.clientDate) {
      return { ok: false as const, error: "FUTURE_DATE" };
    }

    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) return { ok: false as const, error: "NOT_MEMBER" };

    const member = await readMember(db, memberId);
    if (!member) return { ok: false as const, error: "NOT_MEMBER" };
    if (data.logDate < member.created_at.slice(0, 10)) {
      return { ok: false as const, error: "BEFORE_ACCOUNT" };
    }

    if (data.complete) {
      const { error } = await db
        .from("nutrition_day_completeness")
        .upsert({
          member_id: memberId,
          log_date: data.logDate,
          completed_at: new Date().toISOString(),
        });
      if (error) return { ok: false as const, error: "SAVE_FAILED" };
    } else {
      const { error } = await db
        .from("nutrition_day_completeness")
        .delete()
        .eq("member_id", memberId)
        .eq("log_date", data.logDate);
      if (error) return { ok: false as const, error: "SAVE_FAILED" };
    }

    const change =
      data.complete && member.adaptive_targets_enabled
        ? await evaluateAdaptiveTargetForMember(db, member, data.clientDate)
        : null;

    return { ok: true as const, change };
  });

export const acknowledgeAdaptiveTargetChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { historyId: string }) => ({
    historyId: z.string().uuid().parse(input.historyId),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await memberIdFor(db, context.userId);
    if (!memberId) return { ok: false as const, error: "NOT_MEMBER" };

    const { error } = await db
      .from("calorie_target_history")
      .update({ seen_at: new Date().toISOString() })
      .eq("id", data.historyId)
      .eq("member_id", memberId);

    if (error) return { ok: false as const, error: "SAVE_FAILED" };
    return { ok: true as const };
  });
