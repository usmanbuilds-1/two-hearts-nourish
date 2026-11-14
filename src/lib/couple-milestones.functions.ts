import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {z} from "zod";
import {validMilestoneDate} from "./couple-milestones";

export type CoupleMilestone={
  id:string;
  room_id:string;
  created_by_member_id:string;
  title:string;
  milestone_date:string;
  note:string|null;
  repeats_annually:boolean;
  created_at:string;
  updated_at:string;
};
async function admin(){
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
type Db=Awaited<ReturnType<typeof admin>>;

async function currentMember(db:Db,userId:string):Promise<{id:string;roomId:string}>{
  const {data:device,error:devError}=await db.from("member_devices")
    .select("member_id").eq("auth_user_id",userId).maybeSingle();
  if(devError||!device)throw new Error("NOT_MEMBER");
  const {data:member,error:memberError}=await db.from("members")
    .select("id,room_id").eq("id",device.member_id).maybeSingle();
  if(memberError||!member)throw new Error("NOT_MEMBER");
  return {id:member.id,roomId:member.room_id};
}

export const listOurMilestones=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}):Promise<CoupleMilestone[]>=>{
    const db=await admin();
    const current=await currentMember(db,context.userId);
    const {data,error}=await db.from("couple_milestones")
      .select("id,room_id,created_by_member_id,title,milestone_date,note,repeats_annually,created_at,updated_at")
      .eq("room_id",current.roomId)
      .order("milestone_date",{ascending:false})
      .limit(80);
    if(error)throw new Error("MILESTONES_UNAVAILABLE");
    return (data??[]) as CoupleMilestone[];
  });

const milestoneInput=z.object({
  id:z.string().uuid().optional(),
  title:z.string().trim().min(1).max(100),
  milestoneDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note:z.string().trim().max(500).default(""),
  annual:z.boolean().default(false),
});

export const saveOurMilestone=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{id?:string;title:string;milestoneDate:string;note?:string;annual?:boolean})=>
    milestoneInput.parse(i))
  .handler(async ({data,context}):Promise<CoupleMilestone>=>{
    if(!validMilestoneDate(data.milestoneDate))throw new Error("INVALID_DATE");
    const db=await admin();
    const current=await currentMember(db,context.userId);
    const values={
      title:data.title,
      milestone_date:data.milestoneDate,
      note:data.note||null,
      repeats_annually:data.annual,
    };
    if(data.id){
      // A partner can read a shared event but cannot overwrite the other's entry.
      const {data:row,error}=await db.from("couple_milestones")
        .update(values)
        .eq("id",data.id)
        .eq("room_id",current.roomId)
        .eq("created_by_member_id",current.id)
        .select("*").maybeSingle();
      if(error)throw new Error("MILESTONE_SAVE_FAILED");
      if(!row)throw new Error("NOT_YOUR_MILESTONE");
      return row as CoupleMilestone;
    }
    const {count,error:countError}=await db.from("couple_milestones")
      .select("id",{head:true,count:"exact"}).eq("room_id",current.roomId);
    if(countError)throw new Error("MILESTONE_SAVE_FAILED");
    if((count??0)>=80)throw new Error("MILESTONE_LIMIT_REACHED");
    const {data:row,error}=await db.from("couple_milestones")
      .insert({...values,room_id:current.roomId,created_by_member_id:current.id})
      .select("*").single();
    if(error||!row)throw new Error("MILESTONE_SAVE_FAILED");
    return row as CoupleMilestone;
  });

export const deleteOurMilestone=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{id:string})=>({id:z.string().uuid().parse(i.id)}))
  .handler(async ({data,context})=>{
    const db=await admin();
    const current=await currentMember(db,context.userId);
    const {data:row,error}=await db.from("couple_milestones").delete()
      .eq("id",data.id)
      .eq("room_id",current.roomId)
      .eq("created_by_member_id",current.id)
      .select("id").maybeSingle();
    if(error)throw new Error("MILESTONE_DELETE_FAILED");
    if(!row)throw new Error("NOT_YOUR_MILESTONE");
    return {ok:true};
  });
