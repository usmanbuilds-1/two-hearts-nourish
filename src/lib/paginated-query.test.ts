import { describe, expect, it, vi } from "vitest";
import { collectPages } from "./paginated-query";

describe("paginated query", () => {
  it("returns all records rather than truncating at 2000", async () => {
    const source = Array.from({ length: 2501 }, (_, i) => i);
    const fetchRange = vi.fn(async (start: number, end: number) => source.slice(start, end + 1));
    expect(await collectPages(fetchRange)).toEqual(source);
    expect(fetchRange).toHaveBeenCalledTimes(6);
  });

  it("propagates failures instead of showing an incomplete list", async () => {
    await expect(collectPages(async (start) => {
      if (start === 0) return [1, 2];
      throw new Error("DATABASE_ERROR");
    }, 2)).rejects.toThrow("DATABASE_ERROR");
  });

  it("rejects abnormally large result sets rather than silently truncating", async () => {
    await expect(collectPages(async () => [1, 2], 2, 3)).rejects.toThrow("MEAL_WINDOW_TOO_LARGE");
  });
});
