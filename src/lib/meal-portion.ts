/** Pure portion/rounding rules: UI components should not implement calorie math. */
export type MealMacroKey = "calories" | "protein" | "carbs" | "fat";

export type PortionDraftLike = {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  portion_percentage: number;
  nominal_calories?: number | undefined;
  nominal_protein?: number | undefined;
  nominal_carbs?: number | undefined;
  nominal_fat?: number | undefined;
};

const nominalKey: Record<MealMacroKey, keyof PortionDraftLike> = {
  calories: "nominal_calories",
  protein: "nominal_protein",
  carbs: "nominal_carbs",
  fat: "nominal_fat",
};

export function parseMacroNumber(value: string): number {
  return value.trim() ? Number(value.replace(",", ".")) : 0;
}

export function resetPortionBasis<T extends PortionDraftLike>(draft: T): T {
  return {
    ...draft,
    portion_percentage: 100,
    nominal_calories: undefined,
    nominal_protein: undefined,
    nominal_carbs: undefined,
    nominal_fat: undefined,
  };
}

export function editPortionMacro<T extends PortionDraftLike>(
  draft: T,
  key: MealMacroKey,
  value: string,
): T {
  const percentage = draft.portion_percentage > 0 ? draft.portion_percentage : 100;
  const parsed = parseMacroNumber(value);
  const nominal = Number.isFinite(parsed) ? (parsed / percentage * 100) : undefined;
  const rounded = nominal === undefined
    ? undefined
    : key === "calories"
      ? Math.round(nominal)
      : Math.round(nominal * 10) / 10;
  return { ...draft, [key]: value, [nominalKey[key]]: rounded };
}

export function scaleMealPortion<T extends PortionDraftLike>(draft: T, percentage: number): T {
  if (!Number.isFinite(percentage) || percentage <= 0) throw new Error("INVALID_PORTION");
  const previous = draft.portion_percentage > 0 ? draft.portion_percentage : 100;
  const base = (key: MealMacroKey, nominal: number | undefined) =>
    nominal ?? (parseMacroNumber(draft[key]) / previous * 100);
  const cal = Math.round(base("calories", draft.nominal_calories));
  const protein = base("protein", draft.nominal_protein);
  const carbs = base("carbs", draft.nominal_carbs);
  const fat = base("fat", draft.nominal_fat);
  const oneDecimal = (n: number) => Math.round(n * 10) / 10;
  return {
    ...draft,
    portion_percentage: percentage,
    nominal_calories: cal,
    nominal_protein: oneDecimal(protein),
    nominal_carbs: oneDecimal(carbs),
    nominal_fat: oneDecimal(fat),
    calories: String(Math.round(cal * percentage / 100)),
    protein: String(oneDecimal(protein * percentage / 100)),
    carbs: String(oneDecimal(carbs * percentage / 100)),
    fat: String(oneDecimal(fat * percentage / 100)),
  };
}
