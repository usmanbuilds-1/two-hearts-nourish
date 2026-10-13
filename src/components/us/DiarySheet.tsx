import { useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Btn, Field, TextInput } from "@/components/us/primitives";
import { MealFields, emptyDraft, validDraft, type MealDraft } from "@/components/us/MealSheet";
import { useSpace } from "@/lib/space";
import { supabase } from "@/integrations/supabase/client";
import type { Meal } from "@/lib/nutrition";
import { toast } from "sonner";

export function DiarySheet({
  open,
  onOpenChange,
  targetDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetDate: string;
}) {
  const { me, room, upsertLocal } = useSpace();
  const [draft, setDraft] = useState<MealDraft>(emptyDraft());
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
          calories: Math.round(Number(draft.calories)),
          protein: Math.round(Number(draft.protein) * 10) / 10,
          carbs: Math.round(Number(draft.carbs) * 10) / 10,
          fat: Math.round(Number(draft.fat) * 10) / 10,
          meal_type: draft.meal_type,
          ai_confidence: draft.ai_confidence,
        })
        .select()
        .single();
      if (error || !data) { console.error("[DiarySheet insert]", error); throw new Error(error?.message ?? "save"); }
      upsertLocal(data as Meal);
      toast.success("Added ❤️");
      setDraft(emptyDraft());
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save that meal — it wasn't added. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-xl border-border bg-background">
        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <DrawerTitle className="font-display text-2xl font-normal">Add a meal</DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-muted-foreground">
            Type a description and tap ✨ to auto-fill macros, or enter manually.
          </DrawerDescription>
          <div className="mt-5">
            <MealFields draft={draft} onChange={setDraft} meId={me.id} isNew />
          </div>
          <div className="mt-6">
            <Btn size="lg" className="w-full" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Add meal ❤️"}
            </Btn>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
