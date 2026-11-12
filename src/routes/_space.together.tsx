import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRoomLifetimeStats } from "@/lib/room-stats.functions";
import { useSpace } from "@/lib/space";
import { addDays, coupleStats, daysBetween, milestones } from "@/lib/nutrition";
import { Eyebrow, Screen } from "@/components/us/primitives";

import { recentCoupleWeek, sharedRegularMeals } from "@/lib/couple-insights";

export const Route = createFileRoute("/_space/together")({
  head: () => ({ meta: [{ title: "Together — Us" }, { name: "description", content: "Your shared milestones." }, { property: "og:title", content: "Together — Us" }, { property: "og:description", content: "Your shared milestones." }] }),
  component: Together,
});

function Together() {
  const { me, partner, meals, today, room } = useSpace();
  const recent = useMemo(() => coupleStats(meals, me, partner, today), [meals, me, partner, today]);
  const {data: lifetime} = useQuery({
    queryKey:["room-life-stats",room.id,today],
    queryFn:()=>getRoomLifetimeStats({data:{clientDate:today}}),
    staleTime:120_000,
  });
  const s = lifetime ? {...recent, ...lifetime} : recent;
  const recap = partner ? recentCoupleWeek(meals,me.id,partner.id,today) : null;
  const regulars = partner ? sharedRegularMeals(meals,me.id,partner.id) : [];
  const since = room.together_since ? daysBetween(room.together_since, today) : daysBetween(room.created_at.slice(0, 10), today) + 1;
  const timeline = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).flatMap((d, i) => {
    const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : `${i} days ago`;
    if (s.bothProteinDays.has(d)) return [{ label, text: "Both reached their protein goals" }];
    if (s.bothDays.has(d)) return [{ label, text: "Both of you logged meals" }];
    return [];
  });

  return (
    <Screen>
      <header className="border-b border-border pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">The two of us</p>
        <h1 className="mt-2 font-display text-4xl font-normal leading-tight">Our little journey.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{me.display_name} <span aria-hidden="true" className="px-1 text-primary">♡</span> {partner?.display_name??"Your person"}</p>
        {room.shared_goal&&<p className="mt-4 font-display text-lg italic text-foreground/80">“{room.shared_goal}”</p>}
      </header>
      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{room.together_since?"Days together":"Days in this space"}</p>
          <p className="num mt-1 font-display text-5xl font-normal">{Math.max(since,0)}</p>
        </div>
        <p className="max-w-[11rem] pb-1 text-right text-sm leading-relaxed text-muted-foreground">
          One meal, one ordinary day at a time.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-3 divide-x divide-border border-y border-border py-4 text-center">
        {[
          [s.totalMeals,"Meals logged"],
          [s.daysBoth,"Days together here"],
          [s.daysBothProtein,"Shared protein days"],
        ].map(([amount,label])=>(
          <div key={label} className="px-2">
            <div className="num font-display text-2xl">{amount}</div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {recap&&(
        <section className="mt-8 space-y-3">
          <Eyebrow>This week, side by side</Eyebrow>
          <p className="font-display text-xl leading-relaxed">
            {recap.daysBoth===0
              ?"Your next shared day is still ahead."
              :`You both logged meals on ${recap.daysBoth} of the past seven days.`}
          </p>
          {recap.sharedDinnerDays>0&&(
            <p className="text-sm text-muted-foreground">
              {recap.sharedDinnerDays} {recap.sharedDinnerDays===1?"day":"days"} with dinner logs from both of you.
            </p>
          )}
          <p className="text-xs text-muted-foreground">This means both of you logged meals that day, not that you ate the same meal or at the same time.</p>
        </section>
      )}
      {regulars.length>0&&(
        <section className="mt-8 space-y-2">
          <Eyebrow>Our familiar favourites</Eyebrow>
          {regulars.map(food=>(
            <div key={food.name} className="flex items-center justify-between gap-3 border-b border-border py-2">
              <span className="text-sm">{food.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{food.times} logs</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Each partner logs their own portion; your calorie estimates are never copied to theirs.</p>
        </section>
      )}
      <section className="mt-8">
        <Eyebrow>Little milestones</Eyebrow>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {milestones(s).map(m=>(
            <div key={m.title} className="flex min-h-12 items-center justify-between gap-4 py-3">
              <span className={m.achieved?"text-sm text-foreground":"text-sm text-muted-foreground"}>{m.title}</span>
              <span className={m.achieved?"text-xs font-medium text-primary":"text-xs text-muted-foreground"}>
                {m.achieved?"Remembered":"Ahead of us"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <Eyebrow>Lately</Eyebrow>
        {timeline.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Your shared moments will show up here.</p> : (
          <ol className="mt-3 space-y-3 border-l border-border pl-4">
            {timeline.map((t) => (
              <li key={t.label}><div className="text-xs text-muted-foreground">{t.label}</div><div className="text-sm">{t.text}</div></li>
            ))}
          </ol>
        )}
      </section>
    </Screen>
  );
}
