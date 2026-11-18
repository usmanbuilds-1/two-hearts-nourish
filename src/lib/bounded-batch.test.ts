import { describe, expect, it } from "vitest";
import { mapInBatches } from "./bounded-batch";

describe("bounded provider concurrency", () => {
  it("preserves order and never exceeds the selected concurrency", async () => {
    let active = 0;
    let highest = 0;
    const result = await mapInBatches([1, 2, 3, 4, 5], 2, async n => {
      active += 1;
      highest = Math.max(highest, active);
      await Promise.resolve();
      active -= 1;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(highest).toBeLessThanOrEqual(2);
  });
});
