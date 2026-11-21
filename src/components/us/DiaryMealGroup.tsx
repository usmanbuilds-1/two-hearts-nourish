import { Apple, ChevronDown, Coffee, Moon, MoreHorizontal, Plus, Utensils } from "lucide-react";
import { fmt, totals, type Meal, type MealType } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

const ICONS = { breakfast: Coffee, lunch: Utensils, snack: Apple, dinner: Moon } as const;

export function DiaryMealGroup({
  type, label, entries, expanded, onToggle, onAdd, onEdit, onOptions,
}: {
  type: MealType;
  label: string;
  entries: Meal[];
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (meal: Meal) => void;
  onOptions: (meal: Meal) => void;
}) {
  const Icon = ICONS[type];
  const logged = entries.filter(meal => !meal.is_planned);
  const sum = totals(logged);
  const sectionId = `diary-group-${type}`;
  return (
    <section aria-label={label} className="border-b border-border/70 py-3 first:pt-0 last:border-0">
      <div className="flex min-h-11 items-center gap-2">
        <Icon className="size-[18px] shrink-0 text-primary" strokeWidth={1.7} aria-hidden="true" />
        <button type="button" onClick={onToggle}
          aria-expanded={expanded} aria-controls={sectionId}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className="font-semibold text-sm text-foreground">{label}</span>
          {entries.length > 0 && <span className="text-xs text-muted-foreground">· {entries.length} {entries.length === 1 ? "item" : "items"}</span>}
          <ChevronDown className={cn("ml-0.5 size-4 shrink-0 text-primary transition-transform",expanded&&"rotate-180")} aria-hidden="true" />
        </button>
        {entries.length > 0
          ? <span className="num shrink-0 text-sm font-semibold text-foreground">{fmt(sum.calories)} <span className="font-normal text-muted-foreground">kcal</span></span>
          : <button type="button" onClick={onAdd}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`Add to ${label.toLowerCase()}`}>
              <Plus className="size-4" aria-hidden="true" /> Add
            </button>
        }
      </div>
      <div id={sectionId} hidden={!expanded}>
        {entries.length === 0 ? (
          <p className="ml-[26px] pb-1 text-xs text-muted-foreground">Not logged yet</p>
        ) : (
          <div className="ml-[26px] rounded-xl bg-card/45 px-2">
            {entries.map(meal => (
              <div key={meal.id} className="flex min-h-16 items-center gap-1 border-b border-border/60 py-2 last:border-b-0">
                <button type="button" onClick={() => onEdit(meal)}
                  className="min-w-0 flex-1 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={`Edit ${meal.food_name}`}>
                  <span className="block truncate text-sm font-semibold text-foreground">{meal.food_name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {meal.is_planned ? "Planned · not eaten" : (meal.serving_description?.trim() || "1 serving")}
                  </span>
                </button>
                <div className="num shrink-0 text-right leading-5">
                  <p className="text-sm font-semibold text-foreground">{fmt(meal.calories)} <span className="font-normal text-muted-foreground">kcal</span></p>
                  <p className="text-xs text-muted-foreground">{fmt(Number(meal.protein))} g protein</p>
                </div>
                <button type="button" onClick={() => onOptions(meal)}
                  aria-label={`Options for ${meal.food_name}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <MoreHorizontal className="size-5" aria-hidden="true"/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
