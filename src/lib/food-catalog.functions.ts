import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeOffProduct, type PackagedFood } from "./off-food";

const API = "https://world.openfoodfacts.org";
const fields = "code,product_name,brands,nutriments,serving_size";
type Result = { ok:true; foods:PackagedFood[] } | { ok:false; error:"NOT_FOUND"|"UPSTREAM_UNAVAILABLE"|"RATE_LIMIT"|"NOT_MEMBER" };
const cache = new Map<string,{at:number;foods:PackagedFood[]}>();
const requests = new Map<string,{reset:number;count:number}>();
const DEFAULT_UA = "TwoHeartsNourish/1.0 (https://github.com/usmanbuilds-1/two-hearts-nourish)";

function quota(id:string, kind:"search"|"barcode"):boolean {
  const key = id+":"+kind;
  const now=Date.now();
  const existing=requests.get(key);
  const entry=!existing||now>existing.reset?{reset:now+60_000,count:0}:existing;
  const maximum=kind==="search"?4:5;
  if(entry.count>=maximum)return false;
  entry.count++;
  requests.set(key,entry);
  if(requests.size>500)requests.clear();
  return true;
}

async function authorizedMember(uid:string):Promise<boolean> {
  const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
  const {data,error}=await supabaseAdmin.from("member_devices")
    .select("member_id").eq("auth_user_id",uid).maybeSingle();
  if(error)throw new Error("SERVER_ERROR");
  return Boolean(data);
}

async function offFetch(path:string):Promise<unknown> {
  const response=await fetch(API+path,{
    headers:{"User-Agent":process.env["OPEN_FOOD_FACTS_USER_AGENT"] ?? DEFAULT_UA,"Accept":"application/json"},
    signal:AbortSignal.timeout(8000),
  });
  if(response.status===429||response.status===503)throw new Error("RATE_LIMIT");
  if(!response.ok)throw new Error("UPSTREAM_UNAVAILABLE");
  return response.json();
}

async function getFoods(cacheKey:string,memberId:string,kind:"search"|"barcode",path:string):Promise<Result> {
  const now=Date.now();
  const hit=cache.get(cacheKey);
  if(hit && now-hit.at<10*60_000) return {ok:true,foods:hit.foods};
  if(!quota(memberId,kind))return {ok:false,error:"RATE_LIMIT"};
  try {
    const raw=await offFetch(path) as {product?:unknown;products?:unknown[]};
    const originals=raw.products??(raw.product?[raw.product]:[]);
    const foods=originals.map(normalizeOffProduct).filter((p):p is PackagedFood=>Boolean(p));
    cache.set(cacheKey,{at:now,foods});
    if(cache.size>120)cache.clear();
    return foods.length?{ok:true,foods}:{ok:false,error:"NOT_FOUND"};
  }catch(error) {
    return {ok:false,error:String(error).includes("RATE_LIMIT")?"RATE_LIMIT":"UPSTREAM_UNAVAILABLE"};
  }
}

export const searchPackagedFoods = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{query:string})=>({
    query:z.string().trim().min(2).max(80).parse(i.query)
  }))
  .handler(async ({data,context}):Promise<Result>=>{
    if(!(await authorizedMember(context.userId)))return {ok:false,error:"NOT_MEMBER"};
    // Search on deliberate submit only. OFF limits search to 10 requests/min/IP.
    const qs=new URLSearchParams({
      search_terms:data.query,search_simple:"1",action:"process",json:"1",page_size:"10",fields
    });
    return getFoods("search:"+data.query.toLowerCase(),context.userId,"search", "/cgi/search.pl?"+qs.toString());
  });

export const lookupPackagedBarcode = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{barcode:string})=>({
    barcode:z.string().trim().regex(/^\d{8,14}$/).parse(i.barcode)
  }))
  .handler(async ({data,context}):Promise<Result>=>{
    if(!(await authorizedMember(context.userId)))return {ok:false,error:"NOT_MEMBER"};
    return getFoods("barcode:"+data.barcode,context.userId,"barcode",
      "/api/v2/product/"+encodeURIComponent(data.barcode)+".json?fields="+encodeURIComponent(fields));
  });
