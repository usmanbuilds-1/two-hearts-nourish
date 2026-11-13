import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Star, Wallet, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useSpace } from "@/lib/space";
import { quickMealSuggestions, mealSignature } from "@/lib/quick-meals";
import { copyMealToDay, getQuickMeals, getFavoriteMeals, saveFavoriteMeal, removeFavoriteMeal, type MealFavorite } from "@/lib/meal-operations.functions";
import { getRoomLifetimeStats } from "@/lib/room-stats.functions";
import { MEAL_TYPES, coupleStats, fmt, totals, parseLocalDate, type Meal, type Member } from "@/lib/nutrition";
import { Btn, Screen } from "@/components/us/primitives";
import { MealSheet } from "@/components/us/MealSheet";
import { QuickMealsSheet } from "@/components/us/QuickMealsSheet";
import { ScanSheet } from "@/components/us/ScanSheet";
import { BudgetPlanSheet } from "@/components/us/BudgetPlanSheet";
import { WeightCard } from "@/components/us/WeightCard";
import { Lightbox } from "@/components/us/Lightbox";
import { PrivateMealPhoto } from "@/components/us/PrivateMealPhoto";
import { signedMealPhotoUrl } from "@/lib/private-photo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space/today")({
  head: () => ({ meta: [
    { title: "Today — Us" },
    { name: "description", content: "A shared place for your everyday meals." },
    { property: "og:title", content: "Today — Us" },
  ] }),
  component: Today,
});

/** A unified view of two independent nutrition targets. No target means no made-up percentage. */
function NutritionPerson({ name, member, meals, isPartner }: {
  name: string; member: Member | null; meals: Meal[]; isPartner?: boolean;
}) {
  const total = totals(meals);
  const kcalTarget = member?.daily_calorie_target ?? 0;
  const proteinTarget = Number(member?.daily_protein_target ?? 0);
  const progress = (value:number,target:number) => target>0 ? Math.max(0,Math.min(100,value/target*100)) : 0;
  return (
    <div className="min-w-0 py-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-1.5 shrink-0 rounded-full",isPartner?"bg-partner":"bg-primary")} aria-hidden="true" />
        <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
      </div>
      <div className="mt-3">
        <div className="flex flex-wrap items-baseline gap-x-1">
          <span className="num text-[clamp(1.5rem,6vw,2.1rem)] font-medium leading-none tracking-tight">{fmt(total.calories)}</span>
          <span className="text-[11px] text-muted-foreground">kcal</span>
        </div>
        {kcalTarget>0 ? (
          <>
            <p className="mt-1.5 text-[11px] text-muted-foreground">of {fmt(kcalTarget)} daily</p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary" role="progressbar"
              aria-label={name+" calorie progress"} aria-valuenow={Math.round(total.calories)} aria-valuemin={0}
              aria-valuemax={kcalTarget}>
              <div className={cn("h-full rounded-full",isPartner?"bg-partner":"bg-primary")}
                style={{width:progress(total.calories,kcalTarget)+"%"}}/>
            </div>
          </>
        ):<p className="mt-1.5 text-[11px] text-muted-foreground">No calorie target set</p>}
      </div>
      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="flex flex-wrap items-baseline gap-x-1">
          <span className="num text-lg font-medium">{fmt(total.protein)}g</span>
          <span className="text-xs text-muted-foreground">protein</span>
        </div>
        {proteinTarget>0 ? (
          <>
            <p className="mt-0.5 text-[11px] text-muted-foreground">of {fmt(proteinTarget)}g daily</p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary" role="progressbar"
              aria-label={name+" protein progress"} aria-valuenow={Math.round(total.protein)}
              aria-valuemin={0} aria-valuemax={proteinTarget}>
              <div className={cn("h-full rounded-full",isPartner?"bg-partner":"bg-primary")}
                style={{width:progress(total.protein,proteinTarget)+"%"}}/>
            </div>
          </>
        ):<p className="mt-0.5 text-[11px] text-muted-foreground">No protein target set</p>}
      </div>
    </div>
  );
}

function Today() {
  const { me, partner, meals, today, room, fresh, upsertLocal } = useSpace();
  const [scan, setScan] = useState(false);
  const [repeatId, setRepeatId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [sheet, setSheet] = useState<{open:boolean;meal:Meal|null}>({open:false,meal:null});
  const [budget, setBudget] = useState(false);
  const [lightbox, setLightbox] = useState<{src:string;caption:string}|null>(null);
  const qc = useQueryClient();

  const { data: favsData = [] } = useQuery<MealFavorite[]>({
    queryKey: ["meal-favorites",me.id],
    queryFn: () => getFavoriteMeals(),
  });
  const favNames = useMemo(
    () => new Set(favsData.map(f=>f.food_name.trim().toLowerCase())),
    [favsData],
  );

  async function toggleFavourite(meal:Meal) {
    const name=meal.food_name.trim();
    try {
      if(favNames.has(name.toLowerCase())) {
        await removeFavoriteMeal({data:{foodName:name}});
        toast("Removed from saved meals");
      }else{
        await saveFavoriteMeal({data:{
          foodName:name,servingDescription:meal.serving_description??"",
          calories:meal.calories,protein:Number(meal.protein),carbs:Number(meal.carbs),fat:Number(meal.fat),
        }});
        toast.success("Saved for next time");
      }
      await qc.invalidateQueries({queryKey:["meal-favorites",me.id]});
    }catch{toast.error("Couldn't update your saved meals.");}
  }

  const quick=useQuery<Meal[]>({
    queryKey:["quick-meals",me.id,today],
    queryFn:()=>getQuickMeals({data:{clientDate:today}}),
    staleTime:0,
    refetchOnMount:"always",
    refetchOnWindowFocus:true,
  });
  const suggestions=useMemo(
    ()=>quickMealSuggestions(quick.data??[],me.id,today),
    [quick.data,me.id,today],
  );
  const quickOptions=useMemo(()=>{
    const seen=new Set<string>();
    return [suggestions.latest,...suggestions.suggested]
      .filter((meal):meal is Meal=>Boolean(meal))
      .filter(meal=>{
        const signature=mealSignature(meal);
        if(seen.has(signature))return false;
        seen.add(signature);
        return true;
      }).slice(0,2);
  },[suggestions]);

  async function repeatMeal(meal:Meal) {
    if(repeatId)return;
    setRepeatId(meal.id);
    try {
      const result=await copyMealToDay({data:{mealId:meal.id,targetDate:today}});
      upsertLocal(result.meal);
      await qc.invalidateQueries({queryKey:["quick-meals",me.id]});
      toast.success(meal.food_name+" logged with your previous portion");
      setQuickOpen(false);
    }catch{toast.error("Couldn't log that meal. Try again when connected.");}
    finally{setRepeatId(null);}
  }

  const todays=useMemo(()=>meals.filter(m=>m.meal_date===today),[meals,today]);
  const eaten=todays.filter(m=>!m.is_planned);
  const mine=eaten.filter(m=>m.member_id===me.id);
  const theirs=partner?eaten.filter(m=>m.member_id===partner.id):[];
  const stats=useMemo(()=>coupleStats(meals,me,partner,today),[meals,me,partner,today]);
  const {data:lifetime}=useQuery({
    queryKey:["room-life-stats",room.id,today],
    queryFn:()=>getRoomLifetimeStats({data:{clientDate:today}}),
    staleTime:120_000,
  });
  const sharedStreak=lifetime?.streak??stats.streak;
  const bothToday=stats.bothDays.has(today);
  const dateText=parseLocalDate(today).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});

  return (
    <Screen className="today-ritual">
      <header className="pb-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold lowercase tracking-[-0.04em] text-primary">us.</p>
          <time dateTime={today} className="text-xs font-medium text-muted-foreground">{dateText}</time>
        </div>
        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Our everyday ritual</p>
        <h1 className="mt-2 font-display text-[clamp(2.15rem,9vw,3.15rem)] font-normal leading-[1.05] tracking-tight">
          Today, together.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{me.display_name}</span>
          <span className="mx-2 text-primary" aria-hidden="true">·</span>
          <span className="font-medium text-foreground">{partner?.display_name??"Your person"}</span>
          <span className="mx-2 text-border" aria-hidden="true">/</span>
          {room.couple_message ? <span className="italic">{room.couple_message}</span>
            : partner ? bothToday ? "Another day you both showed up." : "A little care, every day."
              : "A place to look after yourselves."}
        </p>
        {partner&&sharedStreak>=2&&(
          <p className="mt-2 text-xs text-primary">{sharedStreak} days logging side by side</p>
        )}
      </header>

      <section className="border-y border-border" aria-label="Your shared nutrition today">
        <div className="flex items-baseline justify-between gap-3 pt-4">
          <h2 className="font-display text-xl">The two of you</h2>
          <span className="text-[11px] text-muted-foreground">Today's intake</span>
        </div>
        <div className="grid grid-cols-2 gap-x-6">
          <NutritionPerson name="You" member={me} meals={mine}/>
          <div className="relative pl-5 before:absolute before:inset-y-4 before:left-0 before:w-px before:bg-border">
            <NutritionPerson name={partner?.display_name??"Your person"} member={partner} meals={theirs} isPartner/>
          </div>
        </div>
        {!partner&&(
          <div className="mb-4 border-t border-border/70 pt-3">
            <p className="text-xs text-muted-foreground">Your person hasn't joined this space yet.</p>
            <button type="button" className="mt-1 min-h-10 text-sm font-medium text-primary underline-offset-2 hover:underline"
              onClick={()=>void navigator.clipboard.writeText(window.location.origin+"/r/"+room.room_code)
                .then(()=>toast.success("Invitation copied"),()=>toast.error("Couldn't copy invitation"))}>
              Copy invitation
            </button>
          </div>
        )}
      </section>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn size="lg" className="w-full rounded-xl" onClick={()=>setScan(true)}>
          <Camera className="size-4" aria-hidden="true"/> Scan food
        </Btn>
        <Btn size="lg" variant="outline" className="w-full rounded-xl" onClick={()=>setSheet({open:true,meal:null})}>
          <Plus className="size-4" aria-hidden="true"/> Add manually
        </Btn>
      </div>
      <button type="button" onClick={()=>{
        if(!me.daily_calorie_target){toast("Set a calorie target in Settings to use planning.");return;}
        setBudget(true);
      }} className="mt-2 flex min-h-10 items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
        <Wallet className="size-3.5" aria-hidden="true"/> Plan a meal
        <ArrowRight className="size-3.5" aria-hidden="true"/>
      </button>

      <section className="mt-7" aria-label="Repeat your meals">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Made familiar</p>
            <h2 className="mt-1 font-display text-[1.55rem] leading-tight">Meals you know by heart</h2>
          </div>
          <button type="button" onClick={()=>setQuickOpen(true)}
            className="min-h-11 shrink-0 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring">See all</button>
        </div>
        {quick.isPending || (quick.isFetching&&!quick.data) ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">Finding your meals…</p>
        ):quick.isError ? (
          <div className="mt-3 flex items-center justify-between border-t border-border py-3">
            <p className="text-sm text-muted-foreground">Your saved meals couldn't refresh.</p>
            <Btn variant="outline" onClick={()=>void quick.refetch()}>Retry</Btn>
          </div>
        ):quickOptions.length>0 ? (
          <div className="mt-3 divide-y divide-border border-t border-border">
            {quickOptions.map((meal,index)=>(
              <div key={meal.id} className="flex min-h-[76px] items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  {index===0&&<p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {suggestions.latest?.id===meal.id?"Recently eaten":"Your familiar portion"}
                  </p>}
                  <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{meal.food_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {meal.serving_description?meal.serving_description+" · ":""}{fmt(meal.calories)} kcal
                  </p>
                </div>
                <Btn variant="outline" className="shrink-0 rounded-lg px-4" disabled={Boolean(repeatId)}
                  onClick={()=>void repeatMeal(meal)}>
                  {repeatId===meal.id?"Adding…":"Log again"}
                </Btn>
              </div>
            ))}
          </div>
        ):(
          <button type="button" onClick={()=>setQuickOpen(true)}
            className="mt-3 min-h-14 w-full border-y border-border text-left text-sm text-primary">
            Log a meal once and it will be here next time. Browse history
          </button>
        )}
      </section>

      <section className="mt-8" aria-label="Today's meal diary">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Today's diary</p>
            <h2 className="mt-1 font-display text-[1.55rem] leading-tight">The little food story</h2>
          </div>
          <span className="text-xs text-muted-foreground">{eaten.length} {eaten.length===1?"entry":"entries"}</span>
        </div>
        {todays.length===0 ? (
          <div className="py-8">
            <p className="font-display text-xl">Your first meal can start here.</p>
            <p className="mt-1 text-sm text-muted-foreground">Nothing logged yet today. No rush.</p>
            <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-primary"
              onClick={()=>setSheet({open:true,meal:null})}>Add your first meal</button>
          </div>
        ):MEAL_TYPES.map(type=>{
          const items=todays.filter(m=>m.meal_type===type.key);
          return (
            <div key={type.key} className="border-b border-border/75 py-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{type.label}</h3>
                {items.length===0&&<span className="text-[11px] text-muted-foreground/75">Nothing logged</span>}
              </div>
              {items.length>0&&(
                <div className="mt-1 divide-y divide-border/65">
                  {items.map(m=>{
                    const isMe=m.member_id===me.id;
                    const favourite=favNames.has(m.food_name.trim().toLowerCase());
                    return (
                      <div key={m.id} className={cn("flex min-h-16 items-center gap-3 py-2",fresh.has(m.id)&&"animate-arrive")}>
                        {m.photo_url ? (
                          <button type="button" className="size-11 shrink-0 overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={()=>void signedMealPhotoUrl(m.photo_url!,room.id).then(url=>{
                              if(url)setLightbox({src:url,caption:m.food_name+" · "+fmt(m.calories)+" kcal"});
                              else toast.error("This photo is unavailable.");
                            })} aria-label={"View photo for "+m.food_name}>
                            <PrivateMealPhoto stored={m.photo_url} roomId={room.id} className="size-11 object-cover"/>
                          </button>
                        ):<span className={cn("size-1.5 shrink-0 rounded-full",isMe?"bg-primary":"bg-partner")} aria-hidden="true"/>}
                        <button type="button" onClick={()=>setSheet({open:true,meal:m})}
                          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 text-left focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={"Open "+m.food_name+" details"}>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{m.food_name}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {isMe?"You":partner?.display_name??"Partner"}{m.is_planned?" · Planned, not eaten":""}
                              {m.serving_description?" · "+m.serving_description:""}
                            </span>
                          </span>
                          <span className="num shrink-0 text-sm text-foreground">{fmt(m.calories)} <span className="text-[11px] text-muted-foreground">kcal</span></span>
                        </button>
                        {isMe&&(
                          <button type="button" onClick={()=>void toggleFavourite(m)}
                            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={favourite?"Remove "+m.food_name+" from saved meals":"Save "+m.food_name+" for later"}>
                            <Star className={cn("size-4",favourite&&"fill-primary text-primary")} aria-hidden="true"/>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <div className="mt-7"><WeightCard/></div>
      <QuickMealsSheet open={quickOpen} onOpenChange={setQuickOpen} meals={quick.data??[]}
        memberId={me.id} today={today} onCopy={repeatMeal} busyId={repeatId}/>
      {lightbox&&<Lightbox src={lightbox.src} caption={lightbox.caption} onClose={()=>setLightbox(null)}/>}
      <ScanSheet open={scan} onOpenChange={setScan} onManual={()=>setSheet({open:true,meal:null})}/>
      <MealSheet open={sheet.open} meal={sheet.meal} onOpenChange={open=>setSheet(prev=>({...prev,open}))}/>
      <BudgetPlanSheet open={budget} onOpenChange={setBudget} me={me}/>
    </Screen>
  );
}
