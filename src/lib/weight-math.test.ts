import { describe, expect, it } from "vitest";
import { calendarDaysAgo, calendarRollingAverage, dayNumber, weightTrendKgPerWeek } from "./weight-math";

describe("calendar aware weight analytics", () => {
  it("respects real days when recordings are irregular", () => {
    const entries = [
      {logged_date:"2026-10-01", weight_kg:60},
      {logged_date:"2026-10-08", weight_kg:61},
      {logged_date:"2026-10-15", weight_kg:62},
    ];
    expect(weightTrendKgPerWeek(entries)).toBe(1);
    expect(calendarRollingAverage(entries).map(e=>e.avg)).toEqual([60,61,62]);
  });
  it("handles month and leap year boundaries", () => {
    expect(calendarDaysAgo("2024-03-01",1)).toBe("2024-02-29");
    expect(dayNumber("2026-11-13")-dayNumber("2026-11-06")).toBe(7);
  });
  it("does not estimate a slope from too few readings", () => {
    expect(weightTrendKgPerWeek([{logged_date:"2026-11-11",weight_kg:65}])).toBeNull();
  });
});
