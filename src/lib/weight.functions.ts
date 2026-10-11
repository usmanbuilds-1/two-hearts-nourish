import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  .inputValidator((i: { weightKg: number }) => ({
    weightKg: z.number().min(20).max(400).parse(i.weightKg),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) throw new Error("NOT_MEMBER");
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await db
      .from("weight_logs")
      .upsert(
        { member_id: memberId, logged_date: today, weight_kg: data.weightKg },
        { onConflict: "member_id,logged_date" },
      );
    if (error) throw new Error("SERVER_ERROR");
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
export const getWeightAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WeightAnalytics> => {
    const db = await admin();
    const memberId = await deviceMemberId(db, context.userId);
    if (!memberId) return EMPTY_ANALYTICS;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const fromDate = cutoff.toISOString().slice(0, 10);

    const { data } = await db
      .from("weight_logs")
      .select("logged_date, weight_kg")
      .eq("member_id", memberId)
      .gte("logged_date", fromDate)
      .order("logged_date", { ascending: true });

    const entries: WeightEntry[] = (data ?? []).map((e) => ({
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

    // 7-day rolling average
    const rollingAvg = entries.map((e, i) => {
      const window = entries.slice(Math.max(0, i - 6), i + 1);
      const avg = window.reduce((a, b) => a + b.weight_kg, 0) / window.length;
      return { logged_date: e.logged_date, avg: Math.round(avg * 10) / 10 };
    });

    // Linear regression → trend kg/week
    let trendKgPerWeek: number | null = null;
    if (n >= 3) {
      const xs = entries.map((_, i) => i);
      const ys = weights;
      const sumX  = xs.reduce((a, b) => a + b, 0);
      const sumY  = ys.reduce((a, b) => a + b, 0);
      const sumXY = xs.reduce((a, x, i) => a + x * (ys[i] ?? 0), 0);
      const sumX2 = xs.reduce((a, x) => a + x * x, 0);
      const denom = n * sumX2 - sumX * sumX;
      if (denom !== 0) {
        const slopePerEntry = (n * sumXY - sumX * sumY) / denom;
        trendKgPerWeek = Math.round(slopePerEntry * 7 * 100) / 100;
      }
    }

    // Plateau: last 14 days, ≥3 entries, range < 0.5 kg
    const p14 = new Date();
    p14.setDate(p14.getDate() - 14);
    const p14str = p14.toISOString().slice(0, 10);
    const recent = entries.filter((e) => e.logged_date >= p14str);
    let plateauDetected = false;
    let plateauDays = 0;
    if (recent.length >= 3) {
      const rw = recent.map((e) => e.weight_kg);
      if (Math.max(...rw) - Math.min(...rw) < 0.5) {
        plateauDetected = true;
        const firstD = new Date(recent[0]!.logged_date).getTime();
        const lastD  = new Date(recent[recent.length - 1]!.logged_date).getTime();
        plateauDays = Math.round((lastD - firstD) / 86_400_000);
      }
    }

    return {
      entries, rollingAvg,
      latestWeight, startWeight, avgWeight,
      minWeight, maxWeight, totalChange,
      trendKgPerWeek,
      plateauDetected, plateauDays,
    };
  });
