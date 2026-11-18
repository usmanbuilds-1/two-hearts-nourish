type FdcNutrient = {
  nutrientName?: string;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
  amount?: number;
};

type FdcFood = {
  fdcId?: number;
  description?: string;
  dataType?: string;
  brandOwner?: string;
  foodNutrients?: FdcNutrient[];
};

export type UsdaFoodMatch = {
  fdcId: number;
  label: string;
  dataType: string;
  score: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

const cache = new Map<string, { at: number; value: UsdaFoodMatch | null }>();
const CACHE_MS = 6 * 60 * 60_000;

function terms(value: string): Set<string> {
  return new Set(
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
      .filter((token) => token.length > 1),
  );
}

export function scoreFoodCandidate(query: string, description: string): number {
  const q = terms(query);
  const d = terms(description);
  if (q.size === 0 || d.size === 0) return 0;
  let overlap = 0;
  for (const token of q) if (d.has(token)) overlap++;
  const recall = overlap / q.size;
  const precision = overlap / d.size;
  const exact = query.trim().toLowerCase() === description.trim().toLowerCase() ? 0.15 : 0;
  return Math.max(0, Math.min(1, recall * 0.72 + precision * 0.13 + exact));
}

function nutrientValue(food: FdcFood, names: RegExp[]): number | null {
  const list = food.foodNutrients ?? [];
  for (const nutrient of list) {
    const name = nutrient.nutrientName ?? "";
    if (!names.some((pattern) => pattern.test(name))) continue;
    const value = nutrient.value ?? nutrient.amount;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/**
 * FDC exposes both kcal and kJ energy entries under the name "Energy".
 * Never assume the first entry is kcal: 690 kJ is only about 165 kcal.
 */
export function foodEnergyKcal(food: FdcFood): number | null {
  let energyKj: number | null = null;
  for (const nutrient of food.foodNutrients ?? []) {
    const name = nutrient.nutrientName ?? "";
    const number = String(nutrient.nutrientNumber ?? "");
    if (!/^Energy(?:\\b|,)/i.test(name)) continue;
    const value = nutrient.value ?? nutrient.amount;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    const unit = (nutrient.unitName ?? "").trim().toLowerCase();
    if (unit === "kcal" || unit === "kilocalories" ||
        (!unit && number === "208") || /kcal/i.test(name)) {
      return value;
    }
    if (unit === "kj" || number === "268") energyKj = value;
  }
  // If kcal is absent, make the units explicit by converting any kJ entry.
  return energyKj === null ? null : energyKj / 4.184;
}

export function normalizeFdcFood(food: FdcFood, query: string): UsdaFoodMatch | null {
  const fdcId = food.fdcId;
  const label = food.description?.trim();
  if (!Number.isInteger(fdcId) || !label) return null;

  const calories = foodEnergyKcal(food);
  const protein = nutrientValue(food, [/^Protein$/i]);
  const carbs = nutrientValue(food, [/Carbohydrate.*difference/i, /^Carbohydrate$/i]);
  const fat = nutrientValue(food, [/Total lipid.*fat/i, /^Total fat$/i]);
  if ([calories, protein, carbs, fat].some((value) => value == null)) return null;

  const score = scoreFoodCandidate(query, label);
  if (score < 0.48) return null;
  return {
    fdcId: fdcId as number,
    label,
    dataType: food.dataType ?? "USDA",
    score: Math.round(score * 100) / 100,
    caloriesPer100g: Math.round((calories as number) * 10) / 10,
    proteinPer100g: Math.round((protein as number) * 10) / 10,
    carbsPer100g: Math.round((carbs as number) * 10) / 10,
    fatPer100g: Math.round((fat as number) * 10) / 10,
  };
}

export async function searchUsdaFood(query: string): Promise<UsdaFoodMatch | null> {
  const key = process.env["USDA_FDC_API_KEY"];
  if (!key) return null;
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 120);
  if (normalized.length < 2) return null;

  const cacheKey = normalized.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  // USDA's official FoodData Central API requires api_key in the request URL.
  // This URL is never returned to the browser or logged.
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        query: normalized,
        pageSize: 8,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
      }),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const payload = (await response.json()) as { foods?: FdcFood[] };
  const candidates = (payload.foods ?? [])
    .map((food) => normalizeFdcFood(food, normalized))
    .filter((food): food is UsdaFoodMatch => Boolean(food))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0] ?? null;
  const second = candidates[1] ?? null;
  // Require both an absolute match threshold and separation from the runner-up.
  const result = best && best.score >= 0.58 && (!second || best.score - second.score >= 0.05)
    ? best
    : null;
  cache.set(cacheKey, { at: Date.now(), value: result });
  if (cache.size > 500) cache.clear();
  return result;
}

export function scaleUsda(match: UsdaFoodMatch, grams: number) {
  const factor = Math.max(0, grams) / 100;
  return {
    calories: Math.round(match.caloriesPer100g * factor),
    protein: Math.round(match.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(match.carbsPer100g * factor * 10) / 10,
    fat: Math.round(match.fatPer100g * factor * 10) / 10,
  };
}
