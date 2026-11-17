import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { claimAiQuota } from "./ai-quota.server";

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];

const inputSchema = z.object({
  calories: z.number().int().min(1000).max(6000),
  protein: z.number().min(0).max(400),
  carbs: z.number().min(0).max(900),
  fat: z.number().min(0).max(300),
  budget: z.number().positive().max(10_000_000),
  currency: z.string().trim().min(1).max(8),
  locality: z.string().trim().min(2).max(80),
});

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  meal: z.enum(["Breakfast", "Lunch", "Snack", "Dinner"]),
  ingredients: z.string().trim().min(1).max(1000),
  calories: z.number().finite().min(0).max(5000),
  protein: z.number().finite().min(0).max(400),
  carbs: z.number().finite().min(0).max(700),
  fat: z.number().finite().min(0).max(300),
  cost: z.number().finite().min(0).max(10_000_000),
});

const planSchema = z.object({
  meals: z.array(itemSchema).min(1).max(8),
  total_cost: z.number().finite().min(0).max(10_000_000),
  within_budget: z.boolean(),
  notes: z.string().trim().max(800),
  sources: z.array(z.string().trim().max(200)).max(8).optional().default([]),
});

export type DietPlan = z.infer<typeof planSchema> & {
  totals: { calories: number; protein: number; carbs: number; fat: number };
  currency: string;
  locality: string;
  createdAt: string;
};

type Result = { ok: true; plan: DietPlan } | { ok: false; error: string };

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
}

async function callGeminiForPlan(apiKey: string, prompt: string): Promise<string> {
  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              response_mime_type: "application/json",
              temperature: 0.2,
              maxOutputTokens: 2200,
            },
          }),
        },
      );
    } catch (error) {
      lastError = error;
      continue;
    }

    if (response.ok) {
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    lastError = Object.assign(new Error(`Gemini HTTP ${response.status}`), { status: response.status });
    // Only bounded technical fallback. Do not retry auth/billing errors across models.
    if ([404, 429, 500, 502, 503, 504].includes(response.status)) continue;
    throw lastError;
  }
  throw lastError ?? new Error("All Gemini models failed");
}

export const generateDietPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<Result> => {
    const { data: device, error: deviceError } = await context.supabase
      .from("member_devices")
      .select("member_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (deviceError) return { ok: false, error: "SERVER_ERROR" };
    if (!device) return { ok: false, error: "NOT_MEMBER" };

    // Every paid/limited AI feature is quota-gated before the provider is called.
    try {
      if (!(await claimAiQuota(device.member_id, "plan"))) {
        return { ok: false, error: "AI_LIMIT" };
      }
    } catch {
      // Fail closed if the quota database is unavailable.
      return { ok: false, error: "AI_UNAVAILABLE" };
    }

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) return { ok: false, error: "AI_UNAVAILABLE" };

    const prompt = `Build ONE practical day of meals for one adult living in ${data.locality}.
Daily food budget: ${data.budget} ${data.currency}. Nutrition targets: ${data.calories} kcal, ${data.protein} g protein, ${data.carbs} g carbs, ${data.fat} g fat.
Use foods and cuisine commonly available in that locality. Hit calories within ±5% and protein at or above target when reasonably possible; carbs and fat within ±15%.
Each meal needs a name, meal slot, ingredients with gram amounts, estimated macros, and an estimated local cost.
IMPORTANT: you do NOT have live grocery-price access. Treat all prices as rough estimates, do not invent retailers, citations, or claims that a price is current. Return sources as [] unless the user-provided context itself supplied a verifiable source.
If the budget cannot realistically meet the targets, get as close as practical, set within_budget false, and explain briefly.
Return ONLY valid JSON matching:
{
  "meals":[{"name":"string","meal":"Breakfast|Lunch|Snack|Dinner","ingredients":"string","calories":number,"protein":number,"carbs":number,"fat":number,"cost":number}],
  "total_cost":number,
  "within_budget":boolean,
  "notes":"string",
  "sources":[]
}`;

    let text = "";
    try {
      text = await callGeminiForPlan(apiKey, prompt);
    } catch (error) {
      const status = statusOf(error);
      console.error("diet_plan_provider_failed", { status: status ?? null });
      if (status === 429) return { ok: false, error: "AI_BUSY" };
      if (status === 402 || status === 403) return { ok: false, error: "AI_CREDITS" };
      return { ok: false, error: "AI_FAILED" };
    }

    let p: z.infer<typeof planSchema> | null = null;
    try {
      const match = text.replace(/```(json)?/gi, "").match(/\{[\s\S]*\}/);
      const parsed = planSchema.safeParse(JSON.parse(match ? match[0] : text));
      if (!parsed.success) return { ok: false, error: "AI_MALFORMED" };
      p = parsed.data;
    } catch {
      return { ok: false, error: "AI_MALFORMED" };
    }
    if (!p) return { ok: false, error: "AI_MALFORMED" };
    const round = (n: number) => Math.max(0, Math.round(n));
    const meals = p.meals.map((meal) => ({
      ...meal,
      calories: round(meal.calories),
      protein: round(meal.protein),
      carbs: round(meal.carbs),
      fat: round(meal.fat),
      cost: Math.max(0, Math.round(meal.cost * 100) / 100),
    }));
    const totals = meals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.calories,
        protein: sum.protein + meal.protein,
        carbs: sum.carbs + meal.carbs,
        fat: sum.fat + meal.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
    const totalCost = Math.round(meals.reduce((sum, meal) => sum + meal.cost, 0) * 100) / 100;

    return {
      ok: true,
      plan: {
        ...p,
        meals,
        total_cost: totalCost,
        within_budget: totalCost <= data.budget,
        sources: [],
        totals,
        currency: data.currency,
        locality: data.locality,
        createdAt: new Date().toISOString(),
      },
    };
  });
