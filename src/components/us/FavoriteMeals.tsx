import { Star } from "lucide-react";
import { Btn } from "./primitives";
import { fmt } from "@/lib/nutrition";
import type { MealFavorite } from "@/lib/meal-operations.functions";

export function FavoriteMeals({
  favorites,loading,error,onRetry,onViewAll,onLog,busyId,
}:{
  favorites:MealFavorite[];
  loading:boolean;
  error:boolean;
  onRetry:()=>void;
  onViewAll:()=>void;
  onLog:(favorite:MealFavorite)=>Promise<void>;
  busyId:string|null;
}) {
  return (
    <section className="mt-7" aria-label="Favourite meals">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-normal">Favourites</h2>
        <button type="button" onClick={onViewAll}
          className="min-h-11 shrink-0 px-2 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring">
          {favorites.length?"See all":"Browse recent"}
        </button>
      </div>
      {loading?(
        <p className="mt-3 text-sm text-muted-foreground" role="status">Loading favourites…</p>
      ):error?(
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border py-3">
          <p className="text-sm text-muted-foreground">Couldn't load your favourites.</p>
          <Btn variant="outline" onClick={onRetry}>Retry</Btn>
        </div>
      ):favorites.length===0?(
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Tap the star beside one of your logged meals to save its portion. It'll be here to log in one tap.
        </p>
      ):(
        <div className="mt-2 divide-y divide-border border-t border-border">
          {favorites.slice(0,3).map(f=>(
            <div key={f.id} className="flex min-h-[70px] items-center gap-3 py-3">
              <Star className="size-4 shrink-0 fill-primary text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.food_name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {f.serving_description ? f.serving_description+" · " : ""}
                  {fmt(f.calories)} kcal · {fmt(Number(f.protein))}g protein
                </p>
              </div>
              <Btn variant="outline" disabled={Boolean(busyId)} onClick={()=>void onLog(f)}
                aria-label={`Log ${f.food_name} with your saved portion`}>
                {busyId===f.id?"Adding…":"Log"}
              </Btn>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
