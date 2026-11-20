import type { Room } from "./nutrition";

export type RelationshipDuration = {
  label: string;
  value: number | string;
  detail: string;
};

/**
 * Compare calendar dates, never elapsed milliseconds in the viewer's timezone:
 * daylight saving and local browser offsets cannot change relationship days.
 * A saved relationship date counts elapsed days (the first day is day zero),
 * preserving the existing app counter semantics. A created space counts its
 * creation day as day one, as the old UI did.
 */
function utcCalendarDay(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const timestamp = Date.parse(isoDate + "T00:00:00Z");
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== isoDate) return null;
  return Math.round(timestamp / 86_400_000);
}

export function relationshipDurationMetric(
  room: Pick<Room, "together_since" | "created_at">,
  today: string,
): RelationshipDuration {
  const todayDay = utcCalendarDay(today);
  const hasRelationshipDate = Boolean(room.together_since);
  const label = hasRelationshipDate ? "Days together" : "Days in this space";
  if (todayDay === null) return { label, value: "—", detail: "Date unavailable. Try reopening the app." };

  const startText = hasRelationshipDate
    ? room.together_since!
    : room.created_at.slice(0, 10);
  const startDay = utcCalendarDay(startText);
  if (startDay === null) {
    return {
      label,
      value: "—",
      detail: hasRelationshipDate
        ? "The date saved in Settings is invalid. Correct it to show your days together."
        : "The shared space creation date is unavailable.",
    };
  }
  if (startDay > todayDay) {
    return {
      label,
      value: 0,
      detail: hasRelationshipDate
        ? "Your saved relationship date is in the future. Check it in Settings."
        : "This shared space has a future creation date.",
    };
  }
  return hasRelationshipDate
    ? {
      label,
      value: todayDay - startDay,
      detail: "Since your first day together.",
    }
    : {
      label,
      value: todayDay - startDay + 1,
      detail: "Since you made this space.",
    };
}
