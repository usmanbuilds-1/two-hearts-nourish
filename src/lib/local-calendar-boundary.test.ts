import { describe, expect, it } from "vitest";
import { isCurrentLocalCalendarDate } from "./local-calendar-boundary";

const server = new Date("2026-11-19T01:00:00Z");

describe("client calendar boundary", () => {
  it("accepts UTC and neighboring local dates", () => {
    expect(isCurrentLocalCalendarDate("2026-11-18", server)).toBe(true);
    expect(isCurrentLocalCalendarDate("2026-11-19", server)).toBe(true);
    expect(isCurrentLocalCalendarDate("2026-11-20", server)).toBe(true);
  });
  it("rejects arbitrary future/past dates and invalid calendar values", () => {
    expect(isCurrentLocalCalendarDate("2027-02-01", server)).toBe(false);
    expect(isCurrentLocalCalendarDate("2026-11-16", server)).toBe(false);
    expect(isCurrentLocalCalendarDate("2026-02-30", server)).toBe(false);
    expect(isCurrentLocalCalendarDate("2026-11-1", server)).toBe(false);
  });
});
