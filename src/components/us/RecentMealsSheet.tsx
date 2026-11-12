import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Star, Trash2 } from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { Btn } from "@/components/us/primitives";
import {
  getRecentMeals,
  getFavoriteMeals,
  saveFavoriteMeal,
  removeFavoriteMeal,
  type MealFavorite,
} from "@/lib/meal-operations.functions";
import { useSaveMeal, emptyDraft } from "@/components/us/MealSheet";
import { fmt } from "@/lib/nutrition";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Meal } from "@/lib/nutrition";

export function RecentMealsSheet({
  open,
  onOpenChange,
  selectedDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedDate: string;
}) {
  const [tab, setTab] = useState<"recents" | "favs">("recents");
  const save = useSaveMeal();
  const qc   = useQueryClient();

  const { data: recents = [], isLoading: loadingR } = useQuery<Meal[]>({
    queryKey: ["recent-meals"],
    queryFn:  () => getRecentMeals(),
    enabled:  open,
  });

  const { data: favs = [], isLoading: loadingF } = useQuery<MealFavorite[]>({
    queryKey: ["meal-favorites"],
    queryFn:  () => getFavoriteMeals(),
    enabled:  open,
  });

  async function logMeal(m: Meal | MealFavorite) {
    try {
      await save({
        ...emptyDraft(),
        food_name:           m.food_name,
        serving_description: m.serving_description ?? "",
        calories:            String(m.calories),
        protein:             String(m.protein),
        carbs:               String(m.carbs),
        fat:                 String(m.fat),
        meal_type:           "meal_type" in m ? m.meal_type : "lunch",
      });
      toast.success(`${m.food_name} added ❤️`);
      onOpenChange(false);
    } catch {
      toast.error("Couldn't add meal. Please try again.");
    }
  }

  async function deleteFav(foodName: string) {
    await removeFavoriteMeal({ data: { foodName } }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["meal-favorites"] });
    toast.success("Removed from favourites");
  }

  const favNames = useMemo(
    () => new Set(favs.map((f) => f.food_name.trim().toLowerCase())),
    [favs],
  );

  const loading = tab === "recents" ? loadingR : loadingF;
  const items   = tab === "recents" ? recents : favs;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[90dvh] max-w-xl">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="font-display text-2xl font-normal">Quick add</DrawerTitle>
          <DrawerDescription className="sr-only">
            Log a recent or favourite meal
          </DrawerDescription>
        </DrawerHeader>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-border px-4">
          {(["recents", "favs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-1.5 px-3 pb-2 text-sm font-medium transition-colors",
                tab === t
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "recents" ? (
                <><Clock className="size-3.5" /> Recents</>
              ) : (
                <><Star className="size-3.5" /> Favourites {favs.length > 0 && `(${favs.length})`}</>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}

          {!loading && items.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {tab === "recents"
                  ? "No recent meals yet — start logging!"
                  : "No favourites saved yet. Tap ⭐ on any meal to save it."}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {items.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.food_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmt(m.calories)} kcal · P {fmt(Number(m.protein))}g
                    {m.serving_description ? ` · ${m.serving_description}` : ""}
                  </div>
                </div>

                {/* Star — save/remove favourite (shown in both tabs) */}
                <button
                  onClick={async () => {
                    const isFav = favNames.has(m.food_name.trim().toLowerCase());
                    if (isFav) {
                      await removeFavoriteMeal({ data: { foodName: m.food_name } }).catch(() => {});
                      toast("Removed from favourites");
                    } else {
                      await saveFavoriteMeal({ data: {
                        foodName: m.food_name,
                        servingDescription: m.serving_description ?? "",
                        calories: m.calories,
                        protein: Number(m.protein),
                        carbs: Number(m.carbs),
                        fat: Number(m.fat),
                      } }).catch(() => {});
                      toast.success("Saved to favourites ⭐");
                    }
                    qc.invalidateQueries({ queryKey: ["meal-favorites"] });
                  }}
                  className="shrink-0 p-1 text-muted-foreground hover:text-primary transition-colors"
                  aria-label={favNames.has(m.food_name.trim().toLowerCase()) ? "Remove from favourites" : "Add to favourites"}
                >
                  <Star className={cn("size-3.5", favNames.has(m.food_name.trim().toLowerCase()) && "fill-primary text-primary")} />
                </button>

                {/* Remove fav */}
                {tab === "favs" && (
                  <button
                    onClick={() => deleteFav(m.food_name)}
                    className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove from favourites"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}

                <Btn size="md" onClick={() => logMeal(m)}>
                  Add
                </Btn>
              </div>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
