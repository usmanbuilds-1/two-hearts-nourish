import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { quickMealSuggestions, mealSignature } from "@/lib/quick-meals";
import { getQuickMeals } from "@/lib/meal-operations.functions";
import { QuickMealsSheet } from "@/components/us/QuickMealsSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Star, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useSpace } from "@/lib/space";
import { getRoomLifetimeStats } from "@/lib/room-stats.functions";
import { MEAL_TYPES, addDays, coupleStats, fmt, totals, type Meal, type Member } from "@/lib/nutrition";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { MealSheet, draftFromMeal } from "@/components/us/MealSheet";
import {
  getFavoriteMeals, saveFavoriteMeal, removeFavoriteMeal, type MealFavorite,
} from "@/lib/meal-operations.functions";
import { ScanSheet } from "@/components/us/ScanSheet";
import { BudgetPlanSheet } from "@/components/us/BudgetPlanSheet";

import { WeightCard } from "@/components/us/WeightCard";
import { Lightbox } from "@/components/us/Lightbox";
import { PrivateMealPhoto } from "@/components/us/PrivateMealPhoto";
import { signedMealPhotoUrl } from "@/lib/private-photo";
import { cn } from "@/lib/utils";
import { copyMealToDay } from "@/lib/meal-operations.functions";

export const Route = createFileRoute("/_space/today")({
  head: () => ({ meta: [{ title: "Today — Us" }, { name: "description", content: "Your shared day of meals." }, { property: "og:title", content: "Today — Us" }, { property: "og:description", content: "Your shared day of meals." }] }),
  component: Today,
});

function PersonCard({ label, member, meals, partner }: { label: string; member: Member | null; meals: Meal[]; partner?: boolean }) {
  const t = totals(meals);
  const kT = member?.daily_calorie_target ?? 0;
  const pT = Number(member?.daily_protein_target ?? 0);
  const bar = (v: number, max: number) => (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
      <div className={cn("h-full rounded-full transition-all", partner ? "bg-partner" : "bg-primary")} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Eyebrow className={partner ? "text-partner" : "text-primary"}>{label}</Eyebrow>
      <div className="num mt-2 text-2xl font-semibold">{fmt(t.calories)}{kT > 0 && <span className="text-sm font-normal text-muted-foreground"> / {fmt(kT)}</span>}<span className="text-sm font-normal text-muted-foreground"> kcal</span></div>
      {kT > 0 && bar(t.calories, kT)}
      <div className="num mt-3 text-sm">{fmt(t.protein)}{pT > 0 && <span className="text-muted-foreground"> / {fmt(pT)}</span>}g protein</div>
      {pT > 0 && bar(t.protein, pT)}
      <div className="num mt-2 text-xs text-muted-foreground">{fmt(t.carbs)}g carbs · {fmt(t.fat)}g fat</div>
    </div>
  );
}

function Today() {
  const { me, partner, meals, today, room, fresh, upsertLocal } = useSpace();
  const [scan, setScan] = useState(false);
  const [repeatId, setRepeatId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; meal: Meal | null }>({ open: false, meal: null });
  const [budget, setBudget] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const qc = useQueryClient();
  const { data: favsData = [] } = useQuery<MealFavorite[]>({
    queryKey: ["meal-favorites",me.id],
    queryFn: () => getFavoriteMeals(),
  });
  const favNames = useMemo(
    () => new Set(favsData.map((f) => f.food_name.trim().toLowerCase())),
    [favsData],
  );
  async function handleToggleFav(m: Meal) {
    const isFav = favNames.has(m.food_name.trim().toLowerCase());
    try {
      if (isFav) {
        await removeFavoriteMeal({ data: { foodName: m.food_name } });
        toast("Removed from favourites");
      } else {
        await saveFavoriteMeal({ data: {
          foodName: m.food_name,
          servingDescription: m.serving_description ?? "",
          calories: m.calories,
          protein: Number(m.protein),
          carbs: Number(m.carbs),
          fat: Number(m.fat),
        } });
        toast.success("Saved to favourites ⭐");
      }
      qc.invalidateQueries({ queryKey: ["meal-favorites"] });
    } catch {
      toast.error("Couldn't update favourites.");
    }
  }

  const quick = useQuery<Meal[]>({
    queryKey:["quick-meals",me.id,today],
    queryFn:()=>getQuickMeals({data:{clientDate:today}}),
    refetchOnMount:"always",
    refetchOnWindowFocus:true,
    staleTime:0,
  });
  const quickPicks = useMemo(()=>
    quickMealSuggestions(quick.data??[],me.id,today),
    [quick.data,me.id,today]
  );
  const shownSuggestions=quickPicks.suggested
    .filter(meal=>!quickPicks.latest||mealSignature(meal)!==mealSignature(quickPicks.latest))
    .slice(0,2);
  const repeatCounts=new Map(quickPicks.usuals.map(x=>[mealSignature(x.meal),x.times]));

  async function repeatMeal(meal:Meal) {
    if(repeatId)return;
    setRepeatId(meal.id);
    try {
      const result=await copyMealToDay({data:{mealId:meal.id,targetDate:today}});
      upsertLocal(result.meal);
      await qc.invalidateQueries({queryKey:["quick-meals",me.id]});
      toast.success(`${meal.food_name} added using the same portion`);
      setQuickOpen(false);
    }catch{
      toast.error("Couldn't repeat that meal. Check your connection and try again.");
    }finally{setRepeatId(null);}
  }
  const todays = useMemo(() => meals.filter((m) => m.meal_date === today), [meals, today]);
  const mine = todays.filter((m) => m.member_id === me.id && !m.is_planned);
  const theirs = partner ? todays.filter((m) => m.member_id === partner.id && !m.is_planned) : [];
  const stats = useMemo(() => coupleStats(meals, me, partner, today), [meals, me, partner, today]);
  const {data:lifetime}=useQuery({
    queryKey:["room-life-stats",room.id,today],
    queryFn:()=>getRoomLifetimeStats({data:{clientDate:today}}),
    staleTime:120_000,
  });
  const sharedStreak=lifetime?.streak??stats.streak;
  const bothLoggedToday = stats.bothDays.has(today);

  return (
    <Screen>
      <header className="border-b border-border pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Two hearts, one table</p>
        <h1 className="mt-2 font-display text-4xl font-normal leading-tight tracking-tight">Today, together.</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{me.display_name}</span>
          <span aria-hidden="true" className="text-primary">♡</span>
          <span className="font-medium text-foreground">{partner?.display_name ?? "Your person"}</span>
        </div>
        {room.couple_message ? (
          <p className="mt-3 font-display text-base italic text-foreground/80">“{room.couple_message}”</p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {bothLoggedToday?"You've both added to today's little food story.":"Your everyday meals, remembered for you."}
          </p>
        )}
        {sharedStreak >= 2 && (
          <p className="mt-2 text-xs text-primary">{sharedStreak} days of logging together</p>
        )}
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <PersonCard label="You" member={me} meals={mine} />
        <PersonCard label={partner?.display_name ?? "Partner"} member={partner} meals={theirs} partner />
      </div>

      {!partner&&(
        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="font-medium">Invite your person</p>
          <p className="mt-1 text-sm text-muted-foreground">Share your private room link so you can log meals together.</p>
          <Btn variant="outline" className="mt-3 w-full" onClick={()=>void navigator.clipboard.writeText(
            `${window.location.origin}/r/${room.room_code}`
          ).then(()=>toast.success("Invitation copied"),()=>toast.error("Couldn't copy the invite."))}>
            Copy invitation link
          </Btn>
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Btn size="lg" onClick={() => setScan(true)}><Camera className="size-4" /> Scan</Btn>
        <Btn size="lg" variant="outline" onClick={() => setSheet({ open: true, meal: null })}><Plus className="size-4" /> Add</Btn>
        <Btn size="lg" variant="outline" onClick={() => {
          if (!me.daily_calorie_target) { toast("Set your calorie target in Settings first."); return; }
          setBudget(true);
        }}><Wallet className="size-4" /> Plan</Btn>
      </div>

      <section className="mt-6" aria-label="Quick meal logging">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-normal">Meals you know by heart</h2>
          <button type="button" onClick={()=>setQuickOpen(true)}
            className="min-h-11 shrink-0 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring">
            See all
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Your own familiar meals, with the same portions ready to log again.
        </p>
        {quick.isPending || (quick.isFetching && !quick.data) ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">Checking your latest meals…</p>
        ) : quick.isError ? (
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border py-3">
            <p className="text-sm text-muted-foreground">Couldn't refresh your meals.</p>
            <Btn variant="outline" onClick={()=>void quick.refetch()}>Retry</Btn>
          </div>
        ) : quickPicks.latest || shownSuggestions.length>0 ? (
          <div className="mt-3 divide-y divide-border border-t border-border">
            {quickPicks.latest&&(
              <div className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Most recently logged · {quickPicks.latest.meal_date===today?"Today":quickPicks.latest.meal_date}</p>
                  <p className="mt-0.5 truncate text-sm font-medium">{quickPicks.latest.food_name}</p>
                  <p className="text-xs text-muted-foreground">{quickPicks.latest.serving_description?quickPicks.latest.serving_description+" · ":""}{fmt(quickPicks.latest.calories)} kcal</p>
                </div>
                <Btn variant="outline" disabled={Boolean(repeatId)} onClick={()=>void repeatMeal(quickPicks.latest!)}>
                  {repeatId===quickPicks.latest.id?"Adding…":"Log again"}
                </Btn>
              </div>
            )}
            {shownSuggestions.map(meal=>(
              <div key={meal.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {repeatCounts.has(mealSignature(meal))
                      ? `${repeatCounts.get(mealSignature(meal))} times with this portion`
                      : `Previously eaten · ${meal.meal_date}`}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium">{meal.food_name}</p>
                  <p className="text-xs text-muted-foreground">{meal.serving_description?meal.serving_description+" · ":""}{fmt(meal.calories)} kcal</p>
                </div>
                <Btn variant="outline" disabled={Boolean(repeatId)} onClick={()=>void repeatMeal(meal)}>
                  {repeatId===meal.id?"Adding…":"Log"}
                </Btn>
              </div>
            ))}
          </div>
        ) : (
          <button type="button" onClick={()=>setQuickOpen(true)}
            className="mt-3 min-h-11 w-full border-t border-border py-3 text-left text-sm text-primary">
            Find a meal you have eaten before
          </button>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-xl">Today's little food story</h2>
        {todays.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center">
            <div className="font-display text-lg">Your food story starts here ❤️</div>
            <div className="mt-1 text-sm text-muted-foreground">Take a photo of your first meal together.</div>
          </div>
        ) : (
          MEAL_TYPES.map((t) => {
            const list = todays.filter((m) => m.meal_type === t.key);
            return (
              <div key={t.key} className="mt-5">
                <Eyebrow>{t.label} {t.icon}</Eyebrow>
                {list.length === 0 ? <div className="mt-2 text-sm text-muted-foreground/70">Not logged yet</div> : (
                  <div className="mt-2 space-y-2">
                    {list.map((m) => {
                      const isMe = m.member_id === me.id;
                      return (
                        <div key={m.id} className={cn("flex w-full items-center gap-2 rounded-xl border border-border bg-card p-3", fresh.has(m.id) && "animate-arrive")}>
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {m.photo_url ? (
                              <button
                                className="flex size-11 shrink-0 items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => {
                                  void signedMealPhotoUrl(m.photo_url!, room.id).then((url) => {
                                    if (url) setLightbox({ src: url, caption: `${m.food_name} · ${fmt(m.calories)} kcal` });
                                    else toast.error("This photo is not available.");
                                  });
                                }}
                                aria-label="View photo full screen"
                              >
                                <PrivateMealPhoto
                                  stored={m.photo_url}
                                  roomId={room.id}
                                  className="size-11 rounded-xl object-cover border border-border transition-opacity hover:opacity-90"
                                />
                              </button>
                            ) : (
                              <span className={cn("size-2 shrink-0 rounded-full", isMe ? "bg-primary" : "bg-partner")} />
                            )}
                            <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                              onClick={() => setSheet({ open: true, meal: m })}
                              aria-label={`View ${m.food_name} meal details`}>
                              <div className="min-w-0 flex-1">
                              <div className="truncate">{m.food_name}</div>
                              <div className="text-xs text-muted-foreground">{isMe ? "You" : partner?.display_name}{m.is_planned ? " · Planned, not eaten" : ""}</div>
                            </div>
                            <div className="num text-right text-sm">
                              <div>{fmt(m.calories)} kcal</div>
                              <div className="text-xs text-muted-foreground">{fmt(Number(m.protein))}g protein</div>
                            </div>
                            </button>
                          </div>
                          {isMe && (
                            <button
                              onClick={() => handleToggleFav(m)}
                              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={favNames.has(m.food_name.trim().toLowerCase()) ? "Remove from favourites" : "Add to favourites"}
                            >
                              <Star className={cn("size-4", favNames.has(m.food_name.trim().toLowerCase()) && "fill-primary text-primary")} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <div className="mt-7"><WeightCard /></div>
      <QuickMealsSheet open={quickOpen} onOpenChange={setQuickOpen} meals={quick.data??[]}
        memberId={me.id} today={today} onCopy={repeatMeal} busyId={repeatId} />
      {lightbox && <Lightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />}
      <ScanSheet open={scan} onOpenChange={setScan} onManual={() => setSheet({ open: true, meal: null })} />
      <MealSheet open={sheet.open} meal={sheet.meal} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} />
      <BudgetPlanSheet open={budget} onOpenChange={setBudget} me={me} />
    </Screen>
  );
}
