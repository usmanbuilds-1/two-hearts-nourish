import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getRoomLifetimeStats } from "@/lib/room-stats.functions";
import { useSpace } from "@/lib/space";
import { coupleStats, fmt, milestones, parseLocalDate, totals, type Meal } from "@/lib/nutrition";
import { Btn, Screen } from "@/components/us/primitives";
import { coupleWeekDays, recentCoupleWeek, sharedRegularMeals } from "@/lib/couple-insights";
import { cn } from "@/lib/utils";
import { OurMilestones } from "@/components/us/OurMilestones";
import { quoteForDay } from "@/lib/quotes";

export const Route = createFileRoute("/_space/together")({
  head:()=>({meta:[
    {title:"Together — Us"},
    {name:"description",content:"A real look at the meals and days you share."},
  ]}),
  component:Together,
});

function DayPerson({label,meals,partner}:{label:string;meals:Meal[];partner?:boolean}) {
  const intake=totals(meals);
  return (
    <div className="min-w-0 py-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full",partner?"bg-partner":"bg-primary")} aria-hidden="true"/>
        <h3 className="truncate text-sm font-semibold">{label}</h3>
      </div>
      {meals.length?(
        <>
          <p className="num mt-3 text-xl font-semibold">{fmt(intake.calories)} <span className="text-sm font-normal text-muted-foreground">kcal</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{meals.length} {meals.length===1?"meal":"meals"} logged · {fmt(intake.protein)}g protein</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {meals.slice(0,3).map(meal=><li key={meal.id} className="truncate">{meal.food_name}</li>)}
            {meals.length>3&&<li className="text-xs text-muted-foreground">+{meals.length-3} more</li>}
          </ul>
        </>
      ):(
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">No meals logged on this date.</p>
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
  const chosen=week.find(d=>d.date===chosenDate)??week[week.length-1]!;
  const recap=partner?recentCoupleWeek(meals,me.id,partner.id,today):null;
  const sharedFoods=partner?sharedRegularMeals(meals,me.id,partner.id):[];
  const achieved=milestones(stats).filter(x=>x.achieved);
  const todayEntry=week[week.length-1]!;
  const bothToday=todayEntry.status==="both";
  const selectedLabel=parseLocalDate(chosen.date).toLocaleDateString(undefined,{
    weekday:"long",month:"short",day:"numeric"
  });

  return (
    <Screen>
      <header className="border-b border-border pb-5">
        <h1 className="font-display text-4xl font-normal leading-tight">Together</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{me.display_name}</span>
          {partner?<><span className="mx-2 text-primary">&amp;</span>
            <span className="font-medium text-foreground">{partner.display_name}</span></>:" · Your shared space"}
        </p>
        {room.shared_goal&&<p className="mt-4 font-display text-lg italic leading-relaxed">“{room.shared_goal}”</p>}
        <blockquote className="mt-5 border-l-2 border-primary/35 pl-4">
          <p className="font-display text-lg italic leading-relaxed text-foreground/90">“{quoteForDay(today)}”</p>
          <footer className="mt-2 text-xs text-muted-foreground">A little note for the two of you today</footer>
        </blockquote>
      </header>

      <OurMilestones
        roomId={room.id}
        meId={me.id}
        today={today}
        togetherSince={room.together_since}
        memberNames={{[me.id]:me.display_name,...(partner?{[partner.id]:partner.display_name}:{})}}
      />

      {!partner?(
        <section className="mt-7">
          <h2 className="font-display text-2xl font-normal">Invite your person</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Once your partner joins, this screen will show the meals and logging days you share. You'll each keep your own portions.
          </p>
          <Btn className="mt-5 w-full" onClick={()=>void navigator.clipboard.writeText(
            `${window.location.origin}/r/${room.room_code}`
          ).then(()=>toast.success("Invitation link copied"),()=>toast.error("Couldn't copy the invite."))}>
            Copy invitation link
          </Btn>
          <p className="mt-7 text-sm text-muted-foreground">You can keep logging your meals in <Link to="/today" className="font-medium text-primary underline-offset-2 hover:underline">Today</Link> in the meantime.</p>
        </section>
      ):(
        <>
          <section className="mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-normal">Your last seven days</h2>
              <span className="shrink-0 text-xs text-muted-foreground">{recap?.daysBoth??0} days both logged</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {bothToday?"You've both logged a meal today.":todayEntry.status==="you"?"You've logged today. Your partner hasn't yet.":todayEntry.status==="partner"?`${partner.display_name} has logged today.`:"Neither of you has logged today."}
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
                    className={cn("flex min-h-[66px] min-w-0 flex-col items-center justify-center rounded-xl border px-0.5 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      active?"border-primary bg-primary/10":"border-border hover:bg-secondary")}>
                    <span className="text-[11px] text-muted-foreground">{date.toLocaleDateString(undefined,{weekday:"short"}).slice(0,2)}</span>
                    <span className="num mt-1 text-sm font-semibold">{date.getDate()}</span>
                    <span aria-hidden="true" className={cn("mt-2 size-1.5 rounded-full",
                      day.status==="both"?"bg-primary":day.status==="partner"?"bg-partner":day.status==="you"?"bg-primary/60":"bg-muted-foreground/25")}/>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
              <span><span className="mr-1 inline-block size-2 rounded-full bg-primary"/>Both</span>
              <span><span className="mr-1 inline-block size-2 rounded-full bg-primary/60"/>You</span>
              <span><span className="mr-1 inline-block size-2 rounded-full bg-partner"/>Partner</span>
              <span><span className="mr-1 inline-block size-2 rounded-full bg-muted-foreground/25"/>Neither</span>
            </div>
          </section>

          <section className="mt-7" aria-label="Selected day meals">
            <div className="flex items-baseline justify-between border-b border-border pb-2">
              <h2 className="font-display text-xl font-normal">{chosen.date===today?"Today":selectedLabel}</h2>
              <span className="text-xs text-muted-foreground">Meals recorded</span>
            </div>
            <div className="grid grid-cols-1 divide-y divide-border min-[360px]:grid-cols-2 min-[360px]:divide-x min-[360px]:divide-y-0">
              <DayPerson label="You" meals={chosen.mine}/>
              <div className="min-[360px]:pl-5"><DayPerson label={partner.display_name} meals={chosen.theirs} partner/></div>
            </div>
            <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              Same date doesn't mean you ate together or at the same time. These are your separate meal logs.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-xl font-normal">Little things adding up</h2>
            <div className="mt-3 grid grid-cols-3 divide-x divide-border border-y border-border py-4 text-center">
              <div className="px-2"><p className="num text-xl font-semibold">{recap?.daysBoth??0}</p><p className="mt-1 text-xs text-muted-foreground">Days both logged this week</p></div>
              <div className="px-2"><p className="num text-xl font-semibold">{stats.streak}</p><p className="mt-1 text-xs text-muted-foreground">Current shared-day streak</p></div>
              <div className="px-2"><p className="num text-xl font-semibold">{stats.totalMeals}</p><p className="mt-1 text-xs text-muted-foreground">All meals logged here</p></div>
            </div>
            {recap&&recap.sharedDinnerDays>0&&<p className="mt-2 text-xs text-muted-foreground">{recap.sharedDinnerDays} {recap.sharedDinnerDays===1?"day":"days"} this week with dinner logs from both of you.</p>}
          </section>

          <section className="mt-8">
            <h2 className="font-display text-xl font-normal">Foods you both come back to</h2>
            {sharedFoods.length ? (
              <div className="mt-2 divide-y divide-border border-t border-border">
                {sharedFoods.map(food=>(
                  <div key={food.name} className="flex min-h-14 items-center justify-between gap-3 py-3">
                    <span className="min-w-0 truncate text-sm font-medium">{food.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{food.times} logs</span>
                  </div>
                ))}
              </div>
            ):(
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                You haven't both logged the same food name yet. Your everyday favourites will show up here when you do.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">These food names appear in both diaries; each person keeps their own portion and nutrition.</p>
          </section>

          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl font-normal">Milestones together</h2>
              <span className="text-xs text-muted-foreground">{achieved.length} reached</span>
            </div>
            <div className="mt-3 divide-y divide-border border-y border-border">
              {milestones(stats).map(m=>(
                <div key={m.title} className="flex min-h-14 items-center justify-between gap-4 py-3">
                  <span className={m.achieved?"text-sm font-medium text-foreground":"text-sm text-muted-foreground"}>
                    {m.title}
                  </span>
                  <span className={m.achieved?"text-xs font-semibold text-primary":"text-xs text-muted-foreground"}>
                    {m.achieved?"Reached":"Still ahead"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              These are calculated only from activity you both actually logged in this app.
            </p>
          </section>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Keep going at your own pace. <Link className="font-medium text-primary underline-offset-2 hover:underline" to="/today">Log your next meal</Link>
          </p>
        </>
      )}
    </Screen>
  );
}
