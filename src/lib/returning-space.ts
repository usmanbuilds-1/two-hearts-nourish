import { supabase } from "@/integrations/supabase/client";

/** Recover an existing authenticated membership when only the local room marker disappeared.
 * Never sign up or create a new anonymous identity during this lookup.
 */
export async function findExistingSignedInSpace(): Promise<{roomCode:string;memberId:string}|null> {
  const {data:session,error:sessionError}=await supabase.auth.getSession();
  if(sessionError)throw new Error("OFFLINE_OR_UNAVAILABLE");
  const userId=session.session?.user.id;
  if(!userId)return null;
  const {data:device,error:deviceError}=await supabase.from("member_devices")
    .select("member_id").eq("auth_user_id",userId).maybeSingle();
  if(deviceError)throw new Error("OFFLINE_OR_UNAVAILABLE");
  if(!device)return null;
  const {data:member,error:memberError}=await supabase.from("members")
    .select("id,room_id").eq("id",device.member_id).maybeSingle();
  if(memberError||!member)throw new Error("OFFLINE_OR_UNAVAILABLE");
  const {data:room,error:roomError}=await supabase.from("rooms")
    .select("room_code").eq("id",member.room_id).maybeSingle();
  if(roomError||!room)throw new Error("OFFLINE_OR_UNAVAILABLE");
  return {roomCode:room.room_code,memberId:member.id};
}
