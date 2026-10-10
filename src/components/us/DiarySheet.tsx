import { useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Btn, TextInput, Field } from "@/components/us/primitives";
import { insertMeal } from "@/lib/space";
import { toast } from "sonner";

export function DiarySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [foodName, setFoodName] = useState("");
  const [servingDescription, setServingDescription] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [mealType, setMealType] = useState("lunch");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!foodName.trim() || !calories) {
      toast.error("Food name and calories required");
      return;
    }
    setLoading(true);
    try {
      await insertMeal({
        food_name: foodName,
        serving_description: servingDescription || null,
        calories: parseInt(calories),
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
        meal_type: mealType,
        meal_date: new Date().toISOString().split("T")[0],
      });
      toast.success("Meal added");
      onOpenChange(false);
      setFoodName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
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
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="snack">Snack</option>
              <option value="dinner">Dinner</option>
            </select>
          </Field>
          <Field label="Food Name">
            <TextInput
              placeholder="e.g., Chicken breast"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
            />
          </Field>
          <Field label="Serving (optional)">
            <TextInput
              placeholder="e.g., 150g"
              value={servingDescription}
              onChange={(e) => setServingDescription(e.target.value)}
            />
          </Field>
          <Field label="Calories">
            <TextInput
              type="number"
              placeholder="0"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Protein (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
            </Field>
            <Field label="Carbs (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
              />
            </Field>
            <Field label="Fat (g)">
              <TextInput
                type="number"
                placeholder="0"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
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
