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
    // The day eaten is the primary signal; newly entered backdated food
    // must never be presented ahead of something actually eaten yesterday.
    .sort((a,b) => b.meal_date.localeCompare(a.meal_date)
      || b.created_at.localeCompare(a.created_at)
      || b.id.localeCompare(a.id));

  // A meal from weeks ago is not "your last meal" in a useful quick action.
  // Keep old food available in favourites/history rather than presenting it as recent.
  const freshBoundary = addDays(today, -3);
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

  // Log once, repeat forever: offer unique portions even before their
  // second log, while leaving older meals available in history.
  const seen = new Set<string>();
  const recentOptions = eligible.filter(m => {
    if (m.meal_date < addDays(today,-30)) return false;
    const signature = mealSignature(m);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).slice(0,12);
  const usualSignatures = new Set(usuals.map(u=>mealSignature(u.meal)));
  const suggested = [
    ...usuals.map(u=>u.meal),
    ...recentOptions.filter(m=>!usualSignatures.has(mealSignature(m))),
  ].slice(0,8);
  return {latest,usuals,suggested,recents:eligible.slice(0,18)};
}
