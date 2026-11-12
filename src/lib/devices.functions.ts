import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { shouldUpgradeDeviceLabel } from "./device-label";

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
      .select("id,member_id,device_label").eq("auth_user_id",context.userId).maybeSingle();
    if(memberError)throw new Error("SERVER_ERROR");
    if(!current)throw new Error("NOT_MEMBER");
    const now=new Date().toISOString();
    const {error:touchError}=await db.from("member_devices").update({
      last_seen_at:now,...(shouldUpgradeDeviceLabel(current.device_label,data.currentLabel)?{device_label:data.currentLabel}:{})
    }).eq("id",current.id);
    if(touchError)throw new Error("SERVER_ERROR");
    const {data:devices,error}=await db.from("member_devices")
      .select("id,device_label,created_at,last_seen_at").eq("member_id",current.member_id)
      .order("created_at",{ascending:false});
    if(error)throw new Error("SERVER_ERROR");
    return (devices??[]).map(d=>({
      id:d.id,label:d.device_label??(d.id===current.id?"This browser":"Unidentified browser"),current:d.id===current.id,
      createdAt:d.created_at,lastSeenAt:d.last_seen_at
    }));
  });

/** Mark actual app activity for a mapped device, not merely Settings visits. */
export const markMyDeviceActive = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{deviceLabel?:string})=>({
    deviceLabel:z.string().trim().max(40).optional().parse(i?.deviceLabel)
  }))
  .handler(async ({data,context})=>{
    const db=await admin();
    const {data:device,error}=await db.from("member_devices")
      .select("id,device_label").eq("auth_user_id",context.userId).maybeSingle();
    if(error||!device)return {ok:false};
    const {error:updateError}=await db.from("member_devices").update({
      last_seen_at:new Date().toISOString(),
      ...(shouldUpgradeDeviceLabel(device.device_label,data.deviceLabel)?{device_label:data.deviceLabel}:{})
    }).eq("id",device.id);
    return {ok:!updateError};
  });

export const rotateMyRecoveryKeys = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{revokeDeviceId?:string;revokeDeviceIds?:string[]})=>({
    revokeDeviceId:z.string().uuid().optional().parse(i?.revokeDeviceId),
    revokeDeviceIds:z.array(z.string().uuid()).min(1).max(50).optional().parse(i?.revokeDeviceIds)
  }))
  .handler(async ({data,context})=>{
    const db=await admin();
    const key=newKey();
    if(data.revokeDeviceIds&&data.revokeDeviceId)throw new Error("INVALID_DEVICE_SELECTION");
    const hash=await sha256(key);
    if(data.revokeDeviceIds){
      const {data:count,error}=await db.rpc("rotate_member_recovery_many",{
        p_actor_auth_user_id:context.userId,
        p_replacement_hash:hash,
        p_revoke_device_ids:data.revokeDeviceIds
      });
      if(error||typeof count!=="number"||count!==data.revokeDeviceIds.length)
        throw new Error("RECOVERY_ROTATION_FAILED");
      return {key,revokedCount:count};
    }
    const {data:ok,error}=await db.rpc("rotate_member_recovery",{
      p_actor_auth_user_id:context.userId,
      p_replacement_hash:hash,
      p_revoke_device_id:data.revokeDeviceId??null
    });
    if(error||!ok)throw new Error("RECOVERY_ROTATION_FAILED");
    return {key,revokedCount:data.revokeDeviceId?1:0};
  });


/** Rename only the caller's own device. This changes a display label, not an identity. */
export const renameMyDevice = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{label:string})=>({
    label:z.string().trim().min(2).max(40).parse(i.label)
  }))
  .handler(async ({data,context})=>{
    const db=await admin();
    const {data:row,error}=await db.from("member_devices")
      .update({device_label:data.label})
      .eq("auth_user_id",context.userId)
      .select("id")
      .maybeSingle();
    if(error)throw new Error("SERVER_ERROR");
    if(!row)throw new Error("NOT_MEMBER");
    return {ok:true};
  });
