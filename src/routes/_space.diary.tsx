import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSpace } from "@/lib/space";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { MealSheet } from "@/components/us/MealSheet";
import { DiarySheet } from "@/components/us/DiarySheet";
import { totals, addDays, MEAL_TYPES, fmt } from "@/lib/nutrition";
import type { Meal } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space/diary")({
  component: DiaryView,
});

function DiaryView() {
  const { me, meals, partner } = useSpace();
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [addOpen, setAddOpen] = useState(false);
  const [editMeal, setEditMeal] = useState<Meal | null>(null);

  const dayMeals = useMemo(
    () => meals.filter((m) => m.meal_date === selectedDate),
    [meals, selectedDate],
  );
  const mine = useMemo(() => dayMeals.filter((m) => m.member_id === me.id), [dayMeals, me.id]);
  const dayTotals = useMemo(() => totals(mine), [mine]);
  const target = me.daily_calorie_target ?? 0;
  const remaining = target > 0 ? target - dayTotals.calories : null;

  function prevDay() { setSelectedDate(addDays(selectedDate, -1)); }
  function nextDay() { setSelectedDate(addDays(selectedDate, 1)); }

  const displayDate = new Date(selectedDate + "T12:00:00");

  return (
    <Screen>
      <div className="space-y-4">
        {/* Date nav */}
        <div className="flex items-center justify-between">
          <Btn size="sm" variant="ghost" onClick={prevDay}>
            <ChevronLeft className="size-4" />
          </Btn>
          <span className="font-medium">
            {displayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
          <Btn size="sm" variant="ghost" onClick={nextDay}>
            <ChevronRight className="size-4" />
          </Btn>
        </div>

        {/* Macro summary */}
        <div className="grid grid-cols-4 gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Kcal</div>
            <div className="num font-bold">{dayTotals.calories}</div>
            {target > 0 && <div className="text-xs text-muted-foreground">/ {target}</div>}
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Protein</div>
            <div className="num font-bold">{fmt(dayTotals.protein)}g</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Carbs</div>
            <div className="num font-bold">{fmt(dayTotals.carbs)}g</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Fat</div>
            <div className="num font-bold">{fmt(dayTotals.fat)}g</div>
          </div>
        </div>

        {remaining !== null && (
          <p className={cn("text-center text-sm font-medium", remaining >= 0 ? "text-primary" : "text-destructive")}>
            {remaining >= 0 ? `${remaining} kcal remaining` : `${Math.abs(remaining)} kcal over target`}
          </p>
        )}

        {/* Meals by type */}
        {MEAL_TYPES.map((t) => {
          const list = mine.filter((m) => m.meal_type === t.key);
          return (
            <div key={t.key}>
              <Eyebrow className="mb-2">{t.label} {t.icon}</Eyebrow>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">Not logged yet</p>
              ) : (
                <div className="space-y-2">
                  {list.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setEditMeal(m)}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.food_name}</div>
                        {m.serving_description && (
                          <div className="text-xs text-muted-foreground">{m.serving_description}</div>
                        )}
                      </div>
                      <div className="num ml-3 text-right text-sm shrink-0">
                        <div>{fmt(m.calories)} kcal</div>
                        <div className="text-xs text-muted-foreground">P {fmt(Number(m.protein))}g</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Add button */}
        <div className="pt-2 border-t">
          <Btn className="w-full" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-2" /> Add to {displayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Btn>
        </div>
      </div>

      <DiarySheet open={addOpen} onOpenChange={setAddOpen} targetDate={selectedDate} />
      <MealSheet open={!!editMeal} meal={editMeal} onOpenChange={(o) => !o && setEditMeal(null)} />
    </Screen>
  );
}
