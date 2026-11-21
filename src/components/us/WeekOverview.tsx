import { ChevronLeft, ChevronRight, Info, TrendingUp } from "lucide-react";
import { fmt, parseLocalDate, type Meal, type Member, type Totals } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export type WeekRow = {
  d: string;
  mine: Totals;
  theirs: Totals;
  mineMeals: Meal[];
  theirMeals: Meal[];
};

export function weekAtAGlance(rows: WeekRow[]) {
  const loggedMine = rows.filter(row => row.mine.count > 0);
  return {
    bothLogged: rows.filter(row => row.mine.count > 0 && row.theirs.count > 0).length,
    mineLoggedDays: loggedMine.length,
    mineLoggedDayAverage: loggedMine.length > 0
      ? Math.round(loggedMine.reduce((sum, row) => sum + row.mine.calories, 0) / loggedMine.length)
      : null,
  };
}

/** Week history uses actual meal logs, NOT assumptions about complete intake.
 * A missing food log is represented as missing, never a 0-kcal day.
 */
export function WeekOverview({
  rows, me, partner, selectedDay, onSelectDay, onPreviousWeek, onNextWeek,
  atCurrentWeek, onShowWeight,
}: {
  rows: WeekRow[];
  me: Member;
  partner: Member | null;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  atCurrentWeek: boolean;
  onShowWeight: () => void;
}) {
  const week = weekAtAGlance(rows);
  const selected = rows.find(row => row.d === selectedDay) ?? rows[rows.length - 1];
  const start = rows[0]?.d;
  const end = rows[rows.length - 1]?.d;
  const short = (day: string) => parseLocalDate(day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const rangeLabel = start && end
    ? `${short(start)} – ${short(end)}, ${parseLocalDate(end).getFullYear()}`
    : "Seven-day overview";

  const maxLogged = Math.max(0, ...rows.flatMap(row => [
    row.mine.count > 0 ? row.mine.calories : 0,
    partner && row.theirs.count > 0 ? row.theirs.calories : 0,
  ]));
  // Tick spacing always reflects real displayed values; no fixed 3,000-kcal scale.
  const scale = Math.max(500, Math.ceil(maxLogged / 500) * 500);
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="space-y-5" aria-label="Weekly nutrition overview">
      <div className="flex items-center justify-between gap-2" role="group" aria-label="Navigate weeks">
        <button type="button" onClick={onPreviousWeek} aria-label="Previous week"
          className="flex size-11 items-center justify-center rounded-xl border border-border text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <span className="num text-sm font-semibold text-foreground" aria-live="polite">{rangeLabel}</span>
        <button type="button" onClick={onNextWeek} disabled={atCurrentWeek} aria-label="Next week"
          className="flex size-11 items-center justify-center rounded-xl border border-border text-foreground disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <section aria-label="Daily calories recorded this week">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-primary" />You</span>
          {partner && (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-[3px] bg-partner" />
              <span className="max-w-24 truncate">{partner.display_name}</span>
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">Recorded calories (kcal)</span>
        </div>
        <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-1">
          <div className="flex h-44 flex-col justify-between pb-5 text-right">
            {ticks.map(value => (
              <span key={value} className="num pr-1 text-[10px] leading-none text-muted-foreground">
                {fmt(Math.round(scale * value))}
              </span>
            ))}
          </div>
          <div className="relative h-44">
            <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between" aria-hidden="true">
              {ticks.map(value => <div key={value} className="border-t border-border/70" />)}
            </div>
            <div className="relative z-10 grid h-full grid-cols-7 gap-0.5 sm:gap-1">
              {rows.map(row => {
                const label = parseLocalDate(row.d).toLocaleDateString(undefined, {
                  weekday: "short", month: "short", day: "numeric",
                });
                const active = selected?.d === row.d;
                return (
                  <button key={row.d} type="button" aria-pressed={active}
                    onClick={() => onSelectDay(row.d)}
                    aria-label={`${label}: you ${row.mine.count ? fmt(row.mine.calories) + " kcal" : "not logged"}${partner ? ", " + partner.display_name + " " + (row.theirs.count ? fmt(row.theirs.calories) + " kcal" : "not logged") : ""}`}
                    className={cn("relative flex h-full min-w-0 flex-col items-center justify-end rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active && "bg-primary/5")}>
                    <div className="flex h-[calc(100%-20px)] w-full items-end justify-center gap-[2px] px-0.5">
                      {row.mine.count > 0 && (
                        <span className="w-2 max-w-[38%] rounded-t-sm bg-primary"
                          style={{height:`${Math.max(2, row.mine.calories / scale * 100)}%`}}
                          aria-hidden="true"/>
                      )}
                      {partner && row.theirs.count > 0 && (
                        <span className="w-2 max-w-[38%] rounded-t-sm bg-partner"
                          style={{height:`${Math.max(2, row.theirs.calories / scale * 100)}%`}}
                          aria-hidden="true"/>
                      )}
                    </div>
                    <span className={cn("flex h-5 items-center justify-center text-[10px]",
                      active ? "font-semibold text-primary" : "text-muted-foreground")}>
                      {parseLocalDate(row.d).toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {selected && (
        <section aria-label="Selected day nutrition" className="space-y-3">
          <h2 className="font-display text-[1.3rem] font-normal text-foreground">
            {parseLocalDate(selected.d).toLocaleDateString(undefined, {
              weekday: "long", month: "short", day: "numeric",
            })}
          </h2>
          <div className="divide-y divide-border/70 rounded-2xl border border-border bg-card/60 px-3">
            {[
              { id: "you", name: "You", member: me, total: selected.mine },
              ...(partner ? [{ id: "partner", name: partner.display_name, member: partner, total: selected.theirs }] : []),
            ].map(person => {
              const calorieGoal = Number(person.member.daily_calorie_target ?? 0);
              return (
                <div key={person.id} className="flex min-h-15 items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", person.id === "you" ? "bg-primary" : "bg-partner")} />
                    <span className="truncate text-sm font-semibold text-foreground">{person.name}</span>
                  </div>
                  <div className="min-w-0 shrink-0 text-right">
                    {person.total.count > 0 ? (
                      <>
                        <p className="num text-sm font-semibold text-foreground">{fmt(person.total.calories)} kcal</p>
                        <p className="num text-xs text-muted-foreground">
                          {calorieGoal > 0 ? `Goal: ${fmt(calorieGoal)} kcal` : "No calorie goal"}
                        </p>
                      </>
                    ) : <p className="text-sm text-muted-foreground">Not logged</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-accent/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            Not logged does not mean 0 kcal. It means no food was recorded for this day.
          </p>
        </section>
      )}

      <section className="grid grid-cols-2 divide-x divide-border border-t border-border pt-4" aria-label="Weekly logging summary">
        <div className="pr-3">
          <p className="text-xs leading-snug text-muted-foreground">
            {partner ? "Days both logged" : "Days you logged"}
          </p>
          <p className="num mt-1 text-xl font-semibold text-foreground">
            {partner ? week.bothLogged : week.mineLoggedDays} <span className="text-sm font-normal text-muted-foreground">/ 7</span>
          </p>
        </div>
        <div className="pl-3">
          <p className="text-xs leading-snug text-muted-foreground">Your logged-day average</p>
          <p className="num mt-1 text-xl font-semibold text-foreground">
            {week.mineLoggedDayAverage === null ? "—" : fmt(week.mineLoggedDayAverage)}
            {week.mineLoggedDayAverage !== null && <span className="ml-1 text-xs font-normal">kcal</span>}
          </p>
          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">Recorded days only, not estimated intake</p>
        </div>
      </section>
      <button type="button" onClick={onShowWeight}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3 text-left text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="flex items-center gap-2"><TrendingUp className="size-4 text-primary" aria-hidden="true" />View weight trend</span>
        <ChevronRight className="size-4 text-primary" aria-hidden="true" />
      </button>
    </div>
  );
}
