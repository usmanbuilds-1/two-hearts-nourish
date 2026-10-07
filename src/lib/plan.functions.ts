import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MODEL = "openai/gpt-6-astra";

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
  name: z.string(),
  meal: z.string(),
  ingredients: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  cost: z.number(),
});
const planSchema = z.object({
  meals: z.array(itemSchema).min(1).max(8),
  total_cost: z.number(),
  within_budget: z.boolean(),
  notes: z.string(),
  sources: z.array(z.string()).max(8),
});
export type DietPlan = z.infer<typeof planSchema> & { totals: { calories: number; protein: number; carbs: number; fat: number }; currency: string; locality: string; createdAt: string };

const num = { type: "number" } as const;
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meals", "total_cost", "within_budget", "notes", "sources"],
  properties: {
    meals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "meal", "ingredients", "calories", "protein", "carbs", "fat", "cost"],
        properties: { name: { type: "string" }, meal: { type: "string" }, ingredients: { type: "string" }, calories: num, protein: num, carbs: num, fat: num, cost: num },
      },
    },
    total_cost: num,
    within_budget: { type: "boolean" },
    notes: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
  },
};

type Result = { ok: true; plan: DietPlan } | { ok: false; error: string };

export const generateDietPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof inputSchema>) => inputSchema.parse(i))
  .handler(async ({ data, context }): Promise<Result> => {
    const { data: dev } = await context.supabase.from("member_devices").select("member_id").eq("auth_user_id", context.userId).maybeSingle();
    if (!dev) return { ok: false, error: "NOT_MEMBER" };
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "AI_UNAVAILABLE" };

    const prompt = `Build ONE day of meals for one adult living in ${data.locality}.
Daily budget: ${data.budget} ${data.currency} (hard limit). Targets: ${data.calories} kcal, ${data.protein} g protein, ${data.carbs} g carbs, ${data.fat} g fat.
Use web search to find CURRENT local grocery prices in ${data.locality} (local supermarkets / markets) and use common, locally available foods and cuisine.
Hit calories within ±5% and protein at or above target; carbs and fat within ±15%. Use standard nutrition values (USDA or local tables) for the stated gram amounts.
Each meal: name, meal (Breakfast/Lunch/Snack/Dinner), ingredients with gram amounts, its macros, and its cost in ${data.currency}.
If the budget truly can't meet the targets, get as close as possible, set within_budget false and explain kindly in notes. Notes: 1-2 warm, practical sentences. sources: URLs you used for prices.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        stream: true,
        reasoning: { effort: "low" },
        tools: [{ type: "web_search" }],
        input: prompt,
        text: { format: { type: "json_schema", name: "diet_plan", strict: true, schema: JSON_SCHEMA } },
      }),
    }).catch(() => null);
    if (!res) return { ok: false, error: "AI_FAILED" };
    if (!res.ok || !res.body) {
      console.error("plan failed", res.status, await res.text().catch(() => ""));
      if (res.status === 429) return { ok: false, error: "AI_BUSY" };
      if (res.status === 402 || res.status === 403) return { ok: false, error: "AI_CREDITS" };
      return { ok: false, error: "AI_FAILED" };
    }

    let text = "";
    let buf = "";
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(l.slice(5).trim()) as { type?: string; text?: string };
          if (ev.type === "response.output_text.done" && ev.text) text = ev.text;
          if (ev.type === "response.failed" || ev.type === "error") return { ok: false, error: "AI_FAILED" };
        } catch {
          /* ignore partial */
        }
      }
    }
    let parsed;
    try {
      parsed = planSchema.safeParse(JSON.parse(text));
    } catch {
      return { ok: false, error: "AI_MALFORMED" };
    }
    if (!parsed.success) return { ok: false, error: "AI_MALFORMED" };
    const p = parsed.data;
    const r = (n: number) => Math.max(0, Math.round(n));
    const meals = p.meals.map((m) => ({ ...m, calories: r(m.calories), protein: r(m.protein), carbs: r(m.carbs), fat: r(m.fat), cost: Math.max(0, Math.round(m.cost * 100) / 100) }));
    const totals = meals.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    const total = Math.round(meals.reduce((a, m) => a + m.cost, 0) * 100) / 100;
    return {
      ok: true,
      plan: { ...p, meals, total_cost: total, within_budget: total <= data.budget, sources: p.sources.filter((s) => /^https?:\/\//.test(s)), totals, currency: data.currency, locality: data.locality, createdAt: new Date().toISOString() },
    };
  });
