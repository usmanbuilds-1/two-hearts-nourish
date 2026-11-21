import { useState } from "react";
import { MealEditorDialog } from "./MealEditorDialog";
import { Btn } from "@/components/us/primitives";
import { MealFields, emptyDraft, validDraft, type MealDraft } from "@/components/us/MealSheet";
import { storedMealMacros } from "@/lib/meal-portion";
import { useSpace } from "@/lib/space";
import { supabase } from "@/integrations/supabase/client";
import type { Meal, MealType } from "@/lib/nutrition";
import { toast } from "sonner";

export function DiarySheet({
  open,
  onOpenChange,
  targetDate,
  initialMealType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetDate: string;
  initialMealType?: MealType | null;
}) {
  const { me, room, upsertLocal } = useSpace();
  const [draft, setDraft] = useState<MealDraft>(() => ({ ...emptyDraft(), ...(initialMealType ? { meal_type: initialMealType } : {}) }));
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!validDraft(draft)) {
      toast.error("Add a name and valid numbers first.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("meals")
        .insert({
          room_id: room.id,
          member_id: me.id,
          meal_date: targetDate,
          food_name: draft.food_name.trim(),
          serving_description: draft.serving_description.trim() || null,
          ...storedMealMacros(draft),
          meal_type: draft.meal_type,
          ai_confidence: draft.ai_confidence,
        })
        .select()
        .single();
      if (error || !data) { console.error("[DiarySheet insert]", error); throw new Error(error?.message ?? "save"); }
      upsertLocal(data as Meal);
      toast.success("Meal logged");
      setDraft({ ...emptyDraft(), ...(initialMealType ? { meal_type: initialMealType } : {}) });
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save that meal — it wasn't added. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MealEditorDialog
      open={open}
      onOpenChange={value => { if (!busy) onOpenChange(value); }}
      title="Add a meal"
      description={`Log food for ${targetDate}.`}
      footer={(
        <Btn size="lg" className="w-full" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Log meal"}
        </Btn>
      )}
    >
      <MealFields draft={draft} onChange={setDraft} meId={me.id} isNew />
    </MealEditorDialog>
  );
}
