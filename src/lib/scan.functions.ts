import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isPlausibleNutrition } from "./ai-estimate";
import { claimAiQuota } from "./ai-quota.server";
import type { DetectedPackage } from "./packaged-scan";

// ── Model identifiers ─────────────────────────────────────────────────────
const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];

// ── System prompt ─────────────────────────────────────────────────────────
const SYSTEM = `You are a cautious food-photo analyst. Make ONE analysis of the supplied image.
Identify visible food and estimate total calories/protein/carbs/fat, accounting for cooking oil and portions; estimates are uncertain.
Round estimated calories to nearest 10 and macros to whole grams. Never claim these are verified nutrition facts.
For clearly visible single packaged foods, also extract the brand, product/variant, number of packs and printed GRAMS PER PACK.
Only populate package fields from legible packaging; do not infer a 61 g packet or barcode based on familiarity with a brand.
Set unknown fields to null, and set packaged_food to null for mixed/homemade/unrecognizable food.
If several foods are visible, return combined estimated macros and packaged_food null.
If there is no food, return food_name empty with zero numbers and low confidence.
Return one JSON object with exactly these fields:
{"food_name":string,"serving_description":string,"calories":number,"protein":number,"carbs":number,"fat":number,"confidence":"low"|"medium"|"high","packaged_food":null|{"brand":string,"product":string,"pack_count":number|null,"grams_per_pack":number|null}}`;

// ── Zod schema + public type ──────────────────────────────────────────────
const resultSchema = z.object({
  food_name:           z.string(),
  serving_description: z.string().optional().default(""),
  calories:  z.coerce.number(),
  protein:   z.coerce.number(),
  carbs:     z.coerce.number(),
  fat:       z.coerce.number(),
  confidence: z.string().optional().default("low"),
  packaged_food: z.unknown().optional(),
});

export type FoodEstimate = {
  food_name:           string;
  serving_description: string;
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
  confidence: "low" | "medium" | "high";
  packaged_food: DetectedPackage | null;
};

// ── Helpers (unchanged) ───────────────────────────────────────────────────
function errorStatus(e: unknown): number | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const o = cur as { statusCode?: number; status?: number; lastError?: unknown; cause?: unknown; errors?: unknown[] };
    if (typeof o.statusCode === "number") return o.statusCode;
    if (typeof o.status    === "number") return o.status;
    cur = o.lastError ?? o.cause ?? o.errors?.[o.errors.length - 1];
  }
  const msg = String((e as { message?: string })?.message ?? e);
  if (/not enough credits|payment required/i.test(msg)) return 402;
  if (/rate limit/i.test(msg)) return 429;
  return undefined;
}

function clamp(n: number, max: number) {
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), max) : 0;
}

const packagedSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  product: z.string().trim().min(1).max(140),
  pack_count: z.number().int().min(1).max(20).nullable(),
  grams_per_pack: z.number().positive().max(2000).nullable(),
});

function parseEstimate(text: string): FoodEstimate | null {
  const match = text.replace(/```(json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: unknown;
  try { raw = JSON.parse(match[0]); } catch { return null; }
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r    = parsed.data;
  if (![r.calories,r.protein,r.carbs,r.fat].every(v=>Number.isFinite(v)&&v>=0)) return null;
  if (r.calories>10000||r.protein>1000||r.carbs>1000||r.fat>1000) return null;
  const name = r.food_name.trim().slice(0, 120);
  if (!name) return null;
  const conf = r.confidence.toLowerCase();
  // Malformed optional package metadata must not discard a valid ordinary food estimate.
  const packageResult = packagedSchema.safeParse(r.packaged_food);
  const packageInfo: DetectedPackage | null = packageResult.success ? packageResult.data : null;
  const estimate = {
    food_name:           name,
    serving_description: r.serving_description.trim().slice(0, 160),
    calories: clamp(r.calories, 10_000),
    protein:  clamp(r.protein, 1_000),
    carbs:    clamp(r.carbs,   1_000),
    fat:      clamp(r.fat,     1_000),
    confidence: (conf === "high" || conf === "medium" ? conf : "low") as "high"|"medium"|"low",
    packaged_food: packageInfo,
  };
  return isPlausibleNutrition(estimate) ? estimate : null;
}

// ── Direct Google Gemini API types ────────────────────────────────────────
type GeminiTextPart   = { text: string };
type GeminiInlinePart = { inline_data: { mime_type: string; data: string } };
type GeminiRequestPart = GeminiTextPart | GeminiInlinePart;

type GeminiResponse = {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
};

/** Call the Google Generative Language API directly. Throws with `.status` on HTTP errors. */
async function callGeminiDirect(
  apiKey: string,
  system: string,
  parts: GeminiRequestPart[],
): Promise<string> {
  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      });
    } catch (e) {
      lastError = e;
      continue;
    }
    if (res.ok) {
      const data = (await res.json()) as GeminiResponse;
      // Aggregate usage only: never log image bytes, prompt text or the meal name.
      const usage = data.usageMetadata;
      if (usage) console.info("food_scan_token_usage", {
        model, input: usage.promptTokenCount ?? 0,
        output: usage.candidatesTokenCount ?? 0,
        thinking: usage.thoughtsTokenCount ?? 0,
        total: usage.totalTokenCount ?? 0,
      });
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    lastError = Object.assign(new Error(`Gemini API HTTP ${res.status}`), { status: res.status });
    if (res.status === 503 || res.status === 404 || res.status >= 500) {
      console.warn(`Gemini ${model} HTTP ${res.status}, trying fallback`);
      continue;
    }
    throw lastError;
  }
  throw lastError ?? new Error("All Gemini models failed");
}

// ── Server function ───────────────────────────────────────────────────────
type ScanResult = { ok: true; estimate: FoodEstimate } | { ok: false; error: string };

export const analyzeFood = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { image: string }) => {
    if (
      typeof i?.image !== "string" ||
      !/^data:image\/(jpeg|png|webp);base64,/.test(i.image) ||
      i.image.length > 3_000_000
    )
      throw new Error("INVALID_IMAGE");
    return { image: i.image };
  })
  .handler(async ({ data, context }): Promise<ScanResult> => {
    const { data: me } = await context.supabase
      .from("member_devices")
      .select("member_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!me) return { ok: false, error: "NOT_MEMBER" };
    if (!process.env["GEMINI_API_KEY"]) return {ok:false,error:"AI_UNAVAILABLE"};
    // Token limits are enforced in Postgres across server instances.
    if (!(await claimAiQuota(me.member_id, "scan"))) {
      return {ok:false,error:"AI_LIMIT"};
    }

    let text = "";

    const geminiKey = process.env["GEMINI_API_KEY"];

    if (!geminiKey) return {ok:false,error:"AI_UNAVAILABLE"};
    const match = data.image.match(/^data:(image\/[a-z]+);base64,(.+)$/s);
    const mimeType = match?.[1];
    const rawBase64 = match?.[2];
    if (!mimeType || !rawBase64) return {ok:false,error:"INVALID_IMAGE"};
    try {
        text = await callGeminiDirect(geminiKey, SYSTEM, [
          { inline_data: { mime_type: mimeType, data: rawBase64 } },
        ]);
    } catch (e) {
        const status = errorStatus(e);
        console.error("analyzeFood (direct) failed", status, e);
        if (status === 429) return { ok: false, error: "AI_BUSY" };
        if (status === 403 || status === 402) return { ok: false, error: "AI_CREDITS" };
        return { ok: false, error: "AI_FAILED" };
      }

    const estimate = parseEstimate(text);
    if (!estimate) return { ok: false, error: "AI_MALFORMED" };
    return { ok: true, estimate };
  });
