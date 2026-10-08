import { useState } from "react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Btn, Eyebrow, Field, TextInput } from "./primitives";
import { generateDietPlan, type DietPlan } from "@/lib/plan.functions";
import { fmt } from "@/lib/nutrition";
import type { Member } from "@/lib/nutrition";

const MEAL_BADGE: Record<string, string> = {
  Breakfast: "🌅",
  Lunch: "☀️",
  Snack: "🍎",
  Dinner: "🌙",
};

function errorMsg(code: string) {
  if (code === "AI_CREDITS") return "Daily AI budget reached — try again tomorrow.";
  if (code === "NOT_MEMBER") return "Join a space first.";
  if (code === "AI_BUSY") return "AI is busy right now. Give it a moment and try again.";
  return "Couldn't generate a plan. Please try again.";
}

export function BudgetPlanSheet({
  open,
  onOpenChange,
  me,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  me: Member;
}) {
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const canGenerate = city.trim().length > 0 && budget.trim().length > 0 && Number(budget) > 0 && me.daily_calorie_target !== null;

  async function generate() {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await generateDietPlan({
        data: {
          calories: me.daily_calorie_target!,
          protein: Number(me.daily_protein_target ?? 100),
          carbs: Number(me.daily_carbs_target ?? 200),
          fat: Number(me.daily_fat_target ?? 60),
          budget: Number(budget),
          currency: currency.trim() || "PKR",
          locality: city.trim(),
        },
      });
      if (!res.ok) { setError(errorMsg(res.error)); return; }
      setPlan(res.plan);
      setGroceryOpen(false);
      setChecked(new Set());
    } catch {
      setError("Couldn't generate a plan. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPlan(null);
    setError(null);
    setGroceryOpen(false);
    setChecked(new Set());
  }

  // Extract grocery items from meal ingredients
  const groceryItems = plan
    ? Array.from(
        new Set(
          plan.meals.flatMap((m) =>
            m.ingredients
              .split(/[,\n]+/)
              .map((s) => s.replace(/\d+\s*(g|ml|kg|l|tbsp|tsp|cup|oz|lb|piece|slice|medium|large|small|serving)s?\.?/gi, "").trim())
              .filter((s) => s.length > 2),
          ),
        ),
      )
    : [];

  function copyUnchecked() {
    const items = groceryItems.filter((i) => !checked.has(i));
    navigator.clipboard.writeText(items.join("\n")).then(
      () => toast("Copied to clipboard 📋"),
      () => toast.error("Couldn't copy"),
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-xl border-border bg-background">
        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <DrawerTitle className="font-display text-2xl font-normal">Budget Meal Planner 💰</DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-muted-foreground">
            AI-generated meals using real local prices.
          </DrawerDescription>

          {!plan ? (
            <div className="mt-5 space-y-4">
              <Field label="Your city">
                <TextInput
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Lahore, Karachi, London"
                  disabled={loading}
                />
              </Field>
              <Field label="Daily budget">
                <TextInput
                  inputMode="numeric"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g. 500"
                  disabled={loading}
                />
              </Field>
              <Field label="Currency" hint="e.g. PKR, USD, GBP">
                <TextInput
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="PKR"
                  disabled={loading}
                />
              </Field>
              <p className="text-xs text-muted-foreground">Using your saved calorie & macro targets as goals.</p>

              {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

              {loading ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Finding local prices & building your plan…</p>
                </div>
              ) : (
                <Btn size="lg" className="w-full" onClick={generate} disabled={!canGenerate}>
                  Generate my plan ✨
                </Btn>
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {/* Meal cards */}
              {plan.meals.map((m, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                        {MEAL_BADGE[m.meal] ?? ""} {m.meal}
                      </span>
                      <div className="mt-2 font-semibold">{m.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{m.ingredients}</div>
                    </div>
                    <div className="num shrink-0 text-right text-sm font-semibold text-primary">
                      {plan.currency} {m.cost.toFixed(0)}
                    </div>
                  </div>
                  <div className="num mt-3 text-xs text-muted-foreground">
                    {fmt(m.calories)} kcal · {fmt(m.protein)}g protein · {fmt(m.carbs)}g carbs · {fmt(m.fat)}g fat
                  </div>
                </div>
              ))}

              {/* Totals */}
              <div className="rounded-xl bg-secondary p-3 text-sm">
                <div className="flex justify-between">
                  <span>Total cost</span>
                  <span className={`num font-semibold ${plan.within_budget ? "text-primary" : "text-destructive"}`}>
                    {plan.currency} {plan.total_cost.toFixed(0)} / {budget} {plan.within_budget ? "✓" : "⚠️ over budget"}
                  </span>
                </div>
                <div className="num mt-1 text-xs text-muted-foreground">
                  {fmt(plan.totals.calories)} kcal · {fmt(plan.totals.protein)}g protein · {fmt(plan.totals.carbs)}g carbs · {fmt(plan.totals.fat)}g fat
                </div>
              </div>

              {plan.notes && <p className="text-sm italic text-muted-foreground">{plan.notes}</p>}

              {/* Grocery list */}
              <div>
                <Btn variant="outline" className="w-full" onClick={() => setGroceryOpen((o) => !o)}>
                  {groceryOpen ? "Hide" : "Show"} grocery list 🛒
                </Btn>
                {groceryOpen && groceryItems.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {groceryItems.map((item) => (
                      <label key={item} className="flex cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={checked.has(item)}
                          onChange={() => setChecked((s) => { const n = new Set(s); n.has(item) ? n.delete(item) : n.add(item); return n; })}
                          className="size-4 rounded"
                        />
                        <span className={checked.has(item) ? "line-through text-muted-foreground" : ""}>{item}</span>
                      </label>
                    ))}
                    <Btn variant="outline" className="mt-2 w-full" onClick={copyUnchecked}>
                      Copy unchecked items
                    </Btn>
                  </div>
                )}
              </div>

              <Btn variant="outline" className="w-full" onClick={reset}>Try again</Btn>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
