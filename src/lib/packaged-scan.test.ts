import { describe, expect, it } from "vitest";
import type { PackagedFood } from "./off-food";
import { detectedTotalGrams, packageSearchQuery, scalePackagedLabel, strictPackageMatch } from "./packaged-scan";

const chicken: PackagedFood = {
  code: "1234567890123",
  brand: "Knorr",
  name: "Chicken Flavour Noodles",
  calories: 475,
  protein: 11.5,
  carbs: 62.3,
  fat: 19.7,
  source: "Open Food Facts",
  servingDescription: "Per 100 g or 100 ml · verify package label",
  packageQuantity: "61 g",
};
const recognized = { brand: "Knorr", product: "Chicken Flavor Noodles", pack_count: 2, grams_per_pack: 61 };

describe("one-call packaged-food reconciliation", () => {
  it("multiplies two 61 g packets using per-100-g label data, not AI guesses", () => {
    expect(detectedTotalGrams(recognized)).toBe(122);
    expect(scalePackagedLabel(chicken, 122)).toEqual({
      calories: 580, protein: 14, carbs: 76, fat: 24,
    });
  });
  it("does not invent a portion if the package size is invisible", () => {
    expect(detectedTotalGrams({ ...recognized, grams_per_pack: null })).toBeNull();
    expect(detectedTotalGrams({ ...recognized, pack_count: 0 })).toBeNull();
    expect(detectedTotalGrams({ ...recognized, pack_count: 50 })).toBeNull();
    expect(() => scalePackagedLabel(chicken, 0)).toThrow();
    expect(() => scalePackagedLabel(chicken, NaN)).toThrow();
  });
  it("matches only unique exact brand, variant, and package weight", () => {
    expect(strictPackageMatch(recognized, [chicken])).toEqual(chicken);
    expect(strictPackageMatch(recognized, [chicken, chicken])).toBeNull();
    expect(strictPackageMatch(recognized, [{ ...chicken, name: "Curry Flavour Noodles" }])).toBeNull();
    expect(strictPackageMatch(recognized, [{ ...chicken, brand: "Other" }])).toBeNull();
    expect(strictPackageMatch(recognized, [{ ...chicken, packageQuantity: "70g" }])).toBeNull();
  });
  it("only sends a short recognized product name to the food database", () => {
    expect(packageSearchQuery(recognized)).toBe("Knorr Chicken Flavor Noodles");
    expect(packageSearchQuery({ ...recognized, product: "X".repeat(200) }).length).toBeLessThanOrEqual(80);
  });
});
