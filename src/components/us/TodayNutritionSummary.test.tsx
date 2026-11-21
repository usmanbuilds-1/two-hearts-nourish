import { describe, expect, it } from "vitest";
import { goalProgress } from "./TodayNutritionSummary";

describe("Today nutrition rings", () => {
  it("never claims a completed goal when no target exists", () => {
    expect(goalProgress(900, 0)).toBe(0);
    expect(goalProgress(900, null)).toBe(0);
    expect(goalProgress(900, undefined)).toBe(0);
  });

  it("clamps over-target and invalid inputs without drawing an invalid ring", () => {
    expect(goalProgress(1600, 800)).toBe(100);
    expect(goalProgress(0, 800)).toBe(0);
    expect(goalProgress(Number.NaN, 100)).toBe(0);
  });

  it("uses genuine percentage of the saved calorie target", () => {
    expect(goalProgress(1250, 2500)).toBe(50);
  });
});
