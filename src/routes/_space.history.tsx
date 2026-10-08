import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSpace } from "@/lib/space";
import { addDays, fmt, parseLocalDate, totals } from "@/lib/nutrition";
import { Eyebrow, Screen } from "@/components/us/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space/history")({
  head: () => ({ meta: [{ title: "History — Us" }, { name: "description", content: "Your last 30 days at a glance." }] }),
  component: History,
});

function History() {
  const { me, partner, meals, today } = useSpace();
  const [selected, setSelected] = useState<string | null>(null);

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
      <h1 className="text-3xl">History ❤️</h1>
      <p className="mt-1 text-muted-foreground">Your last 30 days at a glance.</p>

      <div className="mt-6 grid grid-cols-6 gap-1.5">
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
                  status === "both" ? "bg-primary" :
                  status === "one" ? "bg-partner" :
                  "bg-border",
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-primary" /> Both on track</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-partner" /> One logged</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-border" /> Nothing logged</span>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
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
                  <div className="mb-2 text-xs font-medium text-primary">You · {fmt(selectedDay.myT.calories)} kcal · {fmt(selectedDay.myT.protein)}g protein</div>
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
                  <div className="mb-2 text-xs font-medium text-partner">{partner.display_name} · {fmt(selectedDay.theirT.calories)} kcal · {fmt(selectedDay.theirT.protein)}g protein</div>
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
    </Screen>
  );
}
