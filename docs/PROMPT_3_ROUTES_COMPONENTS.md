# Prompt 3: Routes & Components

Create all new routes and components below. These are the UI views for diary, recipes, planner, and analytics.

## File 1: src/routes/_space.diary.tsx

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar, Plus } from "lucide-react";
import { useSpace } from "@/lib/space";
import { Btn, Screen, Field, TextInput, Eyebrow } from "@/components/us/primitives";
import { DiarySheet } from "@/components/us/DiarySheet";
import { RecentMealsSheet } from "@/components/us/RecentMealsSheet";
import { totals, coupleStats, parseLocalDate, fmt, addDays, MEAL_TYPES } from "@/lib/nutrition";
import type { Meal } from "@/lib/nutrition";

export const Route = createFileRoute("/_space/diary")({
  component: DiaryView,
});

function DiaryView() {
  const { me, meals, room, online, setRoom } = useSpace();
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split("T")[0];
  });
  const [sheet, setSheet] = useState<"add" | "recent" | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

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
        {/* Date Navigation */}
        <div className="flex items-center justify-between">
          <Btn size="sm" variant="ghost" onClick={handlePrevDay}>
            <ChevronLeft className="w-4 h-4" />
          </Btn>
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setDatePickerOpen(!datePickerOpen)}
          >
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{new Date(selectedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}</span>
          </div>
          <Btn size="sm" variant="ghost" onClick={handleNextDay}>
            <ChevronRight className="w-4 h-4" />
          </Btn>
        </div>

        {/* Macros Summary */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-secondary/50 rounded-lg">
          <div className="text-center">
            <Eyebrow className="text-xs text-muted-foreground">Kcal</Eyebrow>
            <div className="font-bold text-sm">{dayTotals.calories}/{me?.daily_calorie_target ?? 2000}</div>
            <div className={`text-xs ${remaining.calories > 0 ? "text-green-600" : "text-red-600"}`}>
              {remaining.calories > 0 ? `+${remaining.calories}` : `-${Math.abs(remaining.calories)}`}
            </div>
          </div>
          <div className="text-center">
            <Eyebrow className="text-xs text-muted-foreground">P</Eyebrow>
            <div className="font-bold text-sm">{dayTotals.protein}g</div>
            <div className="text-xs text-muted-foreground">{me?.daily_protein_target ?? 150}g</div>
          </div>
          <div className="text-center">
            <Eyebrow className="text-xs text-muted-foreground">C</Eyebrow>
            <div className="font-bold text-sm">{dayTotals.carbs}g</div>
            <div className="text-xs text-muted-foreground">{me?.daily_carbs_target ?? 225}g</div>
          </div>
          <div className="text-center">
            <Eyebrow className="text-xs text-muted-foreground">F</Eyebrow>
            <div className="font-bold text-sm">{dayTotals.fat}g</div>
            <div className="text-xs text-muted-foreground">{me?.daily_fat_target ?? 65}g</div>
          </div>
        </div>

        {/* Meals by Type */}
        <div className="space-y-3">
          {Array.from(mealsByType.entries()).map(([type, typeMeals]) => {
            const typeTotals = totals(typeMeals);
            return (
              <div key={type}>
                <Eyebrow className="mb-2 capitalize">{type}</Eyebrow>
                <div className="space-y-2">
                  {typeMeals.map((meal) => (
                    <div key={meal.id} className="p-3 bg-secondary rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{meal.food_name}</div>
                          {meal.serving_description && <div className="text-xs text-muted-foreground">{meal.serving_description}</div>}
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-bold">{meal.calories} kcal</div>
                          <div className="text-xs text-muted-foreground">P{meal.protein}g C{meal.carbs}g F{meal.fat}g</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {typeTotals.calories > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {type} total: {typeTotals.calories} kcal · P {typeTotals.protein}g · C {typeTotals.carbs}g · F {typeTotals.fat}g
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quick Add Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-4 border-t">
          <Btn onClick={() => setSheet("add")} className="w-full">
            <Plus className="w-4 h-4 mr-2" /> Add Meal
          </Btn>
          <Btn onClick={() => setSheet("recent")} variant="secondary" className="w-full">
            Recent
          </Btn>
        </div>
      </div>

      {sheet === "add" && <DiarySheet open={true} onOpenChange={(o) => !o && setSheet(null)} me={me!} />}
      {sheet === "recent" && <RecentMealsSheet open={true} onOpenChange={(o) => !o && setSheet(null)} selectedDate={selectedDate} />}
    </Screen>
  );
}
```

## File 2: src/routes/_space.recipes.tsx

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMealTemplates, deleteMealTemplate, saveMealTemplate } from "@/lib/meal.functions";
import { Btn, Screen, Eyebrow, TextInput } from "@/components/us/primitives";
import { useSpace } from "@/lib/space";
import { toast } from "sonner";

export const Route = createFileRoute("/_space/recipes")({
  component: RecipesView,
});

function RecipesView() {
  const { me } = useSpace();
  const queryClient = useQueryClient();
  const [newRecipeName, setNewRecipeName] = useState("");
  const [createMode, setCreateMode] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["meal-templates"],
    queryFn: () => getMealTemplates(),
  });

  const handleCreate = async () => {
    if (!newRecipeName.trim()) {
      toast.error("Recipe name required");
      return;
    }
    try {
      await saveMealTemplate({
        name: newRecipeName,
        meals: [],
      });
      queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      setNewRecipeName("");
      setCreateMode(false);
      toast.success("Recipe created");
    } catch (err) {
      toast.error("Failed to create recipe");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMealTemplate({ templateId: id });
      queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      toast.success("Recipe deleted");
    } catch (err) {
      toast.error("Failed to delete recipe");
    }
  };

  return (
    <Screen>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Eyebrow>My Recipes</Eyebrow>
          <Btn size="sm" onClick={() => setCreateMode(!createMode)}>
            <Plus className="w-4 h-4 mr-1" /> New
          </Btn>
        </div>

        {createMode && (
          <div className="p-3 bg-secondary rounded-lg space-y-2">
            <TextInput
              placeholder="Recipe name"
              value={newRecipeName}
              onChange={(e) => setNewRecipeName(e.target.value)}
            />
            <div className="flex gap-2">
              <Btn onClick={handleCreate} className="flex-1">
                Create
              </Btn>
              <Btn onClick={() => setCreateMode(false)} variant="secondary" className="flex-1">
                Cancel
              </Btn>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {templates.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <p>No recipes yet. Create one to get started!</p>
            </div>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="p-3 bg-secondary rounded-lg flex justify-between items-center">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.meals.length} meals</div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="w-4 h-4" />
                </Btn>
              </div>
            ))
          )}
        </div>
      </div>
    </Screen>
  );
}
```

## File 3: src/routes/_space.analytics.tsx

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getWeeklySummary } from "@/lib/meal-operations.functions";
import { Screen, Eyebrow } from "@/components/us/primitives";
import { useSpace } from "@/lib/space";

export const Route = createFileRoute("/_space/analytics")({
  component: AnalyticsView,
});

function AnalyticsView() {
  const { me } = useSpace();
  const { data: summary } = useQuery({
    queryKey: ["weekly-summary"],
    queryFn: () => getWeeklySummary(),
    enabled: !!me,
  });

  return (
    <Screen>
      <div className="space-y-4">
        <Eyebrow>This Week</Eyebrow>

        {summary ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Avg Calories</div>
                <div className="text-2xl font-bold">{summary.avgCalories}</div>
                <div className="text-xs text-muted-foreground mt-1">{summary.daysLogged} days logged</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Target Hit</div>
                <div className="text-2xl font-bold">{summary.targetAdherence}%</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Avg Protein</div>
                <div className="text-2xl font-bold">{summary.avgProtein}g</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Avg Carbs</div>
                <div className="text-2xl font-bold">{summary.avgCarbs}g</div>
              </div>
            </div>

            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-xs text-muted-foreground mb-2">Avg Fat</div>
              <div className="text-2xl font-bold">{summary.avgFat}g</div>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            Loading analytics...
          </div>
        )}
      </div>
    </Screen>
  );
}
```

## File 4: src/components/us/DiarySheet.tsx

```typescript
import { useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Btn, TextInput, Field } from "@/components/us/primitives";
import { insertMeal } from "@/lib/space";
import { toast } from "sonner";

export function DiarySheet({
  open,
  onOpenChange,
  me,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: any;
}) {
  const [foodName, setFoodName] = useState("");
  const [servingDescription, setServingDescription] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [mealType, setMealType] = useState("lunch");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!foodName.trim() || !calories) {
      toast.error("Food name and calories required");
      return;
    }
    setLoading(true);
    try {
      await insertMeal({
        food_name: foodName,
        serving_description: servingDescription || null,
        calories: parseInt(calories),
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
        meal_type: mealType,
        meal_date: new Date().toISOString().split("T")[0],
      });
      toast.success("Meal added");
      onOpenChange(false);
    } catch {
      toast.error("Failed to add meal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Meal</DrawerTitle>
          <DrawerDescription>Quick entry without food lookup</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 space-y-3">
          <Field label="Meal Type">
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="snack">Snack</option>
              <option value="dinner">Dinner</option>
            </select>
          </Field>
          <Field label="Food Name">
            <TextInput
              placeholder="e.g., Chicken breast"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
            />
          </Field>
          <Field label="Serving (optional)">
            <TextInput
              placeholder="e.g., 150g"
              value={servingDescription}
              onChange={(e) => setServingDescription(e.target.value)}
            />
          </Field>
          <Field label="Calories">
            <TextInput
              type="number"
              placeholder="0"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Protein (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
            </Field>
            <Field label="Carbs (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
              />
            </Field>
            <Field label="Fat (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
            </Field>
          </div>
          <Btn onClick={handleAdd} disabled={loading} className="w-full">
            {loading ? "Adding..." : "Add Meal"}
          </Btn>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

These files create the core diary, recipes, and analytics views. Paste each as a separate file.
