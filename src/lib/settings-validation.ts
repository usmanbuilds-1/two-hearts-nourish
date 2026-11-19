export type TargetStrings = {
  kcal: string;
  p: string;
  c: string;
  fat: string;
};

/** Reject malformed target text rather than turning it into a NULL column. */
export function validateTargets(values: TargetStrings): string | null {
  const fields: Array<[string, string, number, number]> = [
    ["Daily calories", values.kcal, 1, 10000],
    ["Protein", values.p, 0, 2000],
    ["Carbs", values.c, 0, 2000],
    ["Fat", values.fat, 0, 2000],
  ];
  for (const [name, input, min, max] of fields) {
    if (!input.trim()) continue;
    const value = Number(input);
    if (!Number.isFinite(value) || value < min || value > max ||
        (name === "Daily calories" && !Number.isInteger(value))) {
      return name + " must be a valid number between " + min + " and " + max + ".";
    }
  }
  return null;
}
