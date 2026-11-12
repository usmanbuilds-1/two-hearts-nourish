import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {mealsToCsv} from "./export-meals";

/** Export is tied to the current authenticated member; partner's meals stay private. */
export const exportMyMealsCsv = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}):Promise<string>=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {data:device,error:memberError}=await supabaseAdmin.from("member_devices")
      .select("member_id").eq("auth_user_id",context.userId).maybeSingle();
    if(memberError)throw new Error("SERVER_ERROR");
    if(!device)throw new Error("NOT_MEMBER");
    const all:Array<Record<string,unknown>>=[];
    for(let offset=0;offset<10_000;offset+=500){
      const {data,error}=await supabaseAdmin.from("meals").select(
        "meal_date,meal_type,food_name,serving_description,calories,protein,carbs,fat,is_planned,portion_percentage,created_at"
      ).eq("member_id",device.member_id)
        .order("created_at",{ascending:true}).range(offset,offset+499);
      if(error)throw new Error("EXPORT_FAILED");
      all.push(...(data??[]));
      if((data?.length??0)<500)return mealsToCsv(all);
    }
    throw new Error("EXPORT_TOO_LARGE");
  });
