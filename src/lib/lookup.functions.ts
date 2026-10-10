import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FoodEstimate } from "./scan.functions";

const MODEL = "google/gemini-3.8-flash";

const SYSTEM = `You are a careful nutrition estimator. The user gives you a natural-language food description — it might include a portion size, a brand name, a dish name, or all three (e.g. "2 medium slices of white bread with butter", "Nestle KitKat 2 bars", "chicken biryani plate approx 400g", "daal chawal 1 serving").
1. Parse all food items, quantities, brands, and preparation methods in the description.
2. Use USDA, branded nutrition facts, or standard local database values for estimates.
3. Consider South Asian cuisine when relevant (e.g. ghee, desi portions, local brands).
4. If a quantity is vague (e.g. "a bowl" or "a plate"), use the most common serving size.
5. Round calories to the nearest 10 and macros to whole grams.
6. Give confidence "high" for branded foods with known nutrition facts or precise weights, "medium" for common foods with typical portions, "low" for very vague descriptions.
7. If the input is not food, return food_name "" and all numbers 0 with confidence "low".
Respond with ONLY a JSON object, no markdown, no preamble:
{"food_name": string, "serving_description": string, "calories": number, "protein": number, "carbs": number, "fat": number, "confidence": "low"|"medium"|"high"}`;

const resultSchema = z.object({
  food_name: z.string(),
  serving_description: z.string().optional().default(""),
  calories: z.coerce.number(),
  protein: z.coerce.number(),
  carbs: z.coerce.number(),
  fat: z.coerce.number(),
  confidence: z.string().optional().default("low"),
});

function clamp(n: number, max: number) {
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), max) : 0;
}

function parseEstimate(text: string): FoodEstimate | null {
  const match = text.replace(/```(json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const name = r.food_name.trim().slice(0, 120);
  if (!name) return null;
  const conf = r.confidence.toLowerCase();
  return {
    food_name: name,
    serving_description: r.serving_description.trim().slice(0, 160),
    calories: clamp(r.calories, 10000),
    protein: clamp(r.protein, 1000),
    carbs: clamp(r.carbs, 1000),
    fat: clamp(r.fat, 1000),
    confidence: conf === "high" || conf === "medium" ? conf : "low",
  };
}

type LookupResult = { ok: true; estimate: FoodEstimate } | { ok: false; error: string };

export const lookupFood = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { description: string }) => ({
    description: z.string().trim().min(2).max(300).parse(i.description),
  }))
  .handler(async ({ data, context }): Promise<LookupResult> => {
    const { data: me } = await context.supabase
      .from("member_devices")
      .select("member_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!me) return { ok: false, error: "NOT_MEMBER" };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "AI_UNAVAILABLE" };

    const { createLovableAiGatewayProvider } = await import("./ai/gateway.server");
    const { streamText } = await import("ai");
    const provider = createLovableAiGatewayProvider(apiKey, undefined, {
      baseURL: "https://ai.gateway.lovable.dev/v1",
    });

    let streamError: unknown;
    let text = "";
    try {
      const result = streamText({
        model: provider(MODEL),
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Estimate the nutrition for: "${data.description}". JSON only.`,
          },
        ],
        onError: ({ error }) => {
          streamError = error;
        },
      });
      text = await result.text;
    } catch (e) {
      streamError = e;
    }

    if (streamError) {
      const status = (streamError as { statusCode?: number }).statusCode;
      if (status === 429) return { ok: false, error: "AI_BUSY" };
      if (status === 402 || status === 403) return { ok: false, error: "AI_CREDITS" };
      return { ok: false, error: "AI_FAILED" };
    }

    const estimate = parseEstimate(text);
    if (!estimate) return { ok: false, error: "AI_MALFORMED" };
    return { ok: true, estimate };
  });
