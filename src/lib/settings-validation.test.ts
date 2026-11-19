import { describe, expect, it } from "vitest";
import { validateTargets } from "./settings-validation";
const values = { kcal: "2450", p: "130.5", c: "300", fat: "75" };

describe("settings target validation", () => {
  it("accepts explicit zero grams and blank optional targets", () => {
    expect(validateTargets({ ...values, fat: "0", p: "" })).toBeNull();
  });
  it("rejects malformed and infinite targets instead of silently clearing them", () => {
    expect(validateTargets({ ...values, p: "abc" })).toContain("Protein");
    expect(validateTargets({ ...values, p: "Infinity" })).toContain("Protein");
  });
  it("rejects noninteger or nonpositive calories", () => {
    expect(validateTargets({ ...values, kcal: "0" })).toContain("Daily calories");
    expect(validateTargets({ ...values, kcal: "2450.5" })).toContain("Daily calories");
  });
});
