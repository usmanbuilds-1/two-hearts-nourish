import { describe, expect, it } from "vitest";
import {
  evidenceRateBounds,
  fitHallMaintenance,
  hallInitialFatKg,
  hallLongTermParameters,
  hallTargetCalories,
  isEvidenceSupportedRate,
  simulateHallWeightPath,
} from "./adaptive-target";

const params = hallLongTermParameters({
  weightKg: 70,
  heightCm: 175,
  age: 30,
  sex: "male",
  pal: 1.6,
  restingMetabolicRateKcal: 1648.75,
});

describe("Hall adaptive target model", () => {
  it("reproduces a valid positive body-fat estimate from Hall/Jackson equation 4", () => {
    const fat = hallInitialFatKg({ weightKg: 70, heightM: 1.75, age: 30, sex: "male" });
    expect(fat).not.toBeNull();
    expect(fat!).toBeGreaterThan(0);
    expect(fat!).toBeLessThan(70);
  });

  it("builds positive long-term Hall parameters", () => {
    expect(params).not.toBeNull();
    expect(params!.rhoKjPerKg).toBeGreaterThan(0);
    expect(params!.epsilonKjPerKgDay).toBeGreaterThan(0);
    expect(params!.tauDays).toBeGreaterThan(0);
  });

  it("recovers a known maintenance intake from a synthetic Hall trajectory", () => {
    const p = params!;
    const intakes = Array.from({ length: 28 }, () => 2700);
    const path = simulateHallWeightPath({
      initialWeightKg: 70,
      maintenanceKcal: 2500,
      intakesKcal: intakes,
      parameters: p,
    });
    const weights = [0, 7, 14, 21, 28].map((dayIndex) => ({
      dayIndex,
      weightKg: path[dayIndex]!,
    }));
    const fit = fitHallMaintenance({
      initialWeightKg: 70,
      intakesKcal: intakes,
      weights,
      parameters: p,
    });
    expect(fit).not.toBeNull();
    expect(fit!.maintenanceKcal).toBeCloseTo(2500, 6);
    expect(fit!.maintenanceCi95Low).toBeCloseTo(2500, 6);
    expect(fit!.maintenanceCi95High).toBeCloseTo(2500, 6);
  });

  it("widens target uncertainty directly from maintenance uncertainty", () => {
    const result = hallTargetCalories({
      fittedBaselineMaintenanceKcal: 2500,
      fittedMaintenanceCi95Low: 2400,
      fittedMaintenanceCi95High: 2600,
      initialWeightKg: 70,
      currentWeightKg: 70,
      targetRatePctPerWeek: 0,
      parameters: params!,
    });
    expect(result.targetKcal).toBeCloseTo(2500, 6);
    expect(result.targetCi95Low).toBeCloseTo(2400, 6);
    expect(result.targetCi95High).toBeCloseTo(2600, 6);
  });

  it("does not invent a gain/loss pace outside published evidence ranges", () => {
    expect(evidenceRateBounds("gain")).toEqual(expect.objectContaining({
      minPctPerWeek: 0.25,
      maxPctPerWeek: 0.5,
    }));
    expect(evidenceRateBounds("lose")).toEqual(expect.objectContaining({
      minPctPerWeek: -1,
      maxPctPerWeek: -0.5,
    }));
    expect(isEvidenceSupportedRate("gain", 0.3)).toBe(true);
    expect(isEvidenceSupportedRate("gain", 0.1)).toBe(false);
    expect(isEvidenceSupportedRate("lose", -0.75)).toBe(true);
    expect(isEvidenceSupportedRate("lose", -0.25)).toBe(false);
    expect(isEvidenceSupportedRate("maintain", 0)).toBe(true);
  });
});
