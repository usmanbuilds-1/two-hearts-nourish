import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar, Plus } from "lucide-react";
import { useSpace } from "@/lib/space";
import { Btn, Screen, Eyebrow } from "@/components/us/primitives";
import { DiarySheet } from "@/components/us/DiarySheet";
import { totals, addDays, MEAL_TYPES } from "@/lib/nutrition";
import type { Meal } from "@/lib/nutrition";

export const Route = createFileRoute("/_space/diary")({
  component: DiaryView,
});

function DiaryView() {
  const { me, meals } = useSpace();
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split("T")[0];
  });
  const [sheet, setSheet] = useState<"add" | null>(null);

  const dayMeals = useMemo(() => {
    return meals.filter((m) => m.meal_date === selectedDate && m.member_id === me?.id);
  }, [meals, selectedDate, me?.id]);

  const dayTotals = useMemo(() => totals(dayMeals), [dayMeals]);
  const remaining = useMemo(() => {
    const target = me?.daily_calorie_target ?? 2000;
    return {
      calories: Math.max(0, target - dayTotals.calories),
      protein: Math.max(0, (me?.daily_protein_target ?? 150) - dayTotals.protein),
      carbs: Math.max(0, (me?.daily_carbs_target ?? 225) - dayTotals.carbs),
      fat: Math.max(0, (me?.daily_fat_target ?? 65) - dayTotals.fat),
    };
  }, [dayTotals, me]);

  const mealsByType = useMemo(() => {
    const grouped = new Map<string, Meal[]>();
    for (const type of MEAL_TYPES) {
      grouped.set(type, dayMeals.filter((m) => m.meal_type === type));
    }
    return grouped;
  }, [dayMeals]);

  const handlePrevDay = () => setSelectedDate(addDays(selectedDate, -1));
  const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));

  return (
    <Screen>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Btn size="sm" variant="ghost" onClick={handlePrevDay}>
            <ChevronLeft className="w-4 h-4" />
          </Btn>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{new Date(selectedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}</span>
          </div>
          <Btn size="sm" variant="ghost" onClick={handleNextDay}>
            <ChevronRight className="w-4 h-4" />
          </Btn>
        </div>

        <div className="grid grid-cols-4 gap-2 p-3 bg-secondary/50 rounded-lg">
          <div className="text-center">
            <Eyebrow className="text-xs text-muted-foreground">Kcal</Eyebrow>
            <div className="font-bold text-sm">{dayTotals.calories}/{me?.daily_calorie_target ?? 2000}</div>
            <div className={`text-xs ${remaining.calories > 0 ? "text-green-600" : "text-red-600"}`}>
              {remaining.calories > 0 ? `+${remaining.calories}` : `-${Math.abs(remaining.calories)}`}
            </div>
          </div>
          <div className="text-center">
            <Eyebrow className="text-xs">P</Eyebrow>
            <div className="font-bold text-sm">{dayTotals.protein}g</div>
          </div>
          <div className="text-center">
            <Eyebrow className="text-xs">C</Eyebrow>
            <div className="font-bold text-sm">{dayTotals.carbs}g</div>
          </div>
          <div className="text-center">
            <Eyebrow className="text-xs">F</Eyebrow>
            <div className="font-bold text-sm">{dayTotals.fat}g</div>
          </div>
        </div>

        <div className="space-y-3">
          {Array.from(mealsByType.entries()).map(([type, typeMeals]) => {
            const typeTotals = totals(typeMeals);
            return (
              <div key={type}>
                <Eyebrow className="mb-2 capitalize text-xs">{type}</Eyebrow>
                <div className="space-y-2">
                  {typeMeals.map((meal) => (
                    <div key={meal.id} className="p-3 bg-secondary rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-sm">{meal.food_name}</div>
                          {meal.serving_description && <div className="text-xs text-muted-foreground">{meal.serving_description}</div>}
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-bold">{meal.calories}</div>
                          <div className="text-xs text-muted-foreground">P{meal.protein}g</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-4 border-t">
          <Btn onClick={() => setSheet("add")} className="w-full">
            <Plus className="w-4 h-4 mr-2" /> Add Meal
          </Btn>
        </div>
      </div>

      {sheet === "add" && <DiarySheet open={true} onOpenChange={(o) => !o && setSheet(null)} />}
    </Screen>
  );
}
