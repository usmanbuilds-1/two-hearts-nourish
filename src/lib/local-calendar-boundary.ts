/**
 * A phone's local calendar day can be one day ahead of or behind UTC. Do not
 * trust arbitrarily forged clientDate values for diary-completeness evaluation.
 * Validates a real Gregorian date and allows at most one UTC-day difference.
 */
export function isCurrentLocalCalendarDate(clientDate: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) return false;
  const day = Date.parse(clientDate + "T00:00:00Z");
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== clientDate) return false;
  const serverDay = Date.parse(now.toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.abs(day - serverDay) <= 86_400_000;
}
