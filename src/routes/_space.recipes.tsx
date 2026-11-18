import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Trash2, Utensils, WandSparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSpace } from "@/lib/space";
import { Btn, Screen, Eyebrow, TextInput } from "@/components/us/primitives";
import { Textarea } from "@/components/ui/textarea";
import { analyzeRecipe, deleteRecipe, getRecipes, logRecipe, saveRecipe } from "@/lib/recipe.functions";
import { perServing, recipeTotals, scaleIngredientGrams, type RecipeIngredient, type RecipeRecord } from "@/lib/recipe";
import { defaultMealType } from "@/lib/nutrition";
import { ScienceNote } from "@/components/us/ScienceNote";

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

function RecipesView() {
  const { me, today, upsertLocal } = useSpace();
  const queryClient = useQueryClient();

  const [createMode, setCreateMode] = useState(false);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [busy, setBusy] = useState(false);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const recipes = useQuery<RecipeRecord[]>({
    queryKey: ["recipes", me.id],
    queryFn: () => getRecipes(),
  });

  const totals = useMemo(() => perServing(recipeTotals(ingredients), Number(servings) || 1), [ingredients, servings]);

  function reset() {
    setDescription("");
    setName("");
    setServings("1");
    setIngredients([]);
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
    if (!name.trim() || !Number.isFinite(count) || count <= 0 || ingredients.length === 0 || busy) return;
    setBusy(true);
    try {
      await saveRecipe({ data: { name: name.trim(), servings: count, ingredients } });
      await queryClient.invalidateQueries({ queryKey: ["recipes", me.id] });
      toast.success("Recipe saved");
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
    if (loggingId) return;
    setLoggingId(recipe.id);
    try {
      const result = await logRecipe({
        data: { recipeId: recipe.id, servings: 1, mealType: defaultMealType(), mealDate: today },
      });
      upsertLocal(result.meal);
      toast.success(`${recipe.name} logged`);
    } catch {
      toast.error("Couldn't log recipe.");
    } finally {
      setLoggingId(null);
    }
  }

  return (
    <Screen>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Eyebrow>My Recipes</Eyebrow>
          <Btn onClick={() => { setCreateMode((v) => !v); if (createMode) reset(); }}>
            <Plus className="mr-1 size-4" /> New Recipe
          </Btn>
        </div>

        {createMode && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <WandSparkles className="size-4 text-primary" />
              Smart recipe adder
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bulking shake: 2 bananas, 50g oats, 2 tbsp peanut butter, 250ml whole milk, 5 dates"
              className="min-h-24"
            />
            <Btn className="w-full" disabled={busy || description.trim().length < 3} onClick={() => void analyze()}>
              {busy && ingredients.length === 0 ? "Analyzing…" : "Analyze recipe"}
            </Btn>

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
                        <div>
                          <div className="text-sm font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.amountLabel} · {item.source === "USDA" ? "USDA" : "estimate"}
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
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Btn variant="ghost" className="flex-1" onClick={() => { setCreateMode(false); reset(); }}>Cancel</Btn>
                  <Btn className="flex-1" disabled={busy || !name.trim() || ingredients.length === 0} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save Recipe"}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {(recipes.data ?? []).length === 0 ? (
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
                      <Btn size="md" onClick={() => void log(recipe)} disabled={Boolean(loggingId)}>
                        <Utensils className="mr-1 size-3.5" /> {loggingId === recipe.id ? "…" : "Log Today"}
                      </Btn>
                      <Btn variant="ghost" size="md" onClick={() => void remove(recipe.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Btn>
                    </div>
                  </div>
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

        <ScienceNote goal={me.body_goal} day={today} />
      </div>
    </Screen>
  );
}
