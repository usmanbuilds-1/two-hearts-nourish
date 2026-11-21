import { ChevronRight, Image as ImageIcon, Star, UtensilsCrossed } from "lucide-react";
import { PrivateMealPhoto } from "@/components/us/PrivateMealPhoto";
import { fmt, type Meal } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

type Props = {
  meal: Meal;
  mealType: string;
  owner: string;
  isMine: boolean;
  roomId: string;
  marked: boolean;
  favoriteDisabled: boolean;
  onViewMeal: () => void;
  onViewPhoto: () => void;
  onToggleFavorite: () => void;
};

/** Real meal photos are loaded with signed, room-private URLs. Never show stock food. */
export function TodayMealRow({
  meal, mealType, owner, isMine, roomId, marked, favoriteDisabled,
  onViewMeal, onViewPhoto, onToggleFavorite,
}: Props) {
  const image = Boolean(meal.photo_url);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-card p-2.5"
      data-testid="today-meal-row">
      {image ? (
        <button type="button" onClick={onViewPhoto}
          className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View photo of ${meal.food_name}`}>
          <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          <PrivateMealPhoto stored={meal.photo_url!} roomId={roomId}
            className="absolute inset-0 size-full object-cover" alt="" />
        </button>
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-secondary"
          aria-hidden="true">
          <UtensilsCrossed className="size-5 text-muted-foreground" />
        </span>
      )}
      <button type="button" onClick={onViewMeal}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${meal.food_name}, ${mealType}, ${owner}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-muted-foreground">
            {mealType} · <span className={isMine ? "text-primary" : "text-partner"}>{owner}</span>
          </span>
          <span className="block truncate text-sm font-semibold leading-5">{meal.food_name}</span>
          <span className="num mt-0.5 block truncate text-[11px] text-muted-foreground">
            {meal.is_planned ? "Planned, not eaten · " : ""}
            {fmt(Number(meal.protein))}g P · {fmt(Number(meal.carbs))}g C · {fmt(Number(meal.fat))}g F
          </span>
        </span>
        <span className="num shrink-0 whitespace-nowrap text-right text-xs font-semibold">
          {fmt(meal.calories)}
          <span className="ml-0.5 font-normal text-muted-foreground">kcal</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {isMine && (
        <button type="button" onClick={onToggleFavorite} disabled={favoriteDisabled}
          aria-pressed={marked}
          aria-label={marked
            ? `Remove saved portion of ${meal.food_name}`
            : `Save portion of ${meal.food_name} to favourites`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Star className={cn("size-[18px]", marked && "fill-primary")} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
