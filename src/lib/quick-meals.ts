import { addDays, type Meal } from "./nutrition";

export type UsualMeal = {
  meal: Meal;
  times: number;
  lastLogged: string;
};

/** Treat portions and nutrition values as part of the meal identity.
 *  Two bowls with different serving sizes must not silently share macros.
 */
export function mealSignature(m: Pick<Meal, "food_name" | "serving_description" | "calories" | "protein" | "carbs" | "fat" | "portion_percentage">): string {
  const normalize = (value: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return JSON.stringify([
    normalize(m.food_name),
    normalize(m.serving_description),
    Number(m.calories),
    Number(m.protein),
    Number(m.carbs),
    Number(m.fat),
    Number(m.portion_percentage ?? 100),
  ]);
}

export function quickMealSuggestions(meals: Meal[], ownerId: string, today: string) {
  const eligible = meals
    .filter(m => m.member_id === ownerId && !m.is_planned && m.meal_date <= today)
    .sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

  // A meal from weeks ago is not "your last meal" in a useful quick action.
  // Keep old food available in favourites/history rather than presenting it as recent.
  const freshBoundary = addDays(today, -14);
  const latest = eligible.find(m => m.meal_date >= freshBoundary) ?? null;

  const groups = new Map<string, UsualMeal>();
  const historyBoundary = addDays(today, -120);
  for (const meal of eligible) {
    if (meal.meal_date < historyBoundary) continue;
    const key = mealSignature(meal);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {meal, times:1, lastLogged:meal.meal_date});
    } else {
      existing.times += 1;
      if (meal.meal_date > existing.lastLogged) existing.lastLogged = meal.meal_date;
    }
  }

  // Recent enough and repeated; only one representative per portion variation.
  const usuals = [...groups.values()]
    .filter(g => g.times >= 2 && g.lastLogged >= addDays(today, -45))
    .sort((a,b) => b.times-a.times || b.lastLogged.localeCompare(a.lastLogged)
      || b.meal.created_at.localeCompare(a.meal.created_at))
    .slice(0, 8);

  return { latest, usuals, recents: eligible.slice(0, 18) };
}
