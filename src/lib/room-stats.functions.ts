import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const stats = z.object({
  totalMeals:z.number().int().min(0),
  daysActive:z.number().int().min(0),
  daysBoth:z.number().int().min(0),
  daysBothProtein:z.number().int().min(0),
  sharedDinners:z.number().int().min(0),
  firstBothDay:z.string().nullable(),
  streak:z.number().int().min(0)
});
export type RoomLifetimeStats = z.infer<typeof stats>;

export const getRoomLifetimeStats = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{clientDate:string})=>({
    clientDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(i.clientDate)
  }))
  .handler(async ({data,context}):Promise<RoomLifetimeStats>=>{
    const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
    const {data:device,error:devError}=await supabaseAdmin.from("member_devices")
      .select("member_id").eq("auth_user_id",context.userId).maybeSingle();
    if(devError)throw new Error("SERVER_ERROR");
    if(!device)throw new Error("NOT_MEMBER");
    const {data:member,error:memberError}=await supabaseAdmin.from("members")
      .select("room_id").eq("id",device.member_id).single();
    if(memberError||!member)throw new Error("NOT_MEMBER");
    const {data:rollup,error}=await supabaseAdmin.rpc("room_activity_rollup",{
      p_room_id:member.room_id,p_today:data.clientDate
    });
    if(error)throw new Error("ROOM_STATS_UNAVAILABLE");
    return stats.parse(rollup);
  });
