import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getRoomLifetimeStats } from "@/lib/room-stats.functions";
import { useSpace } from "@/lib/space";
import { coupleStats, daysBetween, fmt, milestones, parseLocalDate, totals, type Meal } from "@/lib/nutrition";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { coupleWeekDays, recentCoupleWeek, sharedRegularMeals } from "@/lib/couple-insights";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space/together")({
  head:()=>({meta:[
    {title:"Together — Us"},
    {name:"description",content:"Your shared rhythm, milestones and everyday meals."},
  ]}),
  component:Together,
});

function SharedMetric({label,value,detail}:{label:string;value:string|number;detail:string}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="num mt-2 text-3xl font-semibold leading-none">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function DayCard({label,meals,partner}:{label:string;meals:Meal[];partner?:boolean}) {
  const intake=totals(meals);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full",partner?"bg-partner":"bg-primary")} aria-hidden="true"/>
        <h3 className="truncate text-sm font-semibold">{label}</h3>
      </div>
      {meals.length?(
        <>
          <p className="num mt-3 text-xl font-semibold">{fmt(intake.calories)} <span className="text-sm font-normal text-muted-foreground">kcal</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{fmt(intake.protein)}g protein · {meals.length} {meals.length===1?"meal":"meals"}</p>
          <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
            {meals.slice(0,3).map(meal=><li key={meal.id} className="truncate">{meal.food_name}</li>)}
            {meals.length>3&&<li className="text-xs text-muted-foreground">+{meals.length-3} more</li>}
          </ul>
        </>
      ):(
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Nothing logged on this date.</p>
      )}
    </div>
  );
}

function Together(){
  const {me,partner,meals,today,room}=useSpace();
  const [chosenDate,setChosenDate]=useState(today);

  const recent=useMemo(()=>coupleStats(meals,me,partner,today),[meals,me,partner,today]);
  const {data:lifetime}=useQuery({
    queryKey:["room-life-stats",room.id,today],
    queryFn:()=>getRoomLifetimeStats({data:{clientDate:today}}),
    staleTime:120_000,
  });
  const stats=lifetime?{...recent,...lifetime}:recent;
  const week=useMemo(()=>coupleWeekDays(meals,me.id,partner?.id??null,today),[meals,me.id,partner?.id,today]);
  const chosen=week.find(day=>day.date===chosenDate)??week[week.length-1]!;
  const recap=partner?recentCoupleWeek(meals,me.id,partner.id,today):null;
  const sharedFoods=partner?sharedRegularMeals(meals,me.id,partner.id):[];
  const allMilestones=milestones(stats);
  const reached=allMilestones.filter(item=>item.achieved).length;
  const todayEntry=week[week.length-1]!;
  const togetherDays=Math.max(0,room.together_since
    ? daysBetween(room.together_since,today)
    : daysBetween(room.created_at.slice(0,10),today)+1);
  const selectedLabel=parseLocalDate(chosen.date).toLocaleDateString(undefined,{
    weekday:"long",month:"short",day:"numeric"
  });

  return (
    <Screen>
      <header className="border-b border-border pb-5">
        <p className="text-xs font-medium text-muted-foreground">Your shared space</p>
        <h1 className="mt-2 font-display text-4xl font-normal leading-tight tracking-tight">Together</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{me.display_name}</span>
          <span aria-hidden="true" className="text-primary">♡</span>
          <span className="font-medium text-foreground">{partner?.display_name??"Your person"}</span>
        </div>
        {room.shared_goal&&<p className="mt-3 font-display text-base italic leading-relaxed text-foreground/80">“{room.shared_goal}”</p>}
      </header>

      {!partner?(
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-2xl font-normal">Invite your person</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Once they join, this page will show your shared rhythm, milestones and the foods that appear in both diaries.
          </p>
          <Btn className="mt-5 w-full" onClick={()=>void navigator.clipboard.writeText(
            `${window.location.origin}/r/${room.room_code}`
          ).then(()=>toast.success("Invitation link copied"),()=>toast.error("Couldn't copy the invite."))}>
            Copy invitation link
          </Btn>
          <p className="mt-4 text-sm text-muted-foreground">
            You can keep logging in <Link to="/today" className="font-medium text-primary underline-offset-2 hover:underline">Today</Link>.
          </p>
        </section>
      ):(
        <>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <SharedMetric
              label={room.together_since?"Days together":"Days in this space"}
              value={togetherDays}
              detail={room.together_since?"From the date you saved in Settings.":"Since this shared space was created."}
            />
            <SharedMetric
              label="Shared streak"
              value={stats.streak}
              detail="Consecutive days with meal logs from both of you."
            />
          </div>

          <section className="mt-7 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <Eyebrow>This week</Eyebrow>
                <h2 className="mt-1 font-display text-2xl font-normal">Seven days, side by side</h2>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{recap?.daysBoth??0}/7 both logged</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {todayEntry.status==="both"?"You've both logged today."
                :todayEntry.status==="you"?"You've logged today."
                :todayEntry.status==="partner"?`${partner.display_name} has logged today.`
                :"Neither of you has logged today yet."}
            </p>

            <div className="mt-4 grid grid-cols-7 gap-1.5" role="group" aria-label="Choose a day to view both meal diaries">
              {week.map(day=>{
                const date=parseLocalDate(day.date);
                const label=date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
                const status=day.status==="both"?"Both logged":day.status==="you"?"Only you logged":day.status==="partner"?"Only your partner logged":"Neither logged";
                const active=day.date===chosen.date;
                return (
                  <button key={day.date} type="button" aria-pressed={active}
                    aria-label={`${label}: ${status}. View meals.`}
                    onClick={()=>setChosenDate(day.date)}
                    className={cn(
                      "flex min-h-[66px] min-w-0 flex-col items-center justify-center rounded-xl border px-0.5 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      active?"border-primary bg-primary/10":"border-border bg-background hover:bg-secondary"
                    )}>
                    <span className="text-[11px] text-muted-foreground">{date.toLocaleDateString(undefined,{weekday:"short"}).slice(0,2)}</span>
                    <span className="num mt-1 text-sm font-semibold">{date.getDate()}</span>
                    <span aria-hidden="true" className={cn("mt-2 size-1.5 rounded-full",
                      day.status==="both"?"bg-primary":day.status==="partner"?"bg-partner":day.status==="you"?"bg-primary/60":"bg-muted-foreground/25")}/>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-4 text-center">
              <div className="px-2">
                <p className="num text-lg font-semibold">{recap?.daysBoth??0}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Days both logged</p>
              </div>
              <div className="px-2">
                <p className="num text-lg font-semibold">{recap?.sharedDinnerDays??0}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Dinner-log days</p>
              </div>
              <div className="px-2">
                <p className="num text-lg font-semibold">{stats.totalMeals}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Meals logged here</p>
              </div>
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-normal">{chosen.date===today?"Today":selectedLabel}</h2>
              <span className="text-xs text-muted-foreground">Your separate logs</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <DayCard label="You" meals={chosen.mine}/>
              <DayCard label={partner.display_name} meals={chosen.theirs} partner/>
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-normal">Milestones together</h2>
              <span className="text-xs text-muted-foreground">{reached}/{allMilestones.length} reached</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
              {allMilestones.map((item,index)=>(
                <div key={item.title} className={cn("flex min-h-16 items-center gap-3 px-4 py-3",index>0&&"border-t border-border")}>
                  <span className="text-lg" aria-hidden="true">{item.icon}</span>
                  <span className={cn("min-w-0 flex-1 text-sm",item.achieved?"font-medium":"text-muted-foreground")}>{item.title}</span>
                  <span className={cn("shrink-0 text-xs font-medium",item.achieved?"text-primary":"text-muted-foreground")}>
                    {item.achieved?"Reached":"Ahead"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-2xl font-normal">Foods you both come back to</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
              {sharedFoods.length?sharedFoods.map((food,index)=>(
                <div key={food.name} className={cn("flex min-h-14 items-center justify-between gap-3 px-4 py-3",index>0&&"border-t border-border")}>
                  <span className="min-w-0 truncate text-sm font-medium">{food.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{food.times} logs</span>
                </div>
              )):(
                <p className="p-4 text-sm leading-relaxed text-muted-foreground">
                  When the same food starts appearing in both diaries, it will show up here.
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Each of you still keeps your own portion and nutrition values.</p>
          </section>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Link className="font-medium text-primary underline-offset-2 hover:underline" to="/today">Back to today's meals</Link>
          </p>
        </>
      )}
    </Screen>
  );
}
