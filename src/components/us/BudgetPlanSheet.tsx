import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Btn, Field, TextInput } from "./primitives";
import { generateDietPlan, type DietPlan } from "@/lib/plan.functions";
import type { Member } from "@/lib/nutrition";

const ERRORS: Record<string, string> = {
  AI_BUSY: "Meal planning is busy right now. Give it a moment and try again.",
  AI_CREDITS: "Meal planning is paused for now (AI usage limit reached). Try again a little later.",
  NOT_MEMBER: "Your session expired. Please reopen your invite link.",
  AI_MALFORMED: "That plan came back scrambled. Let's give it another try.",
  AI_UNAVAILABLE: "The planning service isn't reachable right now. Try again in a bit.",
  AI_FAILED: "The plan didn't come together. Please try again.",
};

export function BudgetPlanSheet({ open, onOpenChange, me }: { open: boolean; onOpenChange: (o: boolean) => void; me: Member }) {
  const [city, setCity] = useState(me.locality ?? "");
  const [budget, setBudget] = useState(me.daily_food_budget != null ? String(me.daily_food_budget) : "");
  const [currency, setCurrency] = useState(me.currency ?? "PKR");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setPlan(null);
      setError("");
    }
  }, [open]);

  const ready = city.trim().length >= 2 && budget !== "" && Number(budget) > 0 && me.daily_calorie_target != null;

  async function generate() {
    if (!ready || loading) return;
    setLoading(true);
    setError("");
    try {
      const r = await generateDietPlan({
        data: {
          calories: Number(me.daily_calorie_target ?? 0),
          protein: Number(me.daily_protein_target ?? 0),
          carbs: Number(me.daily_carbs_target ?? 0),
          fat: Number(me.daily_fat_target ?? 0),
          budget: Number(budget),
          currency: currency.trim() || "PKR",
          locality: city.trim(),
        },
      });
      if (r.ok) {
        setPlan(r.plan);
      } else {
        setError(ERRORS[r.error] ?? "The plan didn't come together. Please try again.");
      }
    } catch {
      setError(navigator.onLine ? ERRORS.AI_FAILED : "You're offline. We'll reconnect when you're back.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-xl border-border bg-background">
        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <DrawerTitle className="font-display text-2xl font-normal">Plan our meals 💰</DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-muted-foreground">
            {plan ? `A one-day plan for ${plan.locality}, priced in ${plan.currency}.` : "A realistic day of meals, priced with local groceries in mind."}
          </DrawerDescription>

          {loading && <p className="mt-6 text-center text-muted-foreground">Checking local prices and building your plan…</p>}

          {error && (
            <div className="mt-5">
              <p className="text-foreground">{error}</p>
              <Btn size="lg" className="mt-4 w-full" onClick={() => setError("")}>Try again</Btn>
            </div>
          )}

          {!plan && !loading && !error && (
            <div className="mt-5">
              <p className="mb-4 text-sm text-muted-foreground">Using your saved calorie &amp; macro targets.</p>
              <div className="space-y-3">
                <Field label="City or area">
                  <TextInput value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Lahore" />
                </Field>
                <Field label="Daily food budget">
                  <TextInput value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="e.g. 900" />
                </Field>
                <Field label="Currency">
                  <TextInput value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={8} placeholder="PKR" />
                </Field>
              </div>
              <Btn size="lg" className="mt-5 w-full" onClick={generate} disabled={!ready}>
                Generate my plan
              </Btn>
            </div>
          )}

          {plan && (
            <div className="mt-5">
              <div className="space-y-2">
                {plan.meals.map((m, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display text-lg leading-tight">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.meal}</div>
                      </div>
                      <div className="num shrink-0 text-right text-sm font-semibold">{m.cost} {plan.currency}</div>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{m.ingredients}</div>
                    <div className="num mt-2 text-xs text-muted-foreground">{m.calories} kcal · {m.protein}g protein · {m.carbs}g carbs · {m.fat}g fat</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">Total for the day</div>
                  <div className="num text-lg font-semibold">{plan.total_cost} {plan.currency}</div>
                </div>
                <div className={`mt-1 text-sm ${plan.within_budget ? "text-foreground" : "text-muted-foreground"}`}>
                  {plan.within_budget ? "Within your budget ✓" : "A little over budget — see the notes below"}
                </div>
                <div className="num mt-2 text-xs text-muted-foreground">Day total: {plan.totals.calories} kcal · {plan.totals.protein}g protein · {plan.totals.carbs}g carbs · {plan.totals.fat}g fat</div>
              </div>
              {plan.notes && <p className="mt-3 text-sm italic text-muted-foreground">{plan.notes}</p>}
              {plan.sources.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Prices from:{" "}
                  {plan.sources.map((s, i) => (
                    <span key={i}>
                      {i > 0 && " · "}
                      <a href={s} target="_blank" rel="noreferrer" className="underline underline-offset-2">source {i + 1}</a>
                    </span>
                  ))}
                </p>
              )}
              <Btn
                size="lg"
                variant="outline"
                className="mt-4 w-full"
                onClick={() => {
                  setPlan(null);
                  setError("");
                }}
              >
                <RefreshCw className="size-4" /> Make another plan
              </Btn>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
