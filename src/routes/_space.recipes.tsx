import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Minus, Plus, Trash2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { useSpace } from "@/lib/space";
import { analyzeRecipe, deleteRecipe, getRecipes, logRecipe, saveRecipe } from "@/lib/recipe.functions";
import { bodyGoalLabel, perServing, recipeGoalFit, recipeTotals, scaleIngredientGrams, type RecipeIngredient, type RecipeRecord } from "@/lib/recipe";
import { getMealTemplates, type MealTemplate } from "@/lib/meal-operations.functions";
import { Btn, Eyebrow, Screen, TextInput } from "@/components/us/primitives";
import { Textarea } from "@/components/ui/textarea";
import { defaultMealType } from "@/lib/nutrition";
import { ScienceNote } from "@/components/us/ScienceNote";

export const Route = createFileRoute("/_space/recipes")({
  head: () => ({
    meta: [
      { title: "Recipes — Us" },
      { name: "description", content: "Build a recipe once and log a serving in seconds." },
    ],
  }),
  component: RecipesView,
});

const ANALYZE_ERRORS: Record<string, string> = {
  AI_LIMIT: "Recipe analysis limit reached for today. You can still log food manually.",
  AI_QUOTA_UNAVAILABLE: "Recipe analysis is temporarily unavailable. Your saved recipes still work.",
  AI_UNAVAILABLE: "Recipe analysis is not configured right now.",
  AI_BUSY: "Recipe analysis is busy. Try again in a moment.",
  AI_CREDITS: "Recipe analysis is unavailable from the provider right now.",
  AI_MALFORMED: "We couldn't turn that description into a reliable recipe. Add clearer amounts and try again.",
  AI_FAILED: "Recipe analysis failed. Check your connection and try again.",
};

function goalTone(tone: "good" | "neutral" | "watch") {
  if (tone === "good") return "border-primary/30 bg-primary/8 text-primary";
  if (tone === "watch") return "border-border bg-secondary text-foreground";
  return "border-border bg-card text-muted-foreground";
}

function MacroRow({ calories, protein, carbs, fat }: { calories: number; protein: number; carbs: number; fat: number }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {[
        ["kcal", Math.round(calories)],
        ["protein", `${Math.round(protein)}g`],
        ["carbs", `${Math.round(carbs)}g`],
        ["fat", `${Math.round(fat)}g`],
      ].map(([label, value], index) => (
        <div key={label} className={index === 0 ? "col-span-1" : ""}>
          <div className="num text-lg font-semibold">{value}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}

function RecipesView() {
  const { me, today, upsertLocal } = useSpace();
  const qc = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [logBusy, setLogBusy] = useState<string | null>(null);
  const [logServings, setLogServings] = useState<Record<string, number>>({});

  const recipes = useQuery<RecipeRecord[]>({
    queryKey: ["recipes", me.id],
    queryFn: () => getRecipes(),
  });
  const legacy = useQuery<MealTemplate[]>({
    queryKey: ["meal-templates"],
    queryFn: () => getMealTemplates(),
  });

  const draftTotals = useMemo(() => recipeTotals(ingredients), [ingredients]);
  const draftPerServing = useMemo(() => perServing(draftTotals, servings), [draftTotals, servings]);
  const draftFit = recipeGoalFit(draftPerServing, me);

  function resetDraft() {
    setDescription("");
    setDraftName("");
    setServings(1);
    setIngredients([]);
  }

  async function analyze() {
    if (description.trim().length < 3 || analyzing) return;
    setAnalyzing(true);
    try {
      const result = await analyzeRecipe({ data: { description: description.trim() } });
      if (!result.ok) {
        toast.error(ANALYZE_ERRORS[result.error] ?? "Couldn't analyze this recipe. Try clearer amounts.");
        return;
      }
      setDraftName(result.recipe.name);
      setServings(result.recipe.servings);
      setIngredients(result.recipe.ingredients);
      toast.success("Recipe analyzed. Review the ingredients before saving.");
    } catch {
      toast.error("Couldn't analyze this recipe. Check your connection and try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    if (!draftName.trim() || ingredients.length === 0 || saving) return;
    setSaving(true);
    try {
      await saveRecipe({
        data: {
          name: draftName.trim(),
          servings,
          ingredients,
        },
      });
      await qc.invalidateQueries({ queryKey: ["recipes", me.id] });
      toast.success("Recipe saved");
      resetDraft();
      setComposerOpen(false);
    } catch {
      toast.error("Couldn't save this recipe. Review the ingredients and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRecipe(recipeId: string) {
    try {
      await deleteRecipe({ data: { recipeId } });
      await qc.invalidateQueries({ queryKey: ["recipes", me.id] });
      toast.success("Recipe deleted");
    } catch {
      toast.error("Couldn't delete this recipe.");
    }
  }

  async function logSaved(recipe: RecipeRecord) {
    if (logBusy) return;
    const amount = Math.max(0.25, Math.min(20, logServings[recipe.id] ?? 1));
    setLogBusy(recipe.id);
    try {
      const result = await logRecipe({
        data: {
          recipeId: recipe.id,
          servings: amount,
          mealType: defaultMealType(),
          mealDate: today,
        },
      });
      upsertLocal(result.meal);
      toast.success(`${recipe.name} logged`);
    } catch {
      toast.error("Couldn't log this recipe. Try again.");
    } finally {
      setLogBusy(null);
    }
  }

  const savedRecipes = recipes.data ?? [];
  const showComposer = composerOpen || savedRecipes.length === 0;

  return (
    <Screen>
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Recipes</Eyebrow>
            <h1 className="mt-2 font-display text-4xl font-normal tracking-tight">Build once. Log fast.</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Describe the whole recipe. We split the ingredients, ground nutrition where possible, and let you review every number.
            </p>
          </div>
          <Link to="/today" className="min-h-11 shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground">
            Today
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border bg-card px-3 py-1.5">
            Goal · <span className="font-medium text-foreground">{bodyGoalLabel(me.body_goal)}</span>
          </span>
          {me.daily_calorie_target ? (
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {Math.round(me.daily_calorie_target).toLocaleString()} kcal/day
            </span>
          ) : null}
          {me.daily_protein_target ? (
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {Math.round(Number(me.daily_protein_target))}g protein/day
            </span>
          ) : null}
        </div>
      </header>

      <div className="mt-6">
        {!showComposer ? (
          <Btn size="lg" className="w-full" onClick={() => setComposerOpen(true)}>
            <Plus className="size-4" /> Create recipe
          </Btn>
        ) : (
          <section className="rounded-3xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <WandSparkles className="size-4 text-primary" aria-hidden="true" />
              <h2 className="font-medium">Describe your recipe</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Include amounts when you know them. You can edit grams after analysis.
            </p>
            <Textarea
              className="mt-4 min-h-28 resize-none rounded-2xl bg-background text-base"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Bulking shake: 2 bananas, 50g oats, 2 tbsp peanut butter, 250ml whole milk, 5 dates"
            />
            <div className="mt-3 flex gap-2">
              {savedRecipes.length > 0 && (
                <Btn variant="ghost" className="flex-1" onClick={() => { setComposerOpen(false); resetDraft(); }}>
                  Cancel
                </Btn>
              )}
              <Btn className="flex-1" disabled={description.trim().length < 3 || analyzing} onClick={() => void analyze()}>
                {analyzing ? "Analyzing…" : "Analyze recipe"}
              </Btn>
            </div>

            {ingredients.length > 0 && (
              <div className="mt-6 border-t border-border pt-5">
                <div className="grid gap-3 min-[390px]:grid-cols-[1fr_110px]">
                  <label>
                    <span className="mb-1.5 block text-xs text-muted-foreground">Recipe name</span>
                    <TextInput value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={100} />
                  </label>
                  <div>
                    <span className="mb-1.5 block text-xs text-muted-foreground">Makes</span>
                    <div className="flex h-12 items-center justify-between rounded-xl border border-input bg-background px-2">
                      <button
                        type="button"
                        className="flex size-10 items-center justify-center rounded-full hover:bg-secondary"
                        onClick={() => setServings((value) => Math.max(0.25, Math.round((value - 0.25) * 4) / 4))}
                        aria-label="Decrease recipe servings"
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="num font-semibold">{servings}</span>
                      <button
                        type="button"
                        className="flex size-10 items-center justify-center rounded-full hover:bg-secondary"
                        onClick={() => setServings((value) => Math.min(100, Math.round((value + 0.25) * 4) / 4))}
                        aria-label="Increase recipe servings"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Per serving</div>
                      <div className="num mt-1 text-3xl font-semibold">{Math.round(draftPerServing.calories)} kcal</div>
                    </div>
                    <div className={`rounded-full border px-3 py-1.5 text-xs font-medium ${goalTone(draftFit.tone)}`}>
                      {draftFit.label}
                    </div>
                  </div>
                  <div className="mt-4">
                    <MacroRow {...draftPerServing} />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{draftFit.detail}</p>
                </div>

                <div className="mt-5">
                  <div className="flex items-end justify-between">
                    <div>
                      <Eyebrow>Ingredients</Eyebrow>
                      <p className="mt-1 text-xs text-muted-foreground">Review estimates before saving.</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{ingredients.length} items</span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {ingredients.map((item, index) => (
                      <div key={`${item.name}-${index}`} className="rounded-2xl border border-border bg-background p-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{item.amountLabel}</span>
                              <span aria-hidden="true">·</span>
                              <span className={item.source === "USDA" ? "text-primary" : ""}>
                                {item.source === "USDA" ? "USDA" : "Estimate — review"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label={`Remove ${item.name}`}
                            onClick={() => setIngredients((items) => items.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-[100px_1fr] items-end gap-3">
                          <label>
                            <span className="mb-1 block text-[11px] text-muted-foreground">Grams</span>
                            <TextInput
                              inputMode="decimal"
                              value={item.grams ?? ""}
                              placeholder="—"
                              onChange={(event) => {
                                const grams = Number(event.target.value);
                                setIngredients((items) => items.map((current, i) =>
                                  i === index && Number.isFinite(grams) && grams > 0
                                    ? scaleIngredientGrams(current, grams)
                                    : i === index ? { ...current, grams: null } : current,
                                ));
                              }}
                            />
                          </label>
                          <div className="pb-1 text-right text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{Math.round(item.calories)} kcal</span>
                            {" · "}P {Math.round(item.protein)}g · C {Math.round(item.carbs)}g · F {Math.round(item.fat)}g
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Btn
                  size="lg"
                  className="mt-5 w-full"
                  disabled={saving || ingredients.length === 0 || !draftName.trim()}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save recipe"}
                </Btn>
              </div>
            )}
          </section>
        )}
      </div>

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow>Saved</Eyebrow>
            <h2 className="mt-1 font-display text-2xl">Your recipes</h2>
          </div>
          {recipes.isFetching && <span className="text-xs text-muted-foreground">Updating…</span>}
        </div>

        {recipes.isError ? (
          <div className="mt-4 rounded-2xl border border-border p-4 text-sm">
            <p>Couldn't load your recipes.</p>
            <button className="mt-2 min-h-11 font-medium text-primary" onClick={() => void recipes.refetch()}>Try again</button>
          </div>
        ) : savedRecipes.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-5">
            <h3 className="font-medium">No saved recipes yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Start with a shake, smoothie, sandwich, curry, or any meal you repeat.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {savedRecipes.map((recipe) => {
              const serving = perServing(recipeTotals(recipe.ingredients), recipe.servings);
              const fit = recipeGoalFit(serving, me);
              const amount = logServings[recipe.id] ?? 1;
              return (
                <article key={recipe.id} className="rounded-3xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-2xl">{recipe.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {recipe.ingredients.length} ingredients · recipe makes {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label={`Delete ${recipe.name}`}
                      onClick={() => void removeRecipe(recipe.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="mt-4">
                    <MacroRow {...serving} />
                  </div>

                  <div className="mt-3 flex items-start gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${goalTone(fit.tone)}`}>
                      {fit.label}
                    </span>
                    <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{fit.detail}</p>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <div className="flex h-11 items-center rounded-full border border-input bg-background px-1">
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
                        aria-label="Decrease servings to log"
                        onClick={() => setLogServings((current) => ({
                          ...current,
                          [recipe.id]: Math.max(0.25, Math.round((amount - 0.25) * 4) / 4),
                        }))}
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="num min-w-10 text-center text-sm">{amount}×</span>
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
                        aria-label="Increase servings to log"
                        onClick={() => setLogServings((current) => ({
                          ...current,
                          [recipe.id]: Math.min(20, Math.round((amount + 0.25) * 4) / 4),
                        }))}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <Btn className="flex-1" disabled={Boolean(logBusy)} onClick={() => void logSaved(recipe)}>
                      {logBusy === recipe.id ? "Logging…" : "Log serving"}
                    </Btn>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {(legacy.data?.length ?? 0) > 0 && (
        <details className="mt-8 rounded-2xl border border-border bg-card p-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium">
            Older saved meal sets
            <ChevronDown className="size-4 text-muted-foreground" />
          </summary>
          <p className="mt-1 text-xs text-muted-foreground">These are preserved from the previous recipe tool.</p>
          <div className="mt-3 space-y-2">
            {legacy.data!.map((template) => (
              <div key={template.id} className="rounded-xl bg-secondary/60 p-3 text-sm">
                <div className="font-medium">{template.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{template.meals.length} saved food items</div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-8">
        <ScienceNote goal={me.body_goal} day={today} />
      </div>
    </Screen>
  );
}
