import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Utensils, WandSparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSpace } from "@/lib/space";
import { Btn, Screen, Eyebrow, TextInput } from "@/components/us/primitives";
import { Textarea } from "@/components/ui/textarea";
import { analyzeRecipe, deleteRecipe, getRecipes, logRecipe, saveRecipe, updateRecipe } from "@/lib/recipe.functions";
import { perServing, recipeTotals, scaleIngredientGrams, type RecipeIngredient, type RecipeRecord } from "@/lib/recipe";
import { defaultMealType, type MealType } from "@/lib/nutrition";


export const Route = createFileRoute("/_space/recipes")({
  component: RecipesView,
});

const ERRORS: Record<string, string> = {
  AI_LIMIT: "Recipe analysis limit reached for today.",
  AI_QUOTA_UNAVAILABLE: "Recipe analysis is temporarily unavailable.",
  AI_UNAVAILABLE: "Recipe analysis is not configured right now.",
  AI_BUSY: "Recipe analysis is busy. Try again in a moment.",
  AI_CREDITS: "Recipe analysis is unavailable from the provider right now.",
  AI_MALFORMED: "Couldn't parse that recipe reliably. Add clearer amounts and try again.",
  AI_FAILED: "Couldn't analyze that recipe. Try again.",
};

function manualIngredient(): RecipeIngredient {
  return {
    name: "", amountLabel: "1 serving", grams: null,
    calories: 0, protein: 0, carbs: 0, fat: 0,
    caloriesPer100g: null, proteinPer100g: null,
    carbsPer100g: null, fatPer100g: null,
    source: "manual", sourceRef: null, confidence: "low",
  };
}

function editIngredientNutrition(
  ingredient: RecipeIngredient,
  key: "calories" | "protein" | "carbs" | "fat",
  text: string,
): RecipeIngredient {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value) || value < 0) return ingredient;
  const per100Key = ({
    calories: "caloriesPer100g", protein: "proteinPer100g",
    carbs: "carbsPer100g", fat: "fatPer100g",
  } as const)[key];
  const per100 = ingredient.grams
    ? Math.round(value / ingredient.grams * 1000) / 10
    : null;
  return {
    ...ingredient, [key]: value, [per100Key]: per100,
    source: "manual", sourceRef: null, confidence: "low",
  };
}

function RecipesView() {
  const { me, today, upsertLocal } = useSpace();
  const queryClient = useQueryClient();

  const [createMode, setCreateMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [busy, setBusy] = useState(false);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [logDraft, setLogDraft] = useState<{
    recipeId: string; servings: string; mealDate: string; mealType: MealType;
  } | null>(null);

  const recipes = useQuery<RecipeRecord[]>({
    queryKey: ["recipes", me.id],
    queryFn: () => getRecipes(),
  });

  const totals = useMemo(() => perServing(recipeTotals(ingredients), Number(servings) || 1), [ingredients, servings]);

  function reset() {
    setEditingId(null);
    setDescription("");
    setName("");
    setServings("1");
    setIngredients([]);
  }

  function startEdit(recipe: RecipeRecord) {
    setEditingId(recipe.id);
    setName(recipe.name);
    setDescription("");
    setServings(String(recipe.servings));
    setIngredients(recipe.ingredients);
    setCreateMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function analyze() {
    if (description.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const result = await analyzeRecipe({ data: { description: description.trim() } });
      if (!result.ok) {
        toast.error(ERRORS[result.error] ?? "Couldn't analyze this recipe.");
        return;
      }
      setName(result.recipe.name);
      setServings(String(result.recipe.servings));
      setIngredients(result.recipe.ingredients);
      toast.success("Recipe analyzed. Review before saving.");
    } catch {
      toast.error("Couldn't analyze this recipe. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const count = Number(servings);
    if (busy) return;
    if (!name.trim()) return void toast.error("Give your recipe a name.");
    if (!Number.isFinite(count) || count < 0.25 || count > 100) {
      return void toast.error("Servings must be between 0.25 and 100.");
    }
    if (ingredients.length === 0 || ingredients.some((ingredient) => !ingredient.name.trim() || !ingredient.amountLabel.trim())) {
      return void toast.error("Add at least one named ingredient and its amount.");
    }
    setBusy(true);
    try {
      if (editingId) {
        await updateRecipe({ data: { recipeId: editingId, name: name.trim(), servings: count, ingredients } });
      } else {
        await saveRecipe({ data: { name: name.trim(), servings: count, ingredients } });
      }
      await queryClient.invalidateQueries({ queryKey: ["recipes", me.id] });
      toast.success(editingId ? "Recipe updated" : "Recipe saved");
      reset();
      setCreateMode(false);
    } catch {
      toast.error("Couldn't save this recipe.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteRecipe({ data: { recipeId: id } });
      await queryClient.invalidateQueries({ queryKey: ["recipes", me.id] });
      toast.success("Recipe deleted");
    } catch {
      toast.error("Couldn't delete recipe.");
    }
  }

  async function log(recipe: RecipeRecord) {
    if (loggingId || !logDraft || logDraft.recipeId !== recipe.id) return;
    const count = Number(logDraft.servings);
    if (!Number.isFinite(count) || count <= 0 || count > 20) {
      toast.error("Choose a portion between 0 and 20 servings.");
      return;
    }
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(logDraft.mealDate)) {
      toast.error("Choose a valid meal date.");
      return;
    }
    setLoggingId(recipe.id);
    try {
      const result = await logRecipe({
        data: {
          recipeId: recipe.id,
          servings: count,
          mealType: logDraft.mealType,
          mealDate: logDraft.mealDate,
        },
      });
      upsertLocal(result.meal);
      toast.success(`${recipe.name} logged · ${count} serving${count === 1 ? "" : "s"}`);
      setLogDraft(null);
    } catch {
      toast.error("Couldn't log recipe. Your saved recipe is unchanged.");
    } finally {
      setLoggingId(null);
    }
  }

  return (
    <Screen>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Eyebrow>My Recipes</Eyebrow>
          <Btn onClick={() => { if (createMode) { reset(); setCreateMode(false); } else { reset(); setCreateMode(true); } }}>
            <Plus className="mr-1 size-4" /> {createMode ? "Close" : "New Recipe"}
          </Btn>
        </div>

        {createMode && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <WandSparkles className="size-4 text-primary" />
              {editingId ? "Edit saved recipe" : "Create a recipe"}
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bulking shake: 2 bananas, 50g oats, 2 tbsp peanut butter, 250ml whole milk, 5 dates"
              className="min-h-24"
            />
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="outline" disabled={busy || description.trim().length < 3} onClick={() => void analyze()}>
                {busy ? "Analyzing…" : "Analyze with AI"}
              </Btn>
              <Btn variant="outline" disabled={busy || ingredients.length >= 30}
                onClick={() => setIngredients((items) => [...items, manualIngredient()])}>
                <Plus className="size-4" /> Add manually
              </Btn>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              AI is optional. You can add ingredients and their label values manually, review totals, then save.
            </p>

            {ingredients.length > 0 && (
              <div className="space-y-3 border-t border-border pt-3">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Servings</div>
                    <TextInput inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
                  </div>
                  <div className="rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">{Math.round(totals.calories)} kcal / serving</div>
                    <div>P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · F {Math.round(totals.fat)}g</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {ingredients.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="rounded-lg bg-secondary/70 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <TextInput aria-label={`Ingredient ${index + 1} name`}
                            value={item.name} placeholder="Ingredient name"
                            onChange={(e) => setIngredients((all) => all.map((v, i) =>
                              i === index ? { ...v, name: e.target.value } : v))} />
                          <TextInput aria-label={`Ingredient ${index + 1} amount`}
                            value={item.amountLabel} placeholder="e.g. 50 g or 1 cup"
                            onChange={(e) => setIngredients((all) => all.map((v, i) =>
                              i === index ? { ...v, amountLabel: e.target.value } : v))} />
                          <div className="text-xs text-muted-foreground">
                            {item.source === "USDA" ? "USDA database estimate" :
                             item.source === "manual" ? "Manually entered" : "AI estimate — verify nutrition"}
                          </div>
                        </div>
                        <button type="button" onClick={() => setIngredients((all) => all.filter((_, i) => i !== index))}
                          className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove ${item.name}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-[90px_1fr] items-center gap-2">
                        <TextInput
                          inputMode="decimal"
                          value={item.grams ?? ""}
                          placeholder="grams"
                          onChange={(e) => {
                            const grams = Number(e.target.value);
                            setIngredients((all) => all.map((current, i) =>
                              i === index && Number.isFinite(grams) && grams > 0
                                ? scaleIngredientGrams(current, grams)
                                : i === index ? { ...current, grams: null } : current,
                            ));
                          }}
                        />
                        <div className="text-right text-xs text-muted-foreground">
                          {Math.round(item.calories)} kcal · P {Math.round(item.protein)}g
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(["calories", "protein", "carbs", "fat"] as const).map((key) => (
                          <label key={key} className="block">
                            <span className="mb-1 block text-xs text-muted-foreground">
                              {key === "calories" ? "Calories" : `${key[0]!.toUpperCase() + key.slice(1)} (g)`}
                            </span>
                            <TextInput inputMode="decimal" aria-label={`Ingredient ${index + 1} ${key}`}
                              value={String(item[key])}
                              onChange={(e) => setIngredients((all) => all.map((v, i) =>
                                i === index ? editIngredientNutrition(v, key, e.target.value) : v))} />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Btn variant="ghost" className="flex-1" onClick={() => { setCreateMode(false); reset(); }}>Cancel</Btn>
                  <Btn className="flex-1" disabled={busy || !name.trim() || ingredients.length === 0} onClick={() => void save()}>
                    {busy ? "Saving…" : editingId ? "Save Changes" : "Save Recipe"}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {recipes.isPending ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading your recipes…</p>
          ) : recipes.isError ? (
            <div className="rounded-xl border border-border p-5 text-center">
              <p className="text-sm text-destructive">Could not load recipes. Your saved recipes haven't been erased.</p>
              <Btn variant="outline" className="mt-3" onClick={() => void recipes.refetch()}>Try again</Btn>
            </div>
          ) : (recipes.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <p>No recipes saved yet. Add one for meals or shakes you repeat.</p>
            </div>
          ) : (
            (recipes.data ?? []).map((recipe) => {
              const serving = perServing(recipeTotals(recipe.ingredients), recipe.servings);
              return (
                <div key={recipe.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{recipe.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {recipe.ingredients.length} items · {Math.round(serving.calories)} kcal · {Math.round(serving.protein)}g protein / serving
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Btn size="md" variant="outline" aria-label={`Edit ${recipe.name}`} onClick={() => startEdit(recipe)}>
                        <Pencil className="size-4" />
                      </Btn>
                      <Btn size="md" onClick={() => setLogDraft(current =>
                        current?.recipeId === recipe.id ? null : {
                          recipeId: recipe.id, servings: "1", mealDate: today, mealType: defaultMealType(),
                        }
                      )} disabled={Boolean(loggingId)}>
                        <Utensils className="mr-1 size-3.5" /> Log meal
                      </Btn>
                      <Btn variant="ghost" size="md" onClick={() => void remove(recipe.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Btn>
                    </div>
                  </div>
                  {logDraft?.recipeId === recipe.id && (
                    <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
                      <div className="text-sm font-medium">Log this saved recipe</div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs text-muted-foreground">
                          Servings eaten
                          <TextInput className="mt-1" type="number" inputMode="decimal"
                            min={0.01} max={20} step="any" value={logDraft.servings}
                            onChange={event => setLogDraft(d => d ? { ...d, servings: event.target.value } : d)} />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Meal date
                          <TextInput className="mt-1" type="date" value={logDraft.mealDate}
                            onChange={event => setLogDraft(d => d ? { ...d, mealDate: event.target.value } : d)} />
                        </label>
                      </div>
                      <label className="block text-xs text-muted-foreground">
                        Meal type
                        <select aria-label="Recipe meal type" value={logDraft.mealType}
                          onChange={event => setLogDraft(d => d ? { ...d, mealType: event.target.value as MealType } : d)}
                          className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground">
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="snack">Snack</option>
                          <option value="dinner">Dinner</option>
                        </select>
                      </label>
                      <div className="flex gap-2">
                        <Btn variant="ghost" className="flex-1" disabled={Boolean(loggingId)}
                          onClick={() => setLogDraft(null)}>Cancel</Btn>
                        <Btn className="flex-1" disabled={Boolean(loggingId)} onClick={() => void log(recipe)}>
                          {loggingId === recipe.id ? "Logging…" : "Add to diary"}
                        </Btn>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5 border-t border-border/50 pt-2">
                    {recipe.ingredients.map((item, index) => (
                      <div key={`${item.name}-${index}`} className="flex justify-between gap-3 rounded bg-secondary/50 px-2 py-1 text-xs">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">{item.amountLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>


      </div>
    </Screen>
  );
}
