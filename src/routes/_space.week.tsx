import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSpace } from "@/lib/space";
import { addDays, fmt, parseLocalDate, totals } from "@/lib/nutrition";
import { Eyebrow, Screen } from "@/components/us/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space/week")({
  head: () => ({
    meta: [
      { title: "Our Week & History — Us" },
      { name: "description", content: "The last 7 days and 30 days history, together." },
      { property: "og:title", content: "Our Week & History — Us" },
    ],
  }),
  component: WeekAndHistory,
});

export function WeekAndHistory() {
  const { me, partner, meals, today } = useSpace();
  const [selected, setSelected] = useState<string | null>(null);

  // 7 days data
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today]);
  const rows = days.map((d) => {
    const mine = meals.filter((m) => m.meal_date === d && m.member_id === me.id);
    const theirs = partner ? meals.filter((m) => m.meal_date === d && m.member_id === partner.id) : [];
    return { d, mine: totals(mine), theirs: totals(theirs) };
  });

  const avg = (sel: (r: (typeof rows)[number]) => { calories: number; protein: number; count: number }) => {
    const logged = rows.map(sel).filter((t) => t.count > 0);
    return logged.length
      ? {
          kcal: logged.reduce((a, t) => a + t.calories, 0) / logged.length,
          p: logged.reduce((a, t) => a + t.protein, 0) / logged.length,
          n: logged.reduce((a, t) => a + t.count, 0),
        }
      : { kcal: 0, p: 0, n: 0 };
  };

  const a1 = avg((r) => r.mine);
  const a2 = avg((r) => r.theirs);
  const both = rows.filter((r) => r.mine.count && r.theirs.count).length;
  const max = Math.max(1, ...rows.flatMap((r) => [r.mine.calories, r.theirs.calories]));

  const targetPct =
    me.daily_calorie_target && max > 0
      ? Math.min(100, Math.max(0, (me.daily_calorie_target / max) * 100))
      : null;

  const myProteinTarget = Number(me.daily_protein_target ?? 0);
  const theirProteinTarget = Number(partner?.daily_protein_target ?? 0);

  // 30 days data
  const last30 = useMemo(
    () => Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)),
    [today],
  );

  const dayData = useMemo(() => {
    return last30.map((d) => {
      const mine = meals.filter((m) => m.meal_date === d && m.member_id === me.id);
      const theirs = partner ? meals.filter((m) => m.meal_date === d && m.member_id === partner.id) : [];
      const myLogged = mine.length > 0;
      const theirLogged = theirs.length > 0;
      const myT = totals(mine);
      const theirT = totals(theirs);
      const myHit = me.daily_calorie_target
        ? myT.calories >= me.daily_calorie_target * 0.85
        : myLogged;
      const theirHit = partner?.daily_calorie_target
        ? theirT.calories >= partner.daily_calorie_target * 0.85
        : theirLogged;

      let status: "both" | "one" | "empty";
      if (myLogged && theirLogged && myHit && theirHit) status = "both";
      else if (myLogged || theirLogged) status = "one";
      else status = "empty";

      return { d, mine, theirs, myT, theirT, status };
    });
  }, [last30, meals, me, partner]);

  const selectedDay = selected ? dayData.find((d) => d.d === selected) : null;

  return (
    <Screen>
      <div className="space-y-8">
        {/* SECTION 1: OUR WEEK */}
        <section className="space-y-4">
          <div>
            <h1 className="text-3xl">Our Week ❤️</h1>
            <p className="mt-1 text-muted-foreground">{both} of 7 days you both logged meals.</p>
          </div>

          {/* Calorie chart with target line */}
          <div className="relative flex h-40 items-end gap-2 rounded-2xl border border-border bg-card p-4">
            {rows.map((r) => (
              <div key={r.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 max-w-3 rounded-t bg-primary" style={{ height: `${(r.mine.calories / max) * 100}%` }} />
                  <div className="w-1/2 max-w-3 rounded-t bg-partner" style={{ height: `${(r.theirs.calories / max) * 100}%` }} />
                </div>
                <div className="text-[10px] uppercase text-muted-foreground">
                  {parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "short" })}
                </div>
              </div>
            ))}
            {targetPct !== null && (
              <div
                className="pointer-events-none absolute inset-x-4 border-t border-dashed border-primary/50"
                style={{ bottom: `calc(${targetPct}% + 1rem)` }}
              >
                <span className="absolute -top-4 right-0 text-[10px] text-primary/60">target</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([["You", a1, "text-primary"], [partner?.display_name ?? "Partner", a2, "text-partner"]] as const).map(([l, a, c]) => {
              const v = a as typeof a1;
              return (
                <div key={l as string} className="rounded-2xl border border-border bg-card p-4">
                  <Eyebrow className={c as string}>{l as string}</Eyebrow>
                  <div className="num mt-2 text-xl font-semibold">
                    {fmt(v.kcal)} <span className="text-sm font-normal text-muted-foreground">avg kcal</span>
                  </div>
                  <div className="num text-sm">{fmt(v.p)}g avg protein</div>
                  <div className="num text-xs text-muted-foreground">{v.n} meals logged</div>
                </div>
              );
            })}
          </div>

          {/* Protein progress strip */}
          <Eyebrow>Protein this week</Eyebrow>
          <div className="space-y-2">
            {rows.map((r) => {
              const myPct = myProteinTarget > 0 ? Math.min(100, (r.mine.protein / myProteinTarget) * 100) : 0;
              const theirPct = theirProteinTarget > 0 ? Math.min(100, (r.theirs.protein / theirProteinTarget) * 100) : 0;
              return (
                <div key={r.d} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-[10px] uppercase text-muted-foreground">
                    {parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <div className="flex-1 space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${myPct}%` }} />
                    </div>
                    {partner && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-partner transition-all" style={{ width: `${theirPct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-primary" />
              You: {fmt(a1.p)}g avg{myProteinTarget > 0 ? ` · target ${fmt(myProteinTarget)}g` : ""}
            </span>
            {partner && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-partner" />
                {partner.display_name}: {fmt(a2.p)}g avg{theirProteinTarget > 0 ? ` · target ${fmt(theirProteinTarget)}g` : ""}
              </span>
            )}
          </div>
        </section>

        {/* SECTION 2: 30-DAY HISTORY */}
        <section className="space-y-4 pt-6 border-t border-border">
          <div>
            <h2 className="text-2xl font-bold">30-Day History</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your last 30 days at a glance. Tap any day to inspect meals.</p>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {dayData.map(({ d, status }) => {
              const isSelected = selected === d;
              const date = parseLocalDate(d);
              return (
                <button
                  key={d}
                  onClick={() => setSelected(isSelected ? null : d)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl p-2 transition-colors",
                    isSelected ? "bg-secondary ring-1 ring-primary" : "hover:bg-secondary/60",
                  )}
                >
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {date.getDate()}
                  </span>
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      status === "both" ? "bg-primary" : status === "one" ? "bg-partner" : "bg-border",
                    )}
                  />
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-primary" /> Both on track</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-partner" /> One logged</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-border" /> Nothing logged</span>
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <Eyebrow>
                {parseLocalDate(selectedDay.d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </Eyebrow>

              {selectedDay.mine.length === 0 && selectedDay.theirs.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nothing logged this day.</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {/* My meals */}
                  {selectedDay.mine.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium text-primary">
                        You · {fmt(selectedDay.myT.calories)} kcal · {fmt(selectedDay.myT.protein)}g protein
                      </div>
                      <div className="space-y-1.5">
                        {selectedDay.mine.map((m) => (
                          <div key={m.id} className="flex items-center justify-between text-sm">
                            <span className="truncate">{m.food_name}</span>
                            <span className="ml-4 shrink-0 num text-xs text-muted-foreground">{fmt(m.calories)} kcal</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Partner meals */}
                  {partner && selectedDay.theirs.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium text-partner">
                        {partner.display_name} · {fmt(selectedDay.theirT.calories)} kcal · {fmt(selectedDay.theirT.protein)}g protein
                      </div>
                      <div className="space-y-1.5">
                        {selectedDay.theirs.map((m) => (
                          <div key={m.id} className="flex items-center justify-between text-sm">
                            <span className="truncate">{m.food_name}</span>
                            <span className="ml-4 shrink-0 num text-xs text-muted-foreground">{fmt(m.calories)} kcal</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </Screen>
  );
}
