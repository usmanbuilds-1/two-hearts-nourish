import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { claimAiQuota } from "./ai-quota.server";
import {
  addedFatNutrition,
  contextualQuestions,
  evidenceConfidence,
  normalizeFoodAlias,
  foodFingerprint,
  parseDeterministicContext,
  type HiddenFatRisk,
} from "./scan-v2";
import { scaleUsda, searchUsdaFood } from "./usda-food.server";
import type { DetectedPackage } from "./packaged-scan";

const SCANNER_VERSION = "two-hearts-scanner-v2.0.0";
const PROMPT_VERSION = "vision-components-v2.0";
const CHEAP_MODEL = "gemini-3.5-flash-lite";
const STRONG_MODEL = "gemini-3.8-flash";

const packageSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  product: z.string().trim().min(1).max(140),
  pack_count: z.number().int().min(1).max(20).nullable(),
  grams_per_pack: z.number().positive().max(2000).nullable(),
}).nullable().optional();

const fallbackNutritionSchema = z.object({
  calories: z.number().finite().min(0).max(10000),
  protein: z.number().finite().min(0).max(1000),
  carbs: z.number().finite().min(0).max(1000),
  fat: z.number().finite().min(0).max(1000),
});

const componentSchema = z.object({
  label: z.string().trim().min(1).max(160),
  serving_description: z.string().trim().max(200).optional().default(""),
  grams_estimate: z.number().finite().min(0).max(10000).nullable(),
  grams_min: z.number().finite().min(0).max(10000).nullable(),
  grams_max: z.number().finite().min(0).max(10000).nullable(),
  recognition_confidence: z.number().finite().min(0).max(1),
  portion_confidence: z.number().finite().min(0).max(1),
  hidden_fat_risk: z.enum(["low", "medium", "high"]),
  cooking_method: z.string().trim().max(120).nullable().optional(),
  scale_evidence: z.string().trim().max(160).nullable().optional(),
  ambiguous_identity: z.boolean().optional().default(false),
  fallback_nutrition: fallbackNutritionSchema,
  packaged_food: packageSchema,
});

const visionSchema = z.object({
  image_quality: z.enum(["poor", "fair", "good"]),
  needs_second_pass: z.boolean().optional().default(false),
  components: z.array(componentSchema).min(1).max(8),
});

type VisionOutput = z.infer<typeof visionSchema>;

export type ScannerV2Component = {
  id?: string;
  label: string;
  serving_description: string;
  grams_estimate: number | null;
  grams_min: number | null;
  grams_max: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  hidden_fat_risk: HiddenFatRisk;
  source_name: "USDA" | "Open Food Facts" | "nutrition-label" | "model-fallback" | "user-context" | "manual";
  source_ref: string | null;
  packaged_food?: DetectedPackage | null;
  personal_prior_grams?: number | null;
  personal_prior_confirmations?: number;
};

export type ScannerV2Estimate = {
  scan_id: string;
  food_name: string;
  serving_description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "low" | "medium" | "high";
  confidence_score: number;
  components: ScannerV2Component[];
  questions: string[];
  escalated: boolean;
  cache_hit?: boolean;
  packaged_food?: DetectedPackage | null;
};

type ScanResult =
  | { ok: true; estimate: ScannerV2Estimate }
  | { ok: false; error: string };

type GeminiUsage = { input: number; output: number; thinking: number; total: number };
type GeminiCall = { text: string; model: string; usage: GeminiUsage; latencyMs: number };

const SYSTEM = `You are a careful food-photo perception system. Analyze visible food components and portions.
Your job is perception and portion estimation, not authoritative nutrition lookup.
For each visible component:
- identify the food as specifically as the pixels support;
- estimate grams AND a plausible lower/upper gram range;
- note cooking method if visually supported;
- flag hidden-fat uncertainty for oil/ghee/butter/gravy/dressing/frying;
- report recognition and portion confidence from 0 to 1;
- provide a rough fallback nutrition estimate ONLY so the app has a last-resort value when no database match exists;
- for one clearly visible packaged product, extract brand/product/pack count/grams per pack only when legible. Never infer package size from brand familiarity.
Do not invent hidden ingredients. Do not pretend a single image proves exact grams.
Return JSON only:
{
 "image_quality":"poor|fair|good",
 "needs_second_pass":boolean,
 "components":[{
   "label":"string",
   "serving_description":"string",
   "grams_estimate":number|null,
   "grams_min":number|null,
   "grams_max":number|null,
   "recognition_confidence":number,
   "portion_confidence":number,
   "hidden_fat_risk":"low|medium|high",
   "cooking_method":"string|null",
   "scale_evidence":"string|null",
   "ambiguous_identity":boolean,
   "fallback_nutrition":{"calories":number,"protein":number,"carbs":number,"fat":number},
   "packaged_food":null|{"brand":"string","product":"string","pack_count":number|null,"grams_per_pack":number|null}
 }]
}`;

function hammingHex(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 999;
  let distance = 0;
  for (let i = 0; i < 16; i++) {
    let value = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (value) { distance += value & 1; value >>= 1; }
  }
  return distance;
}

function cachedEstimate(value: unknown): Omit<ScannerV2Estimate, "scan_id"> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw["components"]) || typeof raw["food_name"] !== "string") return null;
  const components: ScannerV2Component[] = [];
  for (const candidate of raw["components"].slice(0, 20)) {
    if (!candidate || typeof candidate !== "object") return null;
    const item = candidate as Record<string, unknown>;
    const source = item["source_name"];
    if (!["USDA","Open Food Facts","nutrition-label","model-fallback","user-context","manual"].includes(String(source))) return null;
    const numbers = ["calories","protein","carbs","fat","confidence"];
    if (numbers.some((key) => typeof item[key] !== "number" || !Number.isFinite(item[key] as number))) return null;
    components.push(item as unknown as ScannerV2Component);
  }
  const confidence = raw["confidence"];
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") return null;
  return {
    food_name: String(raw["food_name"]).slice(0, 200),
    serving_description: typeof raw["serving_description"] === "string" ? raw["serving_description"].slice(0, 300) : "",
    calories: Number(raw["calories"] ?? 0),
    protein: Number(raw["protein"] ?? 0),
    carbs: Number(raw["carbs"] ?? 0),
    fat: Number(raw["fat"] ?? 0),
    confidence,
    confidence_score: Number(raw["confidence_score"] ?? 0.5),
    components,
    questions: Array.isArray(raw["questions"]) ? raw["questions"].filter((q): q is string => typeof q === "string").slice(0, 2) : [],
    escalated: Boolean(raw["escalated"]),
    cache_hit: true,
    packaged_food: null,
  };
}

function enabled() {
  return process.env["SCANNER_V2_ENABLED"] === "true";
}

function parseImage(dataUrl: string): { mime: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/s);
  if (!match) return null;
  const mime = match[1]!;
  const base64 = match[2]!;
  let bytes: Uint8Array;
  try {
    const binary = atob(base64);
    if (binary.length < 8 || binary.length > 2_300_000) return null;
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if ((mime === "image/jpeg" && !jpeg) || (mime === "image/png" && !png) || (mime === "image/webp" && !webp)) {
    return null;
  }
  return { mime, base64 };
}

function safeJson(text: string): VisionOutput | null {
  const match = text.replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = visionSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
}

function pricePerMillion(model: string): { input: number; output: number } {
  // Defaults reflect public prices checked 2026-11-17. Environment overrides let
  // production update pricing without changing scanner logic.
  const cheap = model === CHEAP_MODEL;
  const inputDefault = cheap ? 0.30 : 0.75;
  const outputDefault = cheap ? 2.50 : 3.75;
  const prefix = cheap ? "GEMINI_CHEAP" : "GEMINI_STRONG";
  const input = Number(process.env[`${prefix}_INPUT_USD_PER_M`] ?? inputDefault);
  const output = Number(process.env[`${prefix}_OUTPUT_USD_PER_M`] ?? outputDefault);
  return {
    input: Number.isFinite(input) && input >= 0 ? input : inputDefault,
    output: Number.isFinite(output) && output >= 0 ? output : outputDefault,
  };
}

function estimatedMicrousd(call: GeminiCall): number {
  const rate = pricePerMillion(call.model);
  // 1 token at $X / 1M tokens equals X micro-USD. Thoughts are conservatively
  // counted with output tokens for budget telemetry.
  return Math.max(0, Math.round(
    call.usage.input * rate.input + (call.usage.output + call.usage.thinking) * rate.output,
  ));
}

async function callGemini(
  apiKey: string,
  model: string,
  images: Array<{ mime: string; base64: string }>,
  extraInstruction?: string,
): Promise<GeminiCall> {
  const started = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{
          role: "user",
          parts: [
            ...(extraInstruction ? [{ text: extraInstruction }] : []),
            ...images.map((image) => ({ inline_data: { mime_type: image.mime, data: image.base64 } })),
          ],
        }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.1,
          maxOutputTokens: 1800,
        },
      }),
    },
  );
  if (!response.ok) {
    throw Object.assign(new Error(`Gemini HTTP ${response.status}`), { status: response.status });
  }
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const usage = payload.usageMetadata;
  return {
    model,
    text: payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    usage: {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
      thinking: usage?.thoughtsTokenCount ?? 0,
      total: usage?.totalTokenCount ?? 0,
    },
    latencyMs: Date.now() - started,
  };
}

function applyDeterministicContext(output: VisionOutput, rawContext: string): VisionOutput {
  const context = parseDeterministicContext(rawContext);
  const components = output.components.map((component, index) => {
    if (index !== 0) return component;
    const next = { ...component };
    if (context.identityOverride) next.label = context.identityOverride;
    if (context.totalGrams) {
      next.grams_estimate = context.totalGrams;
      next.grams_min = context.totalGrams;
      next.grams_max = context.totalGrams;
      next.portion_confidence = Math.max(next.portion_confidence, 0.98);
    }
    if (next.packaged_food && context.packCount) next.packaged_food = { ...next.packaged_food, pack_count: context.packCount };
    if (next.packaged_food && context.gramsPerPack) next.packaged_food = { ...next.packaged_food, grams_per_pack: context.gramsPerPack };
    return next;
  });

  const fat = addedFatNutrition(context);
  if (fat && context.addedFat) {
    components.push({
      label: `Added ${context.addedFat.kind}`,
      serving_description: `${context.addedFat.grams} g supplied by user`,
      grams_estimate: context.addedFat.grams,
      grams_min: context.addedFat.grams,
      grams_max: context.addedFat.grams,
      recognition_confidence: 1,
      portion_confidence: 1,
      hidden_fat_risk: "low",
      cooking_method: "user supplied",
      scale_evidence: "explicit context",
      ambiguous_identity: false,
      fallback_nutrition: fat,
      packaged_food: null,
    });
  }
  return { ...output, components };
}

async function groundOutput(output: VisionOutput): Promise<ScannerV2Component[]> {
  const unique = new Map<string, Promise<Awaited<ReturnType<typeof searchUsdaFood>>>>();
  for (const component of output.components.slice(0, 8)) {
    const query = normalizeFoodAlias(component.label);
    if (!unique.has(query)) unique.set(query, searchUsdaFood(query));
  }
  const resolved = new Map<string, Awaited<ReturnType<typeof searchUsdaFood>>>();
  await Promise.all([...unique.entries()].map(async ([key, promise]) => resolved.set(key, await promise)));

  return output.components.map((component) => {
    const normalized = normalizeFoodAlias(component.label);
    const match = resolved.get(normalized) ?? null;
    const grams = component.grams_estimate;
    const grounded = match && grams != null && grams > 0 ? scaleUsda(match, grams) : null;
    const nutrition = grounded ?? component.fallback_nutrition;
    const confidence = evidenceConfidence({
      recognition: component.recognition_confidence,
      portion: component.portion_confidence,
      databaseScore: match?.score ?? null,
      gramsEstimate: component.grams_estimate,
      gramsMin: component.grams_min,
      gramsMax: component.grams_max,
      hiddenFatRisk: component.hidden_fat_risk,
      imageQuality: output.image_quality,
      componentCount: output.components.length,
    });
    return {
      label: normalized,
      serving_description: component.serving_description,
      grams_estimate: component.grams_estimate,
      grams_min: component.grams_min,
      grams_max: component.grams_max,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      confidence,
      hidden_fat_risk: component.hidden_fat_risk,
      source_name: grounded ? "USDA" as const : component.cooking_method === "user supplied" ? "user-context" as const : "model-fallback" as const,
      source_ref: match ? `fdc:${match.fdcId}` : null,
      packaged_food: component.packaged_food ?? null,
    };
  });
}

async function attachMemberPriors(
  db: Awaited<ReturnType<typeof admin>>,
  memberId: string,
  components: ScannerV2Component[],
): Promise<ScannerV2Component[]> {
  const fingerprints = [...new Set(components.map((item) => foodFingerprint(item.label)).filter((value) => value.length >= 8))];
  if (!fingerprints.length) return components;
  const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await db.from("member_food_priors")
    .select("fingerprint,typical_grams,confirmations,confidence,last_confirmed_at")
    .eq("member_id", memberId)
    .in("fingerprint", fingerprints)
    .gte("confirmations", 2)
    .gte("confidence", 0.65)
    .gte("last_confirmed_at", cutoff);
  if (error || !data?.length) return components;
  const byFingerprint = new Map(data.map((row) => [row.fingerprint, row]));
  return components.map((item) => {
    const prior = byFingerprint.get(foodFingerprint(item.label));
    if (!prior?.typical_grams) return item;
    return {
      ...item,
      personal_prior_grams: Number(prior.typical_grams),
      personal_prior_confirmations: Number(prior.confirmations),
    };
  });
}

function combined(components: ScannerV2Component[]) {
  return components.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein,
      carbs: sum.carbs + item.carbs,
      fat: sum.fat + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function confidenceLabel(score: number): "low" | "medium" | "high" {
  return score >= 0.78 ? "high" : score >= 0.55 ? "medium" : "low";
}

async function memberIdFor(context: { userId: string; supabase: SupabaseClient<Database> }): Promise<string | null> {
  const { data, error } = await context.supabase
    .from("member_devices").select("member_id").eq("auth_user_id", context.userId).maybeSingle();
  if (error) throw new Error("SERVER_ERROR");
  return data?.member_id ?? null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const analyzeFoodV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { image: string; secondImage?: string; context?: string; imageFingerprint?: string; contextFingerprint?: string }) => ({
    image: z.string().max(3_100_000).parse(input?.image),
    secondImage: z.string().max(3_100_000).optional().parse(input?.secondImage),
    context: z.string().trim().max(300).optional().default("").parse(input?.context ?? ""),
    imageFingerprint: z.string().regex(/^[a-f0-9]{16}$/).optional().parse(input?.imageFingerprint),
    contextFingerprint: z.union([z.literal(""), z.string().regex(/^[a-f0-9]{64}$/)]).optional().default("").parse(input?.contextFingerprint ?? ""),
  }))
  .handler(async ({ data, context }): Promise<ScanResult> => {
    if (!enabled()) return { ok: false, error: "V2_DISABLED" };
    const image = parseImage(data.image);
    const secondImage = data.secondImage ? parseImage(data.secondImage) : null;
    if (!image || (data.secondImage && !secondImage)) return { ok: false, error: "INVALID_IMAGE" };
    const images = secondImage ? [image, secondImage] : [image];

    let memberId: string | null;
    try {
      memberId = await memberIdFor(context);
    } catch {
      return { ok: false, error: "SERVER_ERROR" };
    }
    if (!memberId) return { ok: false, error: "NOT_MEMBER" };

    const db = await admin();

    // Cache lookup happens before any AI quota is consumed.
    if (data.imageFingerprint) {
      const { data: cacheRows } = await db.from("member_scan_cache")
        .select("image_fingerprint,final_estimate")
        .eq("member_id", memberId)
        .eq("context_fingerprint", data.contextFingerprint)
        .eq("scanner_version", SCANNER_VERSION)
        .gt("expires_at", new Date().toISOString())
        .order("updated_at", { ascending: false })
        .limit(30);
      const hit = (cacheRows ?? [])
        .map((row) => ({ row, distance: hammingHex(data.imageFingerprint!, row.image_fingerprint) }))
        .filter((entry) => entry.distance <= 4)
        .sort((a, b) => a.distance - b.distance)[0];
      const cached = hit ? cachedEstimate(hit.row.final_estimate) : null;
      if (cached) {
        const { data: cacheEvent, error: cacheEventError } = await db.from("scan_events").insert({
          member_id: memberId, scanner_version: SCANNER_VERSION, prompt_version: PROMPT_VERSION,
          model: "cache", route: "cache", status: "succeeded", cache_hit: true,
          image_fingerprint: data.imageFingerprint, context_fingerprint: data.contextFingerprint,
          grounding_sources: [...new Set(cached.components.map((item) => item["source_name"]))],
          confidence: cached.confidence_score,
        }).select("id").single();
        if (cacheEventError || !cacheEvent) return { ok: false, error: "V2_STORAGE_UNAVAILABLE" };
        const { data: stored, error: itemError } = await db.from("scan_items").insert(
          cached.components.map((item, index) => ({
            scan_id: cacheEvent.id, member_id: memberId, item_index: index, label: item.label,
            grams_estimate: item.grams_estimate, grams_min: item.grams_min, grams_max: item.grams_max,
            calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
            confidence: item.confidence, hidden_fat_risk: item.hidden_fat_risk,
            source_name: item["source_name"], source_ref: item.source_ref,
          })),
        ).select("id,item_index");
        if (itemError) return { ok: false, error: "V2_STORAGE_UNAVAILABLE" };
        const ids = new Map((stored ?? []).map((row) => [row.item_index,row.id]));
        cached.components.forEach((item,index) => {
          const id = ids.get(index);
          if (id) item.id = id;
        });
        return { ok: true, estimate: { ...cached, scan_id: cacheEvent.id } };
      }
    }

    try {
      if (!(await claimAiQuota(memberId, "scan"))) return { ok: false, error: "AI_LIMIT" };
    } catch {
      return { ok: false, error: "AI_QUOTA_UNAVAILABLE" };
    }

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) return { ok: false, error: "AI_UNAVAILABLE" };

    const { data: event, error: eventError } = await db.from("scan_events").insert({
      member_id: memberId,
      scanner_version: SCANNER_VERSION,
      prompt_version: PROMPT_VERSION,
      model: CHEAP_MODEL,
      route: "vision",
      status: "started",
      image_fingerprint: data.imageFingerprint ?? null,
      context_fingerprint: data.contextFingerprint,
    }).select("id").single();
    if (eventError || !event) {
      // Do not spend provider tokens if telemetry/cost accounting cannot be recorded.
      return { ok: false, error: "V2_STORAGE_UNAVAILABLE" };
    }

    let cheapCall: GeminiCall | null = null;
    let strongCall: GeminiCall | null = null;
    let parsed: VisionOutput | null = null;
    let escalated = false;
    let escalationReason: string | null = null;
    const started = Date.now();

    try {
      const deterministic = parseDeterministicContext(data.context);
      const coveredByDeterministicContext = Boolean(
        deterministic.identityOverride || deterministic.totalGrams || deterministic.addedFat ||
        deterministic.packCount || deterministic.gramsPerPack,
      );
      const instruction = data.context && !coveredByDeterministicContext
        ? `Additional user context (treat as a claim, not as proof of invisible details): ${data.context}`
        : undefined;

      cheapCall = await callGemini(apiKey, CHEAP_MODEL, images, instruction);
      parsed = safeJson(cheapCall.text);
      if (!parsed) throw new Error("AI_MALFORMED");
      parsed = applyDeterministicContext(parsed, data.context);

      const cheapPreview = await groundOutput(parsed);
      const previewScore = cheapPreview.length
        ? cheapPreview.reduce((sum, item) => sum + item.confidence, 0) / cheapPreview.length
        : 0;
      const shouldEscalate = parsed.needs_second_pass
        || parsed.components.some((item) => item.ambiguous_identity)
        || previewScore < 0.45;

      if (shouldEscalate) {
        try {
          if (await claimAiQuota(memberId, "strong_scan")) {
            escalated = true;
            escalationReason = parsed.needs_second_pass ? "model_requested_second_pass"
              : parsed.components.some((item) => item.ambiguous_identity) ? "ambiguous_identity"
                : "low_evidence_confidence";
            strongCall = await callGemini(
              apiKey,
              STRONG_MODEL,
              images,
              `A cheaper first pass was uncertain. Re-analyze independently and be conservative. Escalation reason: ${escalationReason}.`,
            );
            const stronger = safeJson(strongCall.text);
            if (stronger) parsed = applyDeterministicContext(stronger, data.context);
          }
        } catch {
          // Strong-model failure must not discard a valid cheap result.
        }
      }

      const groundedComponents = await groundOutput(parsed);
      const components = await attachMemberPriors(db, memberId, groundedComponents);
      const totals = combined(components);
      const confidenceScore = components.length
        ? Math.round((components.reduce((sum, item) => sum + item.confidence, 0) / components.length) * 100) / 100
        : 0;
      const questions = components.flatMap((item) => contextualQuestions({
        hiddenFatRisk: item.hidden_fat_risk,
        confidence: item.confidence,
        gramsEstimate: item.grams_estimate,
        gramsMin: item.grams_min,
        gramsMax: item.grams_max,
        ambiguousIdentity: parsed!.components.find((raw) => normalizeFoodAlias(raw.label) === item.label)?.ambiguous_identity ?? false,
      })).filter((question, index, all) => all.indexOf(question) === index).slice(0, 2);

      const calls = [cheapCall, strongCall].filter((call): call is GeminiCall => Boolean(call));
      const usage = calls.reduce((sum, call) => ({
        input: sum.input + call.usage.input,
        output: sum.output + call.usage.output,
        thinking: sum.thinking + call.usage.thinking,
        total: sum.total + call.usage.total,
      }), { input: 0, output: 0, thinking: 0, total: 0 });
      const cost = calls.reduce((sum, call) => sum + estimatedMicrousd(call), 0);
      const sources = [...new Set(components.map((item) => item["source_name"]))];

      const { error: updateError } = await db.from("scan_events").update({
        model: calls.map((call) => call.model).join("+"),
        status: "succeeded",
        input_tokens: usage.input,
        output_tokens: usage.output,
        thinking_tokens: usage.thinking,
        total_tokens: usage.total,
        latency_ms: Date.now() - started,
        estimated_cost_microusd: cost,
        escalated,
        escalation_reason: escalationReason,
        grounding_sources: sources,
        confidence: confidenceScore,
      }).eq("id", event.id).eq("member_id", memberId);
      if (updateError) return { ok: false, error: "V2_STORAGE_UNAVAILABLE" };

      const rows = components.map((item, index) => ({
        scan_id: event.id,
        member_id: memberId,
        item_index: index,
        label: item.label,
        grams_estimate: item.grams_estimate,
        grams_min: item.grams_min,
        grams_max: item.grams_max,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        confidence: item.confidence,
        hidden_fat_risk: item.hidden_fat_risk,
        source_name: item["source_name"],
        source_ref: item.source_ref,
      }));
      const { data: storedItems, error: itemError } = await db.from("scan_items").insert(rows).select("id,item_index");
      if (itemError) return { ok: false, error: "V2_STORAGE_UNAVAILABLE" };
      const ids = new Map((storedItems ?? []).map((row) => [row.item_index, row.id]));
      components.forEach((item, index) => {
        const id = ids.get(index);
        if (id) item.id = id;
      });

      const primaryPackage = components.length === 1 ? components[0]?.packaged_food ?? null : null;
      return {
        ok: true,
        estimate: {
          scan_id: event.id,
          food_name: components.map((item) => item.label).join(" + ").slice(0, 200),
          serving_description: components.map((item) => item.serving_description).filter(Boolean).join(" · ").slice(0, 300),
          calories: Math.round(totals.calories),
          protein: Math.round(totals.protein * 10) / 10,
          carbs: Math.round(totals.carbs * 10) / 10,
          fat: Math.round(totals.fat * 10) / 10,
          confidence: confidenceLabel(confidenceScore),
          confidence_score: confidenceScore,
          components,
          questions,
          escalated,
          cache_hit: false,
          packaged_food: primaryPackage,
        },
      };
    } catch (error) {
      const calls = [cheapCall, strongCall].filter((call): call is GeminiCall => Boolean(call));
      const usage = calls.reduce((sum, call) => ({
        input: sum.input + call.usage.input,
        output: sum.output + call.usage.output,
        thinking: sum.thinking + call.usage.thinking,
        total: sum.total + call.usage.total,
      }), { input: 0, output: 0, thinking: 0, total: 0 });
      await db.from("scan_events").update({
        model: calls.map((call) => call.model).join("+") || CHEAP_MODEL,
        status: "failed",
        input_tokens: usage.input,
        output_tokens: usage.output,
        thinking_tokens: usage.thinking,
        total_tokens: usage.total,
        latency_ms: Date.now() - started,
        estimated_cost_microusd: calls.reduce((sum, call) => sum + estimatedMicrousd(call), 0),
        escalated,
        escalation_reason: escalationReason,
      }).eq("id", event.id).eq("member_id", memberId);

      const status = statusOf(error);
      if (status === 429) return { ok: false, error: "AI_BUSY" };
      if (status === 402 || status === 403) return { ok: false, error: "AI_CREDITS" };
      if (String((error as Error)?.message).includes("AI_MALFORMED")) return { ok: false, error: "AI_MALFORMED" };
      return { ok: false, error: "AI_FAILED" };
    }
  });

const correctionPayload = z.object({
  food_name: z.string().trim().min(1).max(200),
  serving_description: z.string().max(300).optional().default(""),
  calories: z.number().finite().min(0).max(20000),
  protein: z.number().finite().min(0).max(2000),
  carbs: z.number().finite().min(0).max(2000),
  fat: z.number().finite().min(0).max(2000),
  grams: z.number().finite().min(0).max(10000).nullable().optional(),
});

export const reportScanCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    scanId: string;
    scanItemId?: string | null;
    correctionType: "identity"|"portion"|"nutrition"|"remove"|"add"|"package"|"context"|"hidden_fat";
    original: z.input<typeof correctionPayload>;
    corrected: z.input<typeof correctionPayload>;
    structuredContext?: Record<string, string|number|boolean|null>;
  }) => ({
    scanId: z.string().uuid().parse(input.scanId),
    scanItemId: z.string().uuid().nullable().optional().parse(input.scanItemId),
    correctionType: z.enum(["identity","portion","nutrition","remove","add","package","context","hidden_fat"]).parse(input.correctionType),
    original: correctionPayload.parse(input.original),
    corrected: correctionPayload.parse(input.corrected),
    structuredContext: z.record(z.string(), z.union([z.string(),z.number(),z.boolean(),z.null()])).optional().default({}).parse(input.structuredContext ?? {}),
  }))
  .handler(async ({ data, context }) => {
    const memberId = await memberIdFor(context);
    if (!memberId) throw new Error("NOT_MEMBER");
    const db = await admin();
    const { data: event, error } = await db.from("scan_events")
      .select("id").eq("id", data.scanId).eq("member_id", memberId).maybeSingle();
    if (error || !event) throw new Error("SCAN_NOT_FOUND");

    const { error: insertError } = await db.from("scan_corrections").insert({
      scan_id: data.scanId,
      scan_item_id: data.scanItemId ?? null,
      member_id: memberId,
      correction_type: data.correctionType,
      original: data.original,
      corrected: data.corrected,
      structured_context: data.structuredContext,
    });
    if (insertError) throw new Error("CORRECTION_SAVE_FAILED");

    const grams = data.corrected.grams ?? null;
    if (grams && grams > 0) {
      const fingerprint = foodFingerprint(data.corrected.food_name);
      if (fingerprint.length >= 8) {
        const per100 = (value: number) => Math.round((value / grams) * 1000) / 10;
        await db.rpc("record_member_food_prior", {
          p_member_id: memberId,
          p_fingerprint: fingerprint,
          p_canonical_label: normalizeFoodAlias(data.corrected.food_name),
          p_typical_grams: grams,
          p_calories_per_100g: per100(data.corrected.calories),
          p_protein_per_100g: per100(data.corrected.protein),
          p_carbs_per_100g: per100(data.corrected.carbs),
          p_fat_per_100g: per100(data.corrected.fat),
          p_structured_context: data.structuredContext,
        });
      }
    }
    return { ok: true };
  });
