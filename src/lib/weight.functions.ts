import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { calendarDaysAgo, calendarRollingAverage, weightPlateauSpan, weightTrendKgPerWeek } from "./weight-math";
import { isCurrentLocalCalendarDate } from "./local-calendar-boundary";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function deviceMemberId(db: Awaited<ReturnType<typeof admin>>, uid: string) {
  const { data } = await db.from("member_devices").select("member_id").eq("auth_user_id", uid).maybeSingle();
  return data?.member_id ?? null;
}

export type WeightEntry = { logged_date: string; weight_kg: number };

export type WeightAnalytics = {
  entries: WeightEntry[];          // ascending, last 90 days
  rollingAvg: Array<{ logged_date: string; avg: number }>;
  latestWeight: number | null;
  startWeight:  number | null;
  avgWeight:    number | null;
  minWeight:    number | null;
  maxWeight:    number | null;
  totalChange:  number | null;     // positive = gained, negative = lost
  trendKgPerWeek: number | null;   // linear regression slope × 7
  plateauDetected: boolean;
  plateauDays:    number;
};

const EMPTY_ANALYTICS: WeightAnalytics = {
  entries: [], rollingAvg: [],
  latestWeight: null, startWeight: null, avgWeight: null,
  minWeight: null, maxWeight: null, totalChange: null,
  trendKgPerWeek: null, plateauDetected: false, plateauDays: 0,
};

// ── log (upsert today) ────────────────────────────────────────────────────
export const logWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { weightKg: number; clientDate: string }) => ({
    weightKg: z.number().finite().min(20).max(400).parse(i.weightKg),
    clientDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.clientDate),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    // The migration-backed RPC performs both writes within one transaction,
    // deriving the member again from the authenticated browser device.
    const today = data.clientDate;
    if (!isCurrentLocalCalendarDate(today)) throw new Error("INVALID_DATE");
    const { data: applied, error } = await db.rpc("log_member_weight_atomic", {
      p_actor_auth_user_id: context.userId,
      p_log_date: today,
      p_weight_kg: data.weightKg,
    });
    if (error || applied !== true) throw new Error("SERVER_ERROR");
    return { ok: true, logged_date: today, weight_kg: data.weightKg };
  });

// ── simple log (last 30, descending) — kept for settings sparkline ────────
export const getWeightLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ entries: WeightEntry[] }> => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) return { entries: [] };
    const { data } = await db
      .from("weight_logs")
      .select("logged_date, weight_kg")
      .eq("member_id", memberId)
      .order("logged_date", { ascending: false })
      .limit(30);
    return { entries: (data ?? []) as WeightEntry[] };
  });

// ── full analytics (90 days, ascending) ─────────────────────────────────
export const getWeightAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clientDate: string }) => ({ clientDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.clientDate) }))
  .handler(async ({ data, context }): Promise<WeightAnalytics> => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) return EMPTY_ANALYTICS;

    const fromDate = calendarDaysAgo(data.clientDate, 90);

    const { data: weightRows } = await db
      .from("weight_logs")
      .select("logged_date, weight_kg")
      .eq("member_id", memberId)
      .gte("logged_date", fromDate)
      .order("logged_date", { ascending: true });

    const entries: WeightEntry[] = (weightRows ?? []).map((e) => ({
      logged_date: e.logged_date as string,
      weight_kg:  Number(e.weight_kg),
    }));

    if (entries.length === 0) return EMPTY_ANALYTICS;

    const weights = entries.map((e) => e.weight_kg);
    const n = weights.length;

    const latestWeight = weights[n - 1]!;
    const startWeight  = weights[0]!;
    const avgWeight    = Math.round((weights.reduce((a, b) => a + b, 0) / n) * 10) / 10;
    const minWeight    = Math.min(...weights);
    const maxWeight    = Math.max(...weights);
    const totalChange  = Math.round((latestWeight - startWeight) * 100) / 100;

    const rollingAvg = calendarRollingAverage(entries);
    const trendKgPerWeek = weightTrendKgPerWeek(entries);

    // Plateau: last 14 calendar days, at least 3 entries, and the
    // observations must actually span most of that window. Three weigh-ins over
    // two days are not a two-week plateau.
    const p14str = calendarDaysAgo(data.clientDate, 14);
    const recent = entries.filter((e) => e.logged_date >= p14str);
    const plateau = weightPlateauSpan(recent, {
      minEntries: 3,
      minSpanDays: 10,
      maxRangeKg: 0.5,
    });
    const plateauDetected = plateau.detected;
    const plateauDays = plateau.detected ? plateau.spanDays : 0;

    return {
      entries, rollingAvg,
      latestWeight, startWeight, avgWeight,
      minWeight, maxWeight, totalChange,
      trendKgPerWeek,
      plateauDetected, plateauDays,
    };
  });
