import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { Btn, Field, TextInput } from "./primitives";
import { MEAL_TYPES, defaultMealType, fmt, type Meal, type MealType } from "@/lib/nutrition";
import { lookupFood } from "@/lib/lookup.functions";
import { useSpace } from "@/lib/space";
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
};

export function emptyDraft(): MealDraft {
  return { food_name: "", serving_description: "", calories: "", protein: "", carbs: "", fat: "", meal_type: defaultMealType(), ai_confidence: null };
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

  // Favourites from localStorage
  const favKey = meId ? `us.fav.${meId}` : null;
  const [favs, setFavs] = useState<MealDraft[]>(() => {
    if (!favKey) return [];
    try { return JSON.parse(localStorage.getItem(favKey) ?? "[]"); } catch { return []; }
  });

  function applyFav(f: MealDraft) {
    onChange({ ...f, meal_type: draft.meal_type });
  }

  function removeFav(name: string) {
    if (!favKey) return;
    const next = favs.filter((f) => f.food_name !== name);
    localStorage.setItem(favKey, JSON.stringify(next));
    setFavs(next);
  }

  async function aiLookup() {
    const q = draft.food_name.trim();
    if (q.length < 2) return;
    setLookingUp(true);
    try {
      const res = await lookupFood({ data: { description: q } });
      if (!res.ok) {
        const msg = res.error === "AI_CREDITS" ? "AI estimates are paused — the AI allowance is used up. You can still type the numbers yourself." : res.error === "AI_BUSY" ? "AI is busy, try again." : "Couldn't estimate — check the name and try again.";
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
                  className="ml-1 text-muted-foreground hover:text-destructive"
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

      {/* Food name with AI lookup */}
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
    };
    if (existing) {
      const { data, error } = await supabase.from("meals").update(payload).eq("id", existing.id).select().single();
      if (error || !data) throw new Error("update");
      upsertLocal(data as Meal);
      return data as Meal;
    }
    const { data, error } = await supabase
      .from("meals")
      .insert({ ...payload, room_id: room.id, member_id: me.id, meal_date: today })
      .select()
      .single();
    if (error || !data) throw new Error("save");
    upsertLocal(data as Meal);
    return data as Meal;
  };
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
    } catch {
      toast.error(meal ? "Couldn't update that meal. Please try again." : "Couldn't save that meal — it wasn't added. Please try again.");
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
                    <img src={meal.photo_url} alt={meal.food_name} className="h-48 w-full object-cover" />
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
