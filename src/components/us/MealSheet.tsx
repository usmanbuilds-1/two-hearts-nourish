import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, Star, Trash2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { Btn, Field, TextInput } from "./primitives";
import { MEAL_TYPES, defaultMealType, fmt, type Meal, type MealType } from "@/lib/nutrition";
import { lookupFood } from "@/lib/lookup.functions";
import {
  getFavoriteMeals, saveFavoriteMeal, removeFavoriteMeal,
  type MealFavorite,
} from "@/lib/meal-operations.functions";
import { useSpace } from "@/lib/space";
import { PrivateMealPhoto } from "@/components/us/PrivateMealPhoto";
import { FoodSearchSheet } from "./FoodSearchSheet";
import type { PackagedFood } from "@/lib/off-food";
import { cn } from "@/lib/utils";

export type MealDraft = {
  food_name: string;
  serving_description: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  meal_type: MealType;
  ai_confidence: "low" | "medium" | "high" | null;
  photo_url?: string | null;
  portion_percentage: number;
  nominal_calories?: number | undefined;
  nominal_protein?: number | undefined;
  nominal_carbs?: number | undefined;
  nominal_fat?: number | undefined;
};

export function emptyDraft(): MealDraft {
  return { food_name: "", serving_description: "", calories: "", protein: "", carbs: "", fat: "", meal_type: defaultMealType(), ai_confidence: null, portion_percentage: 100 };
}

export function draftFromMeal(m: Meal): MealDraft {
  return {
    food_name: m.food_name,
    serving_description: m.serving_description ?? "",
    calories: String(m.calories),
    protein: String(Number(m.protein)),
    carbs: String(Number(m.carbs)),
    fat: String(Number(m.fat)),
    meal_type: m.meal_type,
    ai_confidence: (m.ai_confidence as MealDraft["ai_confidence"]) ?? null,
    portion_percentage: m.portion_percentage ?? 100,
    nominal_calories: m.nominal_calories ?? undefined,
    nominal_protein: m.nominal_protein ?? undefined,
    nominal_carbs: m.nominal_carbs ?? undefined,
    nominal_fat: m.nominal_fat ?? undefined,
  };
}

// Empty fields count as 0 so a quick "Apple · 95 kcal" log works.
const num = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));

export function validDraft(d: MealDraft) {
  const vals = [num(d.calories), num(d.protein), num(d.carbs), num(d.fat)];
  return d.food_name.trim().length > 0 && vals.every((v) => Number.isFinite(v) && v >= 0) && (vals[0] ?? 0) <= 20000;
}

/** Shared editable fields */
export function MealFields({
  draft,
  onChange,
  meId,
  isNew,
}: {
  draft: MealDraft;
  onChange: (d: MealDraft) => void;
  meId?: string;
  isNew?: boolean;
}) {
  const set = (k: keyof MealDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, [k]: e.target.value });
  const [lookingUp, setLookingUp] = useState(false);
  const [foodSearchOpen, setFoodSearchOpen] = useState(false);
  const qc = useQueryClient();

  // Favourites — Supabase-backed (replaces localStorage)
  const { data: favs = [] } = useQuery<MealFavorite[]>({
    queryKey: ["meal-favorites",meId],
    queryFn:  () => getFavoriteMeals(),
    enabled:  isNew === true && Boolean(meId),
  });

  function applyFav(f: MealFavorite) {
    onChange({
      ...draft,
      food_name:           f.food_name,
      serving_description: f.serving_description ?? "",
      calories:            String(f.calories),
      protein:             String(f.protein),
      carbs:               String(f.carbs),
      fat:                 String(f.fat),
    });
  }

  async function removeFav(foodName: string) {
    await removeFavoriteMeal({ data: { foodName } }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["meal-favorites"] });
  }

  function applyPackagedFood(food:PackagedFood,amount:number) {
    const factor=amount/100;
    onChange({
      ...draft,
      food_name: [food.brand,food.name].filter(Boolean).join(" ").slice(0,200),
      serving_description: `${amount} g/ml · Open Food Facts (check label)`,
      calories:String(Math.round(food.calories*factor)),
      protein:String(Math.round(food.protein*factor*10)/10),
      carbs:String(Math.round(food.carbs*factor*10)/10),
      fat:String(Math.round(food.fat*factor*10)/10),
      ai_confidence:null,
      portion_percentage:100,
      nominal_calories:undefined,
      nominal_protein:undefined,
      nominal_carbs:undefined,
      nominal_fat:undefined,
    });
  }

  // Portion percentage
  const PORTIONS = [
    { label: "¼", pct: 25 },
    { label: "½", pct: 50 },
    { label: "¾", pct: 75 },
    { label: "Full", pct: 100 },
    { label: "1½×", pct: 150 },
  ];

  function applyPortion(pct: number) {
    // Derive nominal base (undo any previous scaling first)
    const prevPct = draft.portion_percentage;
    const nomCal  = draft.nominal_calories ?? (prevPct > 0 ? Math.round(num(draft.calories) / prevPct * 100) : num(draft.calories));
    const nomProt = draft.nominal_protein  ?? (prevPct > 0 ? num(draft.protein)  / prevPct * 100 : num(draft.protein));
    const nomCarb = draft.nominal_carbs    ?? (prevPct > 0 ? num(draft.carbs)    / prevPct * 100 : num(draft.carbs));
    const nomFat  = draft.nominal_fat      ?? (prevPct > 0 ? num(draft.fat)      / prevPct * 100 : num(draft.fat));
    onChange({
      ...draft,
      portion_percentage: pct,
      nominal_calories:   Math.round(nomCal),
      nominal_protein:    Math.round(nomProt * 10) / 10,
      nominal_carbs:      Math.round(nomCarb * 10) / 10,
      nominal_fat:        Math.round(nomFat  * 10) / 10,
      calories:           String(Math.round(nomCal  * pct / 100)),
      protein:            String(Math.round(nomProt * pct / 100 * 10) / 10),
      carbs:              String(Math.round(nomCarb * pct / 100 * 10) / 10),
      fat:                String(Math.round(nomFat  * pct / 100 * 10) / 10),
    });
  }

  async function aiLookup() {
    const q = draft.food_name.trim();
    if (q.length < 2) return;
    setLookingUp(true);
    try {
      const res = await lookupFood({ data: { description: q } });
      if (!res.ok) {
        const msg = res.error === "AI_CREDITS" ? "AI estimates are paused — the AI allowance is used up. You can still type the numbers yourself." : res.error === "AI_BUSY" ? "AI is busy, try again." : res.error === "AI_LIMIT" ? "Daily AI allowance reached. Enter the numbers manually." : "Couldn't estimate — check the name and try again.";
        toast.error(msg);
        return;
      }
      const e = res.estimate;
      onChange({
        ...draft,
        food_name: e.food_name,
        serving_description: e.serving_description || draft.serving_description,
        calories: String(e.calories),
        protein: String(e.protein),
        carbs: String(e.carbs),
        fat: String(e.fat),
        ai_confidence: e.confidence,
      });
      toast.success(`Estimated · ${e.confidence} confidence ✨`);
    } catch {
      toast.error("Couldn't estimate right now. Try again.");
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Favourites quick-add (new meals only) */}
      {isNew && favs.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Favourites ⭐</div>
          <div className="flex flex-wrap gap-2">
            {favs.map((f) => (
              <div key={f.food_name} className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-sm">
                <button type="button" onClick={() => applyFav(f)} className="text-left">
                  {f.food_name}
                </button>
                <button
                  type="button"
                  onClick={() => removeFav(f.food_name)}
                  className="ml-1 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${f.food_name} from favourites`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-secondary p-1">
        {MEAL_TYPES.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => onChange({ ...draft, meal_type: t.key })}
            className={cn("min-h-10 rounded-lg text-xs font-medium transition-colors", draft.meal_type === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isNew&&(
        <>
          <Btn variant="outline" className="w-full" onClick={()=>setFoodSearchOpen(true)}>
            Search food labels or scan a barcode
          </Btn>
          <FoodSearchSheet open={foodSearchOpen} onOpenChange={setFoodSearchOpen} onSelect={applyPackagedFood}/>
        </>
      )}
      {/* Food name with optional AI lookup */}
      <Field label="Food">
        <div className="flex gap-2">
          <TextInput
            value={draft.food_name}
            onChange={set("food_name")}
            placeholder="2 slices bread, KitKat 2 bars…"
            maxLength={200}
            className="flex-1"
          />
          <button
            type="button"
            onClick={aiLookup}
            disabled={lookingUp || draft.food_name.trim().length < 2}
            title="AI estimate from description"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl border border-border bg-card px-3 transition-colors",
              "hover:border-primary hover:text-primary disabled:opacity-40",
            )}
          >
            {lookingUp ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </button>
        </div>
        {draft.ai_confidence && (
          <p className="mt-1 text-xs text-muted-foreground">AI estimate · {draft.ai_confidence} confidence</p>
        )}
      </Field>

      <Field label="Serving">
        <TextInput value={draft.serving_description} onChange={set("serving_description")} placeholder="approximately 350g" maxLength={160} />
      </Field>
      {/* Portion picker — shown only when food has been named */}
      {draft.food_name.trim().length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Portion eaten</div>
          <div className="flex gap-1.5">
            {PORTIONS.map(({ label, pct }) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyPortion(pct)}
                className={cn(
                  "flex-1 min-h-11 rounded-xl border px-1 py-2 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-ring",
                  draft.portion_percentage === pct
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {draft.portion_percentage !== 100 && draft.nominal_calories !== undefined && (
            <p className="text-[11px] text-muted-foreground">
              Based on {draft.nominal_calories} kcal full serving → {draft.portion_percentage}% = {draft.calories} kcal
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories (kcal)">
          <TextInput inputMode="numeric" value={draft.calories} onChange={set("calories")} placeholder="0" className="num" />
        </Field>
        <Field label="Protein (g)">
          <TextInput inputMode="decimal" value={draft.protein} onChange={set("protein")} placeholder="0" className="num" />
        </Field>
        <Field label="Carbs (g)">
          <TextInput inputMode="decimal" value={draft.carbs} onChange={set("carbs")} placeholder="0" className="num" />
        </Field>
        <Field label="Fat (g)">
          <TextInput inputMode="decimal" value={draft.fat} onChange={set("fat")} placeholder="0" className="num" />
        </Field>
      </div>
    </div>
  );
}

export function useSaveMeal() {
  const { me, room, today, upsertLocal } = useSpace();
  const qc=useQueryClient();
  return async (d: MealDraft, existing?: Meal) => {
    // Only include photo_url when it is set — omitting it entirely keeps saves
    // working even if migration 0011 (ADD COLUMN photo_url) hasn't been run yet.
    const photoUrl = d.photo_url ?? existing?.photo_url;
    const payload = {
      food_name: d.food_name.trim(),
      serving_description: d.serving_description.trim() || null,
      calories: Math.round(num(d.calories)),
      protein: Math.round(num(d.protein) * 10) / 10,
      carbs: Math.round(num(d.carbs) * 10) / 10,
      fat: Math.round(num(d.fat) * 10) / 10,
      meal_type: d.meal_type,
      ai_confidence: d.ai_confidence,
      ...(photoUrl !== undefined ? { photo_url: photoUrl } : {}),
      ...(d.portion_percentage !== 100 ? {
        portion_percentage: d.portion_percentage,
        nominal_calories:   d.nominal_calories ?? null,
        nominal_protein:    d.nominal_protein  ?? null,
        nominal_carbs:      d.nominal_carbs    ?? null,
        nominal_fat:        d.nominal_fat      ?? null,
      } : { portion_percentage: 100 }),
    };
    if (existing) {
      const { data, error } = await supabase.from("meals").update(payload).eq("id", existing.id).select().single();
      if (error || !data) { console.error("[MealSheet update]", error); throw new Error(error?.message ?? "update"); }
      upsertLocal(data as Meal);
      void qc.invalidateQueries({queryKey:["quick-meals",me.id]});
      void qc.invalidateQueries({queryKey:["recent-meals",me.id]});
      return data as Meal;
    }
    const { data, error } = await supabase
      .from("meals")
      .insert({ ...payload, room_id: room.id, member_id: me.id, meal_date: today })
      .select()
      .single();
    if (error || !data) { console.error("[MealSheet insert]", error); throw new Error(error?.message ?? "save"); }
    upsertLocal(data as Meal);
    void qc.invalidateQueries({queryKey:["quick-meals",me.id]});
    void qc.invalidateQueries({queryKey:["recent-meals",me.id]});
    return data as Meal;
  };
}

function FavStarBtn({ meal }: { meal: Meal | null }) {
  const qc = useQueryClient();
  if (!meal) return null;
  return (
    <Btn
      size="lg"
      variant="outline"
      aria-label="Save to favourites"
      onClick={async () => {
        await saveFavoriteMeal({ data: {
          foodName:           meal.food_name,
          servingDescription: meal.serving_description ?? "",
          calories:           meal.calories,
          protein:            Number(meal.protein),
          carbs:              Number(meal.carbs),
          fat:                Number(meal.fat),
        }}).catch(() => {});
        qc.invalidateQueries({ queryKey: ["meal-favorites"] });
        toast.success("Saved to favourites ⭐");
      }}
    >
      <Star className="size-4" />
    </Btn>
  );
}

export function MealSheet({
  open,
  onOpenChange,
  meal,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  meal: Meal | null;
}) {
  const { me, members, removeLocal } = useSpace();
  const save = useSaveMeal();
  const [draft, setDraft] = useState<MealDraft>(emptyDraft());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = !meal || meal.member_id === me.id;
  const owner = meal ? members.find((m) => m.id === meal.member_id) : me;

  useEffect(() => {
    if (open) {
      setDraft(meal ? draftFromMeal(meal) : emptyDraft());
      setEditing(!meal);
    }
  }, [open, meal]);

  async function submit() {
    if (!validDraft(draft)) return void toast.error("Add a name and valid numbers first.");
    setBusy(true);
    try {
      await save(draft, meal ?? undefined);
      toast.success(meal ? "Meal updated" : "Added ❤️");
      onOpenChange(false);
    } catch (e) {
      const detail = (e as Error)?.message ?? "";
      console.error("[MealSheet catch]", detail);
      toast.error(meal ? `Couldn't update: ${detail}` : `Couldn't save: ${detail}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!meal || !confirm(`Delete "${meal.food_name}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from("meals").delete().eq("id", meal.id);
    setBusy(false);
    if (error) return void toast.error("Couldn't delete that meal. Please try again.");
    removeLocal(meal.id);
    toast("Meal deleted");
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-xl border-border bg-background">
        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <DrawerTitle className="font-display text-2xl font-normal">
            {!meal ? "Add a meal" : editing ? "Edit meal" : meal.food_name}
          </DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-muted-foreground">
            {!meal ? "Type a description and tap ✨ to auto-fill macros, or enter manually." : `Logged by ${mine ? "you" : owner?.display_name}`}
          </DrawerDescription>

          <div className="mt-5">
            {editing ? (
              <MealFields draft={draft} onChange={setDraft} meId={me.id} isNew={!meal} />
            ) : meal ? (
              <div className="space-y-4">
                {meal.photo_url && (
                  <div className="overflow-hidden rounded-2xl border border-border">
                    <PrivateMealPhoto stored={meal.photo_url} roomId={meal.room_id} alt={meal.food_name} className="h-48 w-full object-cover" />
                  </div>
                )}
                {meal.serving_description && <p className="text-muted-foreground">{meal.serving_description}</p>}
                <div className="grid grid-cols-4 gap-2 rounded-2xl border border-border bg-card p-4 text-center">
                  {([["kcal", meal.calories], ["protein", Number(meal.protein)], ["carbs", Number(meal.carbs)], ["fat", Number(meal.fat)]] as const).map(([l, v]) => (
                    <div key={l}>
                      <div className="num text-xl font-semibold">{fmt(v as number)}{l !== "kcal" && <span className="text-sm text-muted-foreground">g</span>}</div>
                      <div className="text-xs text-muted-foreground">{l}</div>
                    </div>
                  ))}
                </div>
                {meal.ai_confidence && (
                  <p className="text-xs text-muted-foreground">Estimated · {meal.ai_confidence} confidence</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex gap-2">
            {editing ? (
              <>
                <Btn size="lg" className="flex-1" onClick={submit} disabled={busy}>
                  {busy ? "Saving…" : meal ? "Save changes" : "Add meal ❤️"}
                </Btn>
                {meal && <Btn size="lg" variant="outline" onClick={() => setEditing(false)}>Cancel</Btn>}
              </>
            ) : mine ? (
              <>
                <Btn size="lg" className="flex-1" onClick={() => setEditing(true)}>Edit</Btn>
                <FavStarBtn meal={meal} />
                <Btn size="lg" variant="danger" onClick={remove} disabled={busy} aria-label="Delete meal">
                  <Trash2 className="size-4" />
                </Btn>
              </>
            ) : (
              <Btn size="lg" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Close</Btn>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
