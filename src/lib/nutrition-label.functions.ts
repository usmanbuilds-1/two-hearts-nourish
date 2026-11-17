import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { claimAiQuota } from "./ai-quota.server";
import { labelEnergyWarning } from "./scan-v2";

const MODEL = "gemini-3.5-flash-lite";
const SCANNER_VERSION = "two-hearts-label-v1.0.0";
const PROMPT_VERSION = "visible-label-only-v1";

const labelSchema = z.object({
  product_name: z.string().trim().max(160).nullable(),
  basis: z.enum(["per_100g","per_100ml","per_serving","per_package"]),
  serving_size_g: z.number().finite().positive().max(10000).nullable(),
  serving_size_ml: z.number().finite().positive().max(10000).nullable(),
  calories: z.number().finite().min(0).max(10000).nullable(),
  protein: z.number().finite().min(0).max(1000).nullable(),
  carbs: z.number().finite().min(0).max(1000).nullable(),
  fat: z.number().finite().min(0).max(1000).nullable(),
  confidence: z.number().finite().min(0).max(1),
});

function parseImage(dataUrl: string): { mime: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/s);
  if (!match) return null;
  try {
    const binary = atob(match[2]!);
    if (binary.length < 8 || binary.length > 2_300_000) return null;
    const b = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const jpeg = b[0]===0xff && b[1]===0xd8 && b[2]===0xff;
    const png = b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47;
    const webp = b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46 && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50;
    if ((match[1]==="image/jpeg"&&!jpeg)||(match[1]==="image/png"&&!png)||(match[1]==="image/webp"&&!webp)) return null;
    return { mime: match[1]!, base64: match[2]! };
  } catch { return null; }
}

export const scanNutritionLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { image: string }) => ({
    image: z.string().max(3_100_000).parse(input.image),
  }))
  .handler(async ({ data, context }) => {
    if (process.env["SCANNER_V2_ENABLED"] === "false") return { ok: false as const, error: "V2_DISABLED" };
    const image = parseImage(data.image);
    if (!image) return { ok: false as const, error: "INVALID_IMAGE" };
    const { data: device, error: deviceError } = await context.supabase
      .from("member_devices").select("member_id").eq("auth_user_id",context.userId).maybeSingle();
    if (deviceError || !device) return { ok:false as const,error:"NOT_MEMBER" };
    try {
      if (!(await claimAiQuota(device.member_id,"scan"))) return {ok:false as const,error:"AI_LIMIT"};
    } catch {
      return {ok:false as const,error:"AI_QUOTA_UNAVAILABLE"};
    }
    const apiKey=process.env["GEMINI_API_KEY"];
    if(!apiKey)return {ok:false as const,error:"AI_UNAVAILABLE"};

    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {data:event,error:eventError}=await supabaseAdmin.from("scan_events").insert({
      member_id:device.member_id,scanner_version:SCANNER_VERSION,prompt_version:PROMPT_VERSION,
      model:MODEL,route:"label",status:"started"
    }).select("id").single();
    if(eventError||!event)return {ok:false as const,error:"V2_STORAGE_UNAVAILABLE"};

    const started=Date.now();
    try{
      const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
        signal:AbortSignal.timeout(12_000),
        body:JSON.stringify({
          system_instruction:{parts:[{text:`Transcribe a visible nutrition facts panel conservatively.
Use ONLY values visibly printed in the image. Do not infer missing macros, do not convert kJ to kcal, do not calculate per-100g from a serving, and do not guess package size.
Choose the basis exactly as printed: per_100g, per_100ml, per_serving, or per_package.
If a requested value is not visibly present, return null.
Return JSON only with: product_name,basis,serving_size_g,serving_size_ml,calories,protein,carbs,fat,confidence.`}]},
          contents:[{role:"user",parts:[{inline_data:{mime_type:image.mime,data:image.base64}}]}],
          generationConfig:{response_mime_type:"application/json",temperature:0,maxOutputTokens:700}
        })
      });
      if(!response.ok)throw Object.assign(new Error("Gemini HTTP "+response.status),{status:response.status});
      const raw=await response.json() as {
        candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>;
        usageMetadata?:{promptTokenCount?:number;candidatesTokenCount?:number;thoughtsTokenCount?:number;totalTokenCount?:number};
      };
      const text=raw.candidates?.[0]?.content?.parts?.[0]?.text??"";
      const match=text.replace(/```(?:json)?/gi,"").match(/\{[\s\S]*\}/);
      const parsed=match?labelSchema.safeParse(JSON.parse(match[0])):null;
      if(!parsed||!parsed.success)throw new Error("LABEL_MALFORMED");
      const label=parsed.data;
      const usage=raw.usageMetadata;
      await supabaseAdmin.from("scan_events").update({
        status:"succeeded",latency_ms:Date.now()-started,
        input_tokens:usage?.promptTokenCount??0,
        output_tokens:usage?.candidatesTokenCount??0,
        thinking_tokens:usage?.thoughtsTokenCount??0,
        total_tokens:usage?.totalTokenCount??0,
        grounding_sources:["nutrition-label"],
        confidence:label.confidence
      }).eq("id",event.id).eq("member_id",device.member_id);

      const required=[label.calories,label.protein,label.carbs,label.fat];
      if(required.some((value)=>value==null)){
        return {ok:false as const,error:"LABEL_INCOMPLETE",scanId:event.id};
      }
      const warning=labelEnergyWarning({
        calories:label.calories!,protein:label.protein!,carbs:label.carbs!,fat:label.fat!
      });
      const grams=label.basis==="per_100g"?100:label.serving_size_g;
      const serving=label.basis==="per_100ml"?"Per 100 ml":
        label.basis==="per_100g"?"Per 100 g":
        label.basis==="per_package"?"Per package":"Per serving";

      const {data:item,error:itemError}=await supabaseAdmin.from("scan_items").insert({
        scan_id:event.id,member_id:device.member_id,item_index:0,
        label:label.product_name||"Nutrition label item",
        grams_estimate:grams,grams_min:grams,grams_max:grams,
        calories:label.calories,protein:label.protein,carbs:label.carbs,fat:label.fat,
        confidence:label.confidence,hidden_fat_risk:"low",
        source_name:"nutrition-label",source_ref:null
      }).select("id").single();
      if(itemError||!item)return {ok:false as const,error:"V2_STORAGE_UNAVAILABLE"};

      return {ok:true as const,estimate:{
        scan_id:event.id,
        food_name:label.product_name||"Nutrition label item",
        serving_description:serving,
        calories:label.calories!,protein:label.protein!,carbs:label.carbs!,fat:label.fat!,
        confidence:label.confidence>=0.8?"high" as const:label.confidence>=0.55?"medium" as const:"low" as const,
        confidence_score:label.confidence,
        components:[{
          id:item.id,label:label.product_name||"Nutrition label item",serving_description:serving,
          grams_estimate:grams,grams_min:grams,grams_max:grams,
          calories:label.calories!,protein:label.protein!,carbs:label.carbs!,fat:label.fat!,
          confidence:label.confidence,hidden_fat_risk:"low" as const,
          source_name:"nutrition-label" as const,source_ref:null,packaged_food:null
        }],
        questions:warning?[warning]:[],
        escalated:false,
        packaged_food:null
      }};
    }catch(error){
      const status=typeof error==="object"&&error&&"status"in error?Number((error as {status?:unknown}).status):undefined;
      await supabaseAdmin.from("scan_events").update({status:"failed",latency_ms:Date.now()-started}).eq("id",event.id);
      if(status===429)return {ok:false as const,error:"AI_BUSY"};
      if(status===402||status===403)return {ok:false as const,error:"AI_CREDITS"};
      if(String((error as Error)?.message).includes("LABEL_MALFORMED"))return {ok:false as const,error:"LABEL_MALFORMED"};
      return {ok:false as const,error:"AI_FAILED"};
    }
  });
