import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MODEL = "google/gemini-3.8-flash";

const SYSTEM = `You are a careful nutrition estimator looking at a single food photo.
1. Identify the visible food items. 2. Estimate portion sizes. 3. Consider the cooking method (fried, grilled, oil, ghee, sauces). 4. Consider visible ingredients.
5-8. Estimate total calories, protein, carbohydrates and fat for everything visible combined.
Photos cannot give exact measurements: these are estimates. Avoid false precision — round calories to the nearest 10 and macros to whole grams.
Give a confidence of "low", "medium" or "high" based on how clearly portions and ingredients can be seen.
If several foods are visible, give one combined meal estimate with a short combined name (e.g. "Chicken biryani + raita").
If there is no food in the photo, return food_name "" and all numbers 0 with confidence "low".
Respond with ONLY a JSON object, no markdown, exactly:
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

export type FoodEstimate = {
  food_name: string;
  serving_description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "low" | "medium" | "high";
};

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
      .from("members")
      .select("id")
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
            content: [
              { type: "text", text: "Estimate the nutrition for this meal. JSON only." },
              { type: "image", image: data.image },
            ],
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
      console.error("food scan failed", status, streamError);
      if (status === 429) return { ok: false, error: "AI_BUSY" };
      if (status === 402 || status === 403) return { ok: false, error: "AI_CREDITS" };
      return { ok: false, error: "AI_FAILED" };
    }
    const estimate = parseEstimate(text);
    if (!estimate) return { ok: false, error: "AI_MALFORMED" };
    return { ok: true, estimate };
  });
