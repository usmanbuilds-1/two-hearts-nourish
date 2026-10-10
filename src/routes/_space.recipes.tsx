import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Utensils, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMealTemplates, deleteMealTemplate, saveMealTemplate } from "@/lib/meal-operations.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSpace } from "@/lib/space";
import { Btn, Screen, Eyebrow, TextInput } from "@/components/us/primitives";
import { MealType } from "@/lib/nutrition";
import { toast } from "sonner";

export const Route = createFileRoute("/_space/recipes")({
  component: RecipesView,
});

function RecipesView() {
  const queryClient = useQueryClient();
  const { me, room, upsertLocal } = useSpace();
  const [newRecipeName, setNewRecipeName] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [addingMealTo, setAddingMealTo] = useState<string | null>(null);

  // New item form state inside recipe
  const [itemFoodName, setItemFoodName] = useState("");
  const [itemCalories, setItemCalories] = useState("");
  const [itemProtein, setItemProtein] = useState("");
  const [itemCarbs, setItemCarbs] = useState("");
  const [itemFat, setItemFat] = useState("");
  const [itemMealType, setItemMealType] = useState<MealType>("lunch");

  const { data: templates = [] } = useQuery({
    queryKey: ["meal-templates"],
    queryFn: () => getMealTemplates(),
  });

  const handleCreateRecipe = async () => {
    if (!newRecipeName.trim()) {
      toast.error("Recipe name required");
      return;
    }
    try {
      await saveMealTemplate({
        data: {
          name: newRecipeName,
          meals: [],
        },
      });
      queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      setNewRecipeName("");
      setCreateMode(false);
      toast.success("Recipe created");
    } catch (err) {
      toast.error("Failed to create recipe");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMealTemplate({ data: { templateId: id } });
      queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      toast.success("Recipe deleted");
    } catch (err) {
      toast.error("Failed to delete recipe");
    }
  };

  const handleAddItemToRecipe = async (templateId: string, currentMeals: any[], recipeName: string) => {
    if (!itemFoodName.trim()) {
      toast.error("Food name required");
      return;
    }
    const newItem = {
      food_name: itemFoodName.trim(),
      calories: Number(itemCalories) || 0,
      protein: Number(itemProtein) || 0,
      carbs: Number(itemCarbs) || 0,
      fat: Number(itemFat) || 0,
      meal_type: itemMealType,
    };

    try {
      // delete existing template and resave with new item
      await deleteMealTemplate({ data: { templateId } });
      await saveMealTemplate({
        data: {
          name: recipeName,
          meals: [...currentMeals, newItem],
        },
      });
      queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      setAddingMealTo(null);
      setItemFoodName("");
      setItemCalories("");
      setItemProtein("");
      setItemCarbs("");
      setItemFat("");
      toast.success("Item added to recipe");
    } catch (err) {
      toast.error("Failed to add item to recipe");
    }
  };

  const handleLogRecipe = async (recipe: (typeof templates)[0]) => {
    if (!recipe.meals || recipe.meals.length === 0) {
      toast.error("Recipe has no items to log");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    try {
      for (const item of recipe.meals) {
        const { data, error } = await supabase
          .from("meals")
          .insert({
            room_id: room.id,
            member_id: me.id,
            meal_date: today,
            food_name: item.food_name,
            calories: Math.round(item.calories || 0),
            protein: Math.round((item.protein || 0) * 10) / 10,
            carbs: Math.round((item.carbs || 0) * 10) / 10,
            fat: Math.round((item.fat || 0) * 10) / 10,
            meal_type: item.meal_type ?? "lunch",
            serving_description: `From recipe: ${recipe.name}`,
          })
          .select()
          .single();

        if (error || !data) throw error;
        upsertLocal(data as any);
      }
      toast.success(`Logged "${recipe.name}" to today's meals ❤️`);
    } catch (err) {
      toast.error("Failed to log recipe items");
    }
  };

  return (
    <Screen>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Eyebrow>My Recipes</Eyebrow>
          <Btn onClick={() => setCreateMode(!createMode)}>
            <Plus className="w-4 h-4 mr-1" /> New Recipe
          </Btn>
        </div>

        {createMode && (
          <div className="p-3 bg-secondary rounded-lg space-y-2 border border-border">
            <TextInput
              placeholder="Recipe name (e.g. Protein Smoothie Bowl)"
              value={newRecipeName}
              onChange={(e) => setNewRecipeName(e.target.value)}
            />
            <div className="flex gap-2">
              <Btn onClick={handleCreateRecipe} className="flex-1">
                Create
              </Btn>
              <Btn onClick={() => setCreateMode(false)} variant="ghost" className="flex-1">
                Cancel
              </Btn>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <p>No recipes saved yet. Create recipes for your favorite multi-item meals!</p>
            </div>
          ) : (
            templates.map((t) => {
              const totalKcal = t.meals.reduce((acc, m) => acc + (m.calories || 0), 0);
              const totalProtein = t.meals.reduce((acc, m) => acc + (m.protein || 0), 0);

              return (
                <div key={t.id} className="p-4 bg-card rounded-xl border border-border space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-base">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.meals.length} items • {totalKcal} kcal • {totalProtein}g protein
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Btn size="sm" onClick={() => handleLogRecipe(t)} className="text-xs">
                        <Utensils className="w-3.5 h-3.5 mr-1" /> Log Today
                      </Btn>
                      <Btn variant="ghost" size="sm" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Btn>
                    </div>
                  </div>

                  {/* Recipe items list */}
                  {t.meals.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-border/50">
                      {t.meals.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-secondary/50">
                          <span className="font-medium">{m.food_name}</span>
                          <span className="text-muted-foreground">
                            {m.calories} kcal | P: {m.protein}g | C: {m.carbs}g | F: {m.fat}g
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add item to recipe section */}
                  {addingMealTo === t.id ? (
                    <div className="p-3 bg-secondary/80 rounded-lg space-y-2 text-xs">
                      <TextInput
                        placeholder="Food name (e.g. Oats)"
                        value={itemFoodName}
                        onChange={(e) => setItemFoodName(e.target.value)}
                      />
                      <div className="grid grid-cols-4 gap-1.5">
                        <TextInput
                          placeholder="Calories"
                          type="number"
                          value={itemCalories}
                          onChange={(e) => setItemCalories(e.target.value)}
                        />
                        <TextInput
                          placeholder="Protein"
                          type="number"
                          value={itemProtein}
                          onChange={(e) => setItemProtein(e.target.value)}
                        />
                        <TextInput
                          placeholder="Carbs"
                          type="number"
                          value={itemCarbs}
                          onChange={(e) => setItemCarbs(e.target.value)}
                        />
                        <TextInput
                          placeholder="Fat"
                          type="number"
                          value={itemFat}
                          onChange={(e) => setItemFat(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Btn size="sm" onClick={() => handleAddItemToRecipe(t.id, t.meals, t.name)} className="flex-1">
                          <Check className="w-3.5 h-3.5 mr-1" /> Save Item
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setAddingMealTo(null)} className="flex-1">
                          Cancel
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingMealTo(t.id)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Food Item to Recipe
                    </Btn>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Screen>
  );
}
