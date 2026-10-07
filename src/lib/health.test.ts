import { describe, expect, it } from "vitest";
import { bmi, bmr, suggest, validate } from "./health";

describe("health formulas", () => {
  it("BMI 70kg 175cm = 22.9", () => expect(bmi(175, 70)).toBe(22.9));
  it("Mifflin male 70kg 175cm 30y = 1648.75", () => expect(bmr({ heightCm: 175, weightKg: 70, age: 30, sex: "male" })).toBeCloseTo(1648.75));
  it("Mifflin female 60kg 165cm 30y = 1320.25", () => expect(bmr({ heightCm: 165, weightKg: 60, age: 30, sex: "female" })).toBeCloseTo(1320.25));
  it("maintain moderate male = TDEE", () => expect(suggest({ heightCm: 175, weightKg: 70, age: 30, sex: "male", activity: "moderate", goal: "maintain" }).calories).toBe(2560));
  it("deficit is at most 500 kcal", () => expect(suggest({ heightCm: 175, weightKg: 70, age: 30, sex: "male", activity: "moderate", goal: "lose" }).calories).toBe(2060));
  it("never below BMR / female floor", () => {
    const s = suggest({ heightCm: 150, weightKg: 45, age: 60, sex: "female", activity: "sedentary", goal: "lose" });
    expect(s.calories).toBeGreaterThanOrEqual(1200);
  });
  it("no weight loss when underweight", () => {
    const s = suggest({ heightCm: 175, weightKg: 50, age: 25, sex: "male", activity: "sedentary", goal: "lose" });
    expect(s.calories).toBe(s.tdee);
  });
  it("rejects minors", () => expect(validate({ heightCm: 170, weightKg: 60, age: 16, sex: "male", activity: "light", goal: "maintain" })).not.toBeNull());
});
