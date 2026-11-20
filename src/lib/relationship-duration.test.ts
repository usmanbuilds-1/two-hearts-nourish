import { describe, expect, it } from "vitest";
import { relationshipDurationMetric } from "./relationship-duration";

describe("relationship duration", () => {
  const created_at = "2026-11-01T18:25:00Z";

  it("derives the displayed count from the saved date, never a literal or server constant", () => {
    expect(relationshipDurationMetric({ created_at, together_since: "2025-08-28" }, "2026-11-20")).toEqual({
      label: "Days together",
      value: 449,
      detail: "Since your first day together.",
    });
  });

  it("does not drift across daylight-saving transitions", () => {
    const result = relationshipDurationMetric({ created_at, together_since: "2026-03-07" }, "2026-03-09");
    expect(result.value).toBe(2);
  });

  it("keeps the creation-day convention for spaces without a relationship date", () => {
    expect(relationshipDurationMetric({ created_at, together_since: null }, "2026-11-01").value).toBe(1);
  });

  it("does not fabricate a positive count for an invalid or future saved date", () => {
    expect(relationshipDurationMetric({ created_at, together_since: "2026-02-30" }, "2026-11-20").value).toBe("—");
    const future = relationshipDurationMetric({ created_at, together_since: "2027-01-01" }, "2026-11-20");
    expect(future.value).toBe(0);
    expect(future.detail).toContain("future");
  });
});
