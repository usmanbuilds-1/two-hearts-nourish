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
        { onConflict: "member_id,logged_date" }
      );
    if (error) throw new Error("SERVER_ERROR");
    return { ok: true };
  });

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
