import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(s: string) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
}

export type KnownDevice = {
  id: string;
  label: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string | null;
};

export const listMyDevices = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{currentLabel?:string})=>({
    currentLabel:z.string().trim().max(40).optional().parse(i?.currentLabel),
  }))
  .handler(async ({data,context}):Promise<KnownDevice[]>=>{
    const db=await admin();
    const {data:current,error:memberError}=await db.from("member_devices")
      .select("id,member_id").eq("auth_user_id",context.userId).maybeSingle();
    if(memberError)throw new Error("SERVER_ERROR");
    if(!current)throw new Error("NOT_MEMBER");
    const now=new Date().toISOString();
    const {error:touchError}=await db.from("member_devices").update({
      last_seen_at:now,...(data.currentLabel?{device_label:data.currentLabel}:{})
    }).eq("id",current.id);
    if(touchError)throw new Error("SERVER_ERROR");
    const {data:devices,error}=await db.from("member_devices")
      .select("id,device_label,created_at,last_seen_at").eq("member_id",current.member_id)
      .order("created_at",{ascending:false});
    if(error)throw new Error("SERVER_ERROR");
    return (devices??[]).map(d=>({
      id:d.id,label:d.device_label??"Unnamed device",current:d.id===current.id,
      createdAt:d.created_at,lastSeenAt:d.last_seen_at
    }));
  });

export const rotateMyRecoveryKeys = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{revokeDeviceId?:string})=>({
    revokeDeviceId:z.string().uuid().optional().parse(i?.revokeDeviceId)
  }))
  .handler(async ({data,context})=>{
    const db=await admin();
    const key=newKey();
    const {data:ok,error}=await db.rpc("rotate_member_recovery",{
      p_actor_auth_user_id:context.userId,
      p_replacement_hash:await sha256(key),
      p_revoke_device_id:data.revokeDeviceId??null
    });
    if(error||!ok)throw new Error("RECOVERY_ROTATION_FAILED");
    return {key};
  });
