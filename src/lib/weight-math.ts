/** Pure calendar-day math. Never treat weight entries as daily when days were skipped. */
export type DatedWeight = { logged_date: string; weight_kg: number };

export function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function calendarDaysAgo(date: string, days: number): string {
  return new Date((dayNumber(date) - days) * 86400000).toISOString().slice(0, 10);
}

export function weightTrendKgPerWeek(entries: DatedWeight[]): number | null {
  if (entries.length < 3) return null;
  const firstDay = dayNumber(entries[0]!.logged_date);
  const xs = entries.map(e => dayNumber(e.logged_date) - firstDay);
  if (new Set(xs).size < 3) return null;
  const ys = entries.map(e => e.weight_kg);
  const n = entries.length;
  const sumX = xs.reduce((a,b) => a+b,0);
  const sumY = ys.reduce((a,b) => a+b,0);
  const sumXY = xs.reduce((a,x,i) => a+x*ys[i]!,0);
  const sumX2 = xs.reduce((a,x) => a+x*x,0);
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? null : Math.round(((n*sumXY-sumX*sumY)/denom)*700)/100;
}

export function calendarRollingAverage(entries: DatedWeight[], days = 7) {
  return entries.map(entry => {
    const end = dayNumber(entry.logged_date);
    const range = entries.filter(e => {
      const d = dayNumber(e.logged_date);
      return d <= end && d > end-days;
    });
    const avg = range.reduce((sum,e) => sum+e.weight_kg,0)/range.length;
    return { logged_date: entry.logged_date, avg: Math.round(avg*10)/10 };
  });
}
