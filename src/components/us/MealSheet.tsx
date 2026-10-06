import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { Btn, Field, TextInput } from "./primitives";
import { MEAL_TYPES, defaultMealType, fmt, type Meal, type MealType } from "@/lib/nutrition";
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

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function validDraft(d: MealDraft) {
  const vals = [num(d.calories), num(d.protein), num(d.carbs), num(d.fat)];
  return d.food_name.trim().length > 0 && vals.every((v) => Number.isFinite(v) && v >= 0) && vals[0] <= 20000;
}

/** Shared editable fields — used by manual entry, edit and AI confirmation. */
export function MealFields({ draft, onChange }: { draft: MealDraft; onChange: (d: MealDraft) => void }) {
  const set = (k: keyof MealDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, [k]: e.target.value });
  return (
    <div className="space-y-4">
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
      <Field label="Food">
        <TextInput value={draft.food_name} onChange={set("food_name")} placeholder="Chicken biryani" maxLength={200} />
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
    const payload = {
      food_name: d.food_name.trim(),
      serving_description: d.serving_description.trim() || null,
      calories: Math.round(num(d.calories)),
      protein: Math.round(num(d.protein) * 10) / 10,
      carbs: Math.round(num(d.carbs) * 10) / 10,
      fat: Math.round(num(d.fat) * 10) / 10,
      meal_type: d.meal_type,
      ai_confidence: d.ai_confidence,
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
  meal: Meal | null; // null = new manual meal
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
    if (!validDraft(draft)) return toast.error("Add a name and valid numbers first.");
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
    if (!meal || !confirm(`Delete “${meal.food_name}”?`)) return;
    setBusy(true);
    const { error } = await supabase.from("meals").delete().eq("id", meal.id);
    setBusy(false);
    if (error) return toast.error("Couldn't delete that meal. Please try again.");
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
            {!meal ? "Log it by hand — no photo needed." : `Logged by ${mine ? "you" : owner?.display_name}`}
          </DrawerDescription>

          <div className="mt-5">
            {editing ? (
              <MealFields draft={draft} onChange={setDraft} />
            ) : meal ? (
              <div className="space-y-4">
                {meal.serving_description && <p className="text-muted-foreground">{meal.serving_description}</p>}
                <div className="grid grid-cols-4 gap-2 rounded-2xl border border-border bg-card p-4 text-center">
                  {[
                    ["kcal", meal.calories],
                    ["protein", Number(meal.protein)],
                    ["carbs", Number(meal.carbs)],
                    ["fat", Number(meal.fat)],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <div className="num text-xl font-semibold">{fmt(v as number)}{l !== "kcal" && <span className="text-sm text-muted-foreground">g</span>}</div>
                      <div className="text-xs text-muted-foreground">{l}</div>
                    </div>
                  ))}
                </div>
                {meal.ai_confidence && (
                  <p className="text-xs text-muted-foreground">Estimated from a photo · {meal.ai_confidence} confidence</p>
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
