import { createPartnerInvite } from "@/lib/room.functions";
import { buildInviteUrl } from "@/lib/rejoin-links";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { findSavedFood, isSavedPortion } from "@/lib/favorite-meals";
import { FavoriteMeals } from "@/components/us/FavoriteMeals";
import { getQuickMeals } from "@/lib/meal-operations.functions";
import { QuickMealsSheet } from "@/components/us/QuickMealsSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronRight, ChefHat, Heart, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useSpace } from "@/lib/space";
import { getRoomLifetimeStats } from "@/lib/room-stats.functions";
import { MEAL_TYPES, coupleStats, defaultMealType, fmt, parseLocalDate, type Meal } from "@/lib/nutrition";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { MealSheet, emptyDraft, useSaveMeal } from "@/components/us/MealSheet";
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
import { quoteForDay } from "@/lib/quotes";
import { AdaptiveTargetCard } from "@/components/us/AdaptiveTargetCard";
import { TodayNutritionSummary } from "@/components/us/TodayNutritionSummary";
import { TodayMealRow } from "@/components/us/TodayMealRow";

export const Route = createFileRoute("/_space/today")({
  head: () => ({ meta: [{ title: "Today — Us" }, { name: "description", content: "Your shared day of meals." }, { property: "og:title", content: "Today — Us" }, { property: "og:description", content: "Your shared day of meals." }] }),
  component: Today,
});

function Today() {
  const { me, partner, meals, today, room, fresh, upsertLocal } = useSpace();
  const [scan, setScan] = useState(false);
  const [repeatId, setRepeatId] = useState<string | null>(null);
  const [favoriteLogId, setFavoriteLogId] = useState<string | null>(null);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickInitialTab,setQuickInitialTab]=useState<"saved"|"recent">("saved");
  const [sheet, setSheet] = useState<{ open: boolean; meal: Meal | null }>({ open: false, meal: null });
  const [budget, setBudget] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const qc = useQueryClient();
  const saveMeal=useSaveMeal();
  const { data: favsData = [], isPending: favoritesPending, isError: favoritesError, refetch: refetchFavorites } = useQuery<MealFavorite[]>({
    queryKey: ["meal-favorites",me.id],
    queryFn: () => getFavoriteMeals(),
  });
  async function handleToggleFav(m:Meal) {
    if(favoriteBusyId||favoritesPending||favoritesError)return;
    const existing=findSavedFood(favsData,m);
    const same=isSavedPortion(existing,m);
    setFavoriteBusyId(m.id);
    try{
      if(same&&existing){
        await removeFavoriteMeal({data:{foodName:existing.food_name}});
        toast("Removed from favourites");
      }else{
        await saveFavoriteMeal({data:{
          foodName:existing?.food_name??m.food_name,
          servingDescription:m.serving_description??"",
          calories:m.calories,protein:Number(m.protein),
          carbs:Number(m.carbs),fat:Number(m.fat),
        }});
        toast.success(existing?"Saved portion updated":"Added to favourites");
      }
      await qc.invalidateQueries({queryKey:["meal-favorites",me.id]});
    }catch{toast.error("Couldn't update favourites. Please try again.");}
    finally{setFavoriteBusyId(null);}
  }

  async function logFavorite(f:MealFavorite) {
    if(favoriteLogId||repeatId)return;
    setFavoriteLogId(f.id);
    try{
      await saveMeal({
        ...emptyDraft(),
        food_name:f.food_name,
        serving_description:f.serving_description??"",
        calories:String(f.calories),
        protein:String(f.protein),
        carbs:String(f.carbs),
        fat:String(f.fat),
        meal_type:defaultMealType(),
      });
      toast.success(f.food_name+" logged using your saved portion");
    }catch{toast.error("Couldn't log this favourite. Try again.");}
    finally{setFavoriteLogId(null);}
  }

  const quick = useQuery<Meal[]>({
    queryKey:["quick-meals",me.id,today],
    queryFn:()=>getQuickMeals({data:{clientDate:today}}),
    enabled:quickOpen,
    refetchOnMount:"always",
    staleTime:30_000,
  });
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
    <Screen className="max-w-xl px-4 pb-0 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
      <header className="pb-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="font-display text-xl font-semibold leading-[0.95] tracking-tight text-foreground">
              Two Hearts<br />Nourish
            </div>
            <Heart className="size-6 text-primary" strokeWidth={1.6} aria-hidden="true" />
          </div>
          <Link to="/settings"
            className="flex min-h-11 items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Settings
          </Link>
        </div>
        <p className="mt-5 text-xs font-medium text-muted-foreground">
          {parseLocalDate(today).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-[2.3rem] font-medium leading-tight tracking-tight sm:text-4xl">
          Today, together <Heart className="size-6 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{me.display_name}</span>
          <span className="mx-2 text-primary" aria-hidden="true">♡</span>
          <span className="font-medium text-foreground">{partner?.display_name ?? "Your person"}</span>
        </p>
        {bothLoggedToday && (
          <p className="mt-2 text-xs text-muted-foreground">You both logged meals today ♡</p>
        )}
        {sharedStreak >= 2 && (
          <p className="mt-2 text-xs text-primary">
            {sharedStreak} days logging meals together
          </p>
        )}
      </header>

      <section className="mt-5 border-l-2 border-primary/40 py-1 pl-4" aria-label={room.couple_message ? "Your shared message" : "Today's thought"}>
        <p className="font-display text-lg leading-snug text-foreground">
          {room.couple_message?.trim() || quoteForDay(today)}
        </p>
      </section>

      <TodayNutritionSummary me={me} partner={partner} mine={mine} theirs={theirs} />

      <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="Log or plan a meal">
        <Btn size="lg" className="min-h-12 min-w-0 gap-1.5 rounded-xl px-2 text-xs sm:text-sm"
          onClick={() => setScan(true)}>
          <Camera className="size-4 shrink-0" aria-hidden="true" /> Scan food
        </Btn>
        <Btn size="lg" variant="outline"
          className="min-h-12 min-w-0 gap-1.5 rounded-xl px-2 text-xs sm:text-sm"
          onClick={() => setSheet({ open: true, meal: null })}>
          <Plus className="size-4 shrink-0" aria-hidden="true" /> Add meal
        </Btn>
        <Btn size="lg" variant="outline"
          className="min-h-12 min-w-0 gap-1.5 rounded-xl px-2 text-xs sm:text-sm"
          onClick={() => {
            if (!me.daily_calorie_target) {
              toast("Set your calorie target in Settings first.");
              return;
            }
            setBudget(true);
          }}>
          <Wallet className="size-4 shrink-0" aria-hidden="true" /> Plan meals
        </Btn>
      </div>

      <AdaptiveTargetCard />

      {!partner && (
        <section className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="font-display text-lg">Invite your person ♡</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Share a private invitation link so you can keep a space together.
          </p>
          <Btn variant="outline" className="mt-3 w-full" onClick={() =>
            void createPartnerInvite().then(invite =>
              navigator.clipboard.writeText(buildInviteUrl(window.location.origin, invite.roomCode, invite.token))
            ).then(() => toast.success("Private invitation copied"), () =>
              toast.error("Couldn't create the invitation. Try again."))}>
            Copy invitation link
          </Btn>
        </section>
      )}

      <FavoriteMeals
        favorites={favsData}
        loading={favoritesPending}
        error={favoritesError}
        onRetry={() => void refetchFavorites()}
        onViewAll={() => {
          setQuickInitialTab(favsData.length ? "saved" : "recent");
          setQuickOpen(true);
        }}
        onLog={logFavorite}
        busyId={favoriteLogId}
      />

      <section className="mt-7" aria-labelledby="today-meals-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="today-meals-heading" className="font-display text-2xl font-normal">Today's meals</h2>
          <Link to="/diary" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-medium text-primary">
            View diary <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        {todays.length === 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing logged yet. Scan a photo or add your first meal.
          </p>
        )}
        <div className="mt-3 space-y-3">
          {MEAL_TYPES.map((type) => {
            const list = todays.filter(meal => meal.meal_type === type.key);
            return (
              <div key={type.key} className="space-y-2">
                {list.length === 0 ? (
                  <div className="flex min-h-[58px] items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 px-3">
                    <span className="text-sm font-medium">{type.label}</span>
                    <span className="text-xs text-muted-foreground">Not logged yet</span>
                    <button type="button"
                      onClick={() => setSheet({ open: true, meal: null })}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Plus className="size-4" aria-hidden="true" /> Add
                    </button>
                  </div>
                ) : (
                  <>
                    <Eyebrow className="pl-1">{type.label}</Eyebrow>
                    {list.map(meal => {
                      const isMine = meal.member_id === me.id;
                      const saved = isMine ? findSavedFood(favsData, meal) : null;
                      return (
                        <div key={meal.id} className={cn(fresh.has(meal.id) && "animate-arrive")}>
                          <TodayMealRow
                            meal={meal}
                            mealType={type.label}
                            owner={isMine ? "You" : (partner?.display_name ?? "Your person")}
                            isMine={isMine}
                            roomId={room.id}
                            marked={isSavedPortion(saved ?? undefined, meal)}
                            favoriteDisabled={Boolean(favoriteBusyId) || favoritesPending || favoritesError}
                            onViewMeal={() => setSheet({ open: true, meal })}
                            onViewPhoto={() => {
                              if (!meal.photo_url) return;
                              void signedMealPhotoUrl(meal.photo_url, room.id).then(url => {
                                if (url) setLightbox({ src: url, caption: `${meal.food_name} · ${fmt(meal.calories)} kcal` });
                                else toast.error("This photo is not available.");
                              }).catch(() => toast.error("This photo is not available."));
                            }}
                            onToggleFavorite={() => void handleToggleFav(meal)}
                          />
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <Link to="/recipes"
        className="mt-5 flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card px-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChefHat className="size-6 shrink-0 text-primary" strokeWidth={1.6} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">My recipes</span>
          <span className="block text-xs text-muted-foreground">Create, edit or log a recipe</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
      </Link>

      <section className="mt-3" aria-label="Weight logging">
        <WeightCard />
      </section>
      <QuickMealsSheet open={quickOpen} onOpenChange={setQuickOpen} meals={quick.data??[]}
        memberId={me.id} today={today} onCopy={repeatMeal} busyId={repeatId}
        initialTab={quickInitialTab} historyPending={quick.isPending} historyError={quick.isError}
        onRetryHistory={()=>void quick.refetch()} />
      {lightbox && <Lightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />}
      <ScanSheet open={scan} onOpenChange={setScan} onManual={() => setSheet({ open: true, meal: null })} />
      <MealSheet open={sheet.open} meal={sheet.meal} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} />
      <BudgetPlanSheet open={budget} onOpenChange={setBudget} me={me} />
    </Screen>
  );
}
