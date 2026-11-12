/** Server-side per-member quota. The RPC is atomic across all app instances. */
export async function claimAiQuota(memberId:string,mode:"scan"|"text"):Promise<boolean> {
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data,error}=await supabaseAdmin.rpc("claim_ai_request",{
    p_member_id:memberId,
    p_mode:mode,
    p_daily_cap:mode==="scan"?12:30
  });
  if(error)throw new Error("AI_QUOTA_UNAVAILABLE");
  return data===true;
}
