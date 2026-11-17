import { describe, expect, it } from "vitest";
import {
  addedFatNutrition,
  contextualQuestions,
  evidenceConfidence,
  labelEnergyWarning,
  normalizeFoodAlias,
  parseDeterministicContext,
} from "./scan-v2";

describe("scanner v2 deterministic helpers", () => {
  it("normalizes common South Asian aliases without rewriting unknown food", () => {
    expect(normalizeFoodAlias("chapati")).toBe("Roti");
    expect(normalizeFoodAlias("doodh patti")).toBe("Milk tea");
    expect(normalizeFoodAlias("Beef steak")).toBe("Beef steak");
  });

  it("turns explicit pack context into deterministic total grams", () => {
    expect(parseDeterministicContext("2 packets, 61g each")).toMatchObject({
      packCount: 2,
      gramsPerPack: 61,
      totalGrams: 122,
    });
  });

  it("converts explicit added oil to nutrition without an AI call", () => {
    const context = parseDeterministicContext("cooked with 2 tbsp oil");
    expect(context.addedFat?.grams).toBeCloseTo(27.2, 1);
    expect(addedFatNutrition(context)).toEqual({ calories: 245, protein: 0, carbs: 0, fat: 27.2 });
  });

  it("extracts an explicit identity correction", () => {
    expect(parseDeterministicContext("Actually this is beef, not chicken").identityOverride).toBe("beef");
  });

  it("uses 4/4/9 only as a warning rather than a reject rule", () => {
    expect(labelEnergyWarning({ calories: 200, protein: 10, carbs: 20, fat: 8 })).toBeNull();
    expect(labelEnergyWarning({ calories: 500, protein: 2, carbs: 2, fat: 1 })).toContain("Check");
  });

  it("penalizes uncertain portions and hidden fat", () => {
    const strong = evidenceConfidence({
      recognition: 0.95, portion: 0.9, databaseScore: 0.95,
      gramsEstimate: 200, gramsMin: 180, gramsMax: 220,
      hiddenFatRisk: "low", imageQuality: "good", componentCount: 1,
    });
    const weak = evidenceConfidence({
      recognition: 0.7, portion: 0.45, databaseScore: null,
      gramsEstimate: 350, gramsMin: 180, gramsMax: 600,
      hiddenFatRisk: "high", imageQuality: "fair", componentCount: 4,
    });
    expect(strong).toBeGreaterThan(weak);
    expect(contextualQuestions({
      hiddenFatRisk: "high", confidence: weak, gramsEstimate: 350, gramsMin: 180, gramsMax: 600,
    })).toHaveLength(2);
  });
});
