import { describe, expect, it } from "vitest";
import { csvCell, mealsToCsv } from "./export-meals";

describe("safe private CSV export", () => {
  it("escapes quotes and newlines", () => {
    expect(csvCell('Chicken "rice"\nplate')).toBe('"Chicken ""rice""\nplate"');
  });
  it("does not execute spreadsheet formulas", () => {
    expect(csvCell("=SUM(1,2)")).toBe("\"'=SUM(1,2)\"");
    expect(csvCell(" -1+2")).toBe("\"' -1+2\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
  });
  it("exports dates and macros", () => {
    const csv = mealsToCsv([{ meal_date: "2026-11-13", food_name: "roti", calories: 125 }]);
    expect(csv).toContain('"roti"');
    expect(csv).toContain('"125"');
  });
});
