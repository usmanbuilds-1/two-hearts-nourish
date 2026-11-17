/** Server-side AI quota guard. The database RPC is atomic across app instances. */
export type AiQuotaMode = "scan" | "text" | "plan" | "strong_scan";

const MEMBER_CAPS: Record<AiQuotaMode, number> = {
  scan: 12,
  text: 30,
  plan: 4,
  strong_scan: 4,
};

const GLOBAL_CAP_DEFAULTS: Record<AiQuotaMode, number> = {
  scan: 1000,
  text: 2000,
  plan: 250,
  strong_scan: 250,
};

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function memberCap(mode: AiQuotaMode): number {
  const key = `AI_MEMBER_DAILY_CAP_${mode.toUpperCase()}`;
  return positiveIntEnv(key, MEMBER_CAPS[mode]);
}

function globalCap(mode: AiQuotaMode): number {
  const key = `AI_GLOBAL_DAILY_CAP_${mode.toUpperCase()}`;
  return positiveIntEnv(key, GLOBAL_CAP_DEFAULTS[mode]);
}

export async function claimAiQuota(memberId: string, mode: AiQuotaMode): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("claim_ai_request_v2", {
    p_member_id: memberId,
    p_mode: mode,
    p_member_daily_cap: memberCap(mode),
    p_global_daily_cap: globalCap(mode),
  });
  if (error) {
    // Do not call a paid provider if quota storage is unavailable.
    throw new Error("AI_QUOTA_UNAVAILABLE");
  }
  return data === true;
}
