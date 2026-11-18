import { describe, expect, it } from "vitest";
import { SCIENCE_TIPS, scienceTipFor } from "./science-tips";

describe("science tips", () => {
  it("keeps every shipped claim traceable to an HTTPS source", () => {
    expect(SCIENCE_TIPS.length).toBeGreaterThanOrEqual(6);
    for (const tip of SCIENCE_TIPS) {
      expect(tip.sourceUrl.startsWith("https://")).toBe(true);
      expect(tip.sourceLabel.length).toBeGreaterThan(4);
      expect(tip.body.length).toBeGreaterThan(30);
    }
  });

  it("uses only general tips when no body goal is set", () => {
    const tip = scienceTipFor(null, "2026-11-18");
    expect(tip.goals.includes("all")).toBe(true);
  });

  it("returns a tip applicable to the selected goal", () => {
    const tip = scienceTipFor("gain", "2026-11-18");
    expect(tip.goals.includes("all") || tip.goals.includes("gain")).toBe(true);
  });
});
