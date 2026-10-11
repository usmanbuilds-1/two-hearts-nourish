import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ── Model identifiers ─────────────────────────────────────────────────────
const LOVABLE_MODEL  = "google/gemini-3.8-flash"; // Lovable gateway model ID
const GEMINI_MODEL   = "gemini-2.5-flash";         // direct Google API model ID

// ── System prompt ─────────────────────────────────────────────────────────
const SYSTEM = `You are a careful nutrition estimator looking at a single food photo.
1. Identify the visible food items. 2. Estimate portion sizes. 3. Consider the cooking method (fried, grilled, oil, ghee, sauces). 4. Consider visible ingredients.
5-8. Estimate total calories, protein, carbohydrates and fat for everything visible combined.
Photos cannot give exact measurements: these are estimates. Avoid false precision — round calories to the nearest 10 and macros to whole grams.
Give a confidence of "low", "medium" or "high" based on how clearly portions and ingredients can be seen.
If several foods are visible, give one combined meal estimate with a short combined name (e.g. "Chicken biryani + raita").
If there is no food in the photo, return food_name "" and all numbers 0 with confidence "low".
Respond with ONLY a JSON object, no markdown, exactly:
{"food_name": string, "serving_description": string, "calories": number, "protein": number, "carbs": number, "fat": number, "confidence": "low"|"medium"|"high"}`;

// ── Zod schema + public type ──────────────────────────────────────────────
const resultSchema = z.object({
  food_name:           z.string(),
  serving_description: z.string().optional().default(""),
  calories:  z.coerce.number(),
  protein:   z.coerce.number(),
  carbs:     z.coerce.number(),
  fat:       z.coerce.number(),
  confidence: z.string().optional().default("low"),
});

export type FoodEstimate = {
  food_name:           string;
  serving_description: string;
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
  confidence: "low" | "medium" | "high";
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

function parseEstimate(text: string): FoodEstimate | null {
  const match = text.replace(/```(json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: unknown;
  try { raw = JSON.parse(match[0]); } catch { return null; }
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r    = parsed.data;
  const name = r.food_name.trim().slice(0, 120);
  if (!name) return null;
  const conf = r.confidence.toLowerCase();
  return {
    food_name:           name,
    serving_description: r.serving_description.trim().slice(0, 160),
    calories: clamp(r.calories, 10_000),
    protein:  clamp(r.protein, 1_000),
    carbs:    clamp(r.carbs,   1_000),
    fat:      clamp(r.fat,     1_000),
    confidence: conf === "high" || conf === "medium" ? conf : "low",
  };
}

// ── Direct Google Gemini API types ────────────────────────────────────────
type GeminiTextPart   = { text: string };
type GeminiInlinePart = { inline_data: { mime_type: string; data: string } };
type GeminiRequestPart = GeminiTextPart | GeminiInlinePart;

type GeminiResponse = {
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { response_mime_type: "application/json" },
    }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Gemini API HTTP ${res.status}`), { status: res.status });
  }
  const data = (await res.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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

    let text = "";

    const geminiKey = process.env["GEMINI_API_KEY"];

    if (geminiKey) {
      // ── Path A: direct Google Gemini API ──────────────────────────────
      // Split "data:<mime>;base64,<data>" → mime + raw base64
      const match = data.image.match(/^data:(image\/[a-z]+);base64,(.+)$/s);
      if (!match) return { ok: false, error: "AI_FAILED" };
      const mimeType  = match[1];
      const rawBase64 = match[2];
      if (!mimeType || !rawBase64) return { ok: false, error: "AI_FAILED" };
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
    } else {
      // ── Path B: Lovable AI Gateway fallback ───────────────────────────
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) return { ok: false, error: "AI_UNAVAILABLE" };

      const { createLovableAiGatewayProvider } = await import("./ai/gateway.server");
      const { streamText } = await import("ai");
      const provider = createLovableAiGatewayProvider(apiKey, undefined, {
        baseURL: "https://ai.gateway.lovable.dev/v1",
      });

      let streamError: unknown;
      try {
        const result = streamText({
          model: provider(LOVABLE_MODEL),
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
          maxRetries: 0,
          onError: ({ error }) => { streamError = error; },
        });
        text = await result.text;
      } catch (e) {
        streamError = e;
      }
      if (streamError) {
        const status = errorStatus(streamError);
        console.error("analyzeFood (gateway) failed", status, streamError);
        if (status === 429) return { ok: false, error: "AI_BUSY" };
        if (status === 402 || status === 403) return { ok: false, error: "AI_CREDITS" };
        return { ok: false, error: "AI_FAILED" };
      }
    }

    const estimate = parseEstimate(text);
    if (!estimate) return { ok: false, error: "AI_MALFORMED" };
    return { ok: true, estimate };
  });
