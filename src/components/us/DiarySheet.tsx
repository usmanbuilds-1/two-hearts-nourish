import { useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Btn, TextInput, Field } from "@/components/us/primitives";
import { useSaveMeal, emptyDraft, type MealDraft } from "@/components/us/MealSheet";
import { MEAL_TYPES, type MealType } from "@/lib/nutrition";
import { toast } from "sonner";

export function DiarySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const saveMeal = useSaveMeal();
  const [draft, setDraft] = useState<MealDraft>(emptyDraft());
  const [loading, setLoading] = useState(false);

  const set = (patch: Partial<MealDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const handleAdd = async () => {
    if (!draft.food_name.trim() || !draft.calories) {
      toast.error("Food name and calories required");
      return;
    }
    setLoading(true);
    try {
      await saveMeal(draft);
      toast.success("Meal added");
      onOpenChange(false);
      setDraft(emptyDraft());
    } catch {
      toast.error("Failed to add meal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Meal</DrawerTitle>
          <DrawerDescription>Quick entry for your diary</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 space-y-3">
          <Field label="Meal Type">
            <select
              value={draft.meal_type}
              onChange={(e) => set({ meal_type: e.target.value as MealType })}
              className="w-full px-3 py-2 border rounded-lg bg-background"
            >
              {MEAL_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Food Name">
            <TextInput
              placeholder="e.g., Chicken breast"
              value={draft.food_name}
              onChange={(e) => set({ food_name: e.target.value })}
            />
          </Field>
          <Field label="Serving (optional)">
            <TextInput
              placeholder="e.g., 150g"
              value={draft.serving_description}
              onChange={(e) => set({ serving_description: e.target.value })}
            />
          </Field>
          <Field label="Calories">
            <TextInput
              type="number"
              placeholder="0"
              value={draft.calories}
              onChange={(e) => set({ calories: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Protein (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={draft.protein}
                onChange={(e) => set({ protein: e.target.value })}
              />
            </Field>
            <Field label="Carbs (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={draft.carbs}
                onChange={(e) => set({ carbs: e.target.value })}
              />
            </Field>
            <Field label="Fat (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={draft.fat}
                onChange={(e) => set({ fat: e.target.value })}
              />
            </Field>
          </div>
          <Btn onClick={handleAdd} disabled={loading} className="w-full">
            {loading ? "Adding..." : "Add Meal"}
          </Btn>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
