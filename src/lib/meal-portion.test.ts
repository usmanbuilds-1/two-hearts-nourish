import { describe, expect, it } from "vitest";
import { editPortionMacro, resetPortionBasis, scaleMealPortion, type PortionDraftLike } from "./meal-portion";

const meal: PortionDraftLike & { food_name: string } = {
  food_name: "One plate",
  calories: "600",
  protein: "32",
  carbs: "67",
  fat: "22",
  portion_percentage: 100,
};

describe("nutrition portion rules", () => {
  it("scales a full portion to half and back without cumulative drift", () => {
    const half = scaleMealPortion(meal, 50);
    expect(half.calories).toBe("300");
    expect(half.protein).toBe("16");
    const full = scaleMealPortion(half, 100);
    expect(full.calories).toBe("600");
    expect(full.protein).toBe("32");
  });

  it("editing a half-portion macro changes the full portion basis", () => {
    const half = scaleMealPortion(meal, 50);
    const adjusted = editPortionMacro(half, "protein", "21");
    expect(adjusted.nominal_protein).toBe(42);
    expect(scaleMealPortion(adjusted, 100).protein).toBe("42");
  });

  it("replaces the old portion basis when a saved food is chosen", () => {
    const quarter = scaleMealPortion(meal, 25);
    const replacement = resetPortionBasis({
      ...quarter, food_name: "Chicken sandwich", calories: "440", protein: "26",
    });
    expect(replacement.portion_percentage).toBe(100);
    expect(replacement.nominal_calories).toBeUndefined();
    expect(scaleMealPortion(replacement, 50).calories).toBe("220");
  });
});
