import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImageIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Btn, Field, TextInput } from "./primitives";
import { compressImage, contextFingerprint, perceptualImageHash, uploadMealPhoto } from "@/lib/image";
import { useSpace } from "@/lib/space";
import { MEAL_TYPES, defaultMealType, type MealType } from "@/lib/nutrition";
import {
  analyzeFoodV2,
  reportScanCorrection,
  type ScannerV2Component,
  type ScannerV2Estimate,
} from "@/lib/scan-v2.functions";
import { applyScanContext } from "@/lib/scan-context.functions";
import {
  attachMyMealPhoto,
  saveScannedMealV2,
} from "@/lib/scanned-meal.functions";
import { saveFavoriteMeal } from "@/lib/meal-operations.functions";
import { searchPackagedFoods } from "@/lib/food-catalog.functions";
import {
  detectedTotalGrams,
  packageSearchQuery,
  scalePackagedLabel,
  strictPackageMatch,
} from "@/lib/packaged-scan";
import type { PackagedFood } from "@/lib/off-food";
import { FoodSearchSheet } from "./FoodSearchSheet";
import { BarcodeScanner } from "./BarcodeScanner";
import { scanNutritionLabel } from "@/lib/nutrition-label.functions";
import type { ScanSheetProps } from "./ScanSheet";

type Stage = "pick" | "preview" | "analyzing" | "confirm" | "error";

const ERRORS: Record<string, string> = {
  AI_BUSY: "Scanning is busy right now. Try again in a moment or add the meal manually.",
  AI_LIMIT: "Today's scan allowance is used up. Manual logging still works.",
  AI_QUOTA_UNAVAILABLE: "The scan budget safety check is unavailable, so no AI request was sent.",
  AI_CREDITS: "Photo scanning is paused by the provider. Manual logging still works.",
  NOT_MEMBER: "Your session needs to reconnect before scanning.",
  INVALID_IMAGE: "That image could not be verified. Try another photo.",
  V2_DISABLED: "The safer scanner is not enabled on the server yet.",
  V2_STORAGE_UNAVAILABLE: "Scanner safety storage is unavailable, so the AI request was stopped.",
  LABEL_INCOMPLETE: "Some nutrition values are not visible enough to trust. Enter them manually from the package.",
  LABEL_MALFORMED: "The nutrition panel could not be read safely. Try a clearer photo.",
};

function cloneComponents(items: ScannerV2Component[]) {
  return items.map((item) => ({ ...item, packaged_food: item.packaged_food ? { ...item.packaged_food } : null }));
}

function sum(items: ScannerV2Component[]) {
  return items.reduce((total, item) => ({
    calories: total.calories + Number(item.calories || 0),
    protein: total.protein + Number(item.protein || 0),
    carbs: total.carbs + Number(item.carbs || 0),
    fat: total.fat + Number(item.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function correctionPayload(item: ScannerV2Component) {
  return {
    food_name: item.label || "(missing)",
    serving_description: item.serving_description || "",
    calories: Number(item.calories || 0),
    protein: Number(item.protein || 0),
    carbs: Number(item.carbs || 0),
    fat: Number(item.fat || 0),
    grams: item.grams_estimate ?? null,
  };
}

export function ScanSheetV2({ open, onOpenChange, onManual }: ScanSheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const originalRef = useRef<ScannerV2Component[]>([]);

  const [stage, setStage] = useState<Stage>("pick");
  const [image, setImage] = useState<string | null>(null);
  const [secondImage, setSecondImage] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<ScannerV2Estimate | null>(null);
  const [components, setComponents] = useState<ScannerV2Component[]>([]);
  const [foodName, setFoodName] = useState("");
  const [servingDescription, setServingDescription] = useState("");
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  const [contextText, setContextText] = useState("");
  const [applyingContext, setApplyingContext] = useState(false);
  const [keepPhoto, setKeepPhoto] = useState(false);
  const [rememberPortion, setRememberPortion] = useState(false);
  const [foodSearchOpen, setFoodSearchOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [packageGrams, setPackageGrams] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const { room, me, today, upsertLocal } = useSpace();
  const queryClient = useQueryClient();
  const totals = useMemo(() => sum(components), [components]);

  useEffect(() => {
    if (!open) {
      requestRef.current += 1;
      setStage("pick");
      setImage(null);
      setSecondImage(null);
      setEstimate(null);
      setComponents([]);
      originalRef.current = [];
      setFoodName("");
      setServingDescription("");
      setMealType(defaultMealType());
      setContextText("");
      setKeepPhoto(false);
      setRememberPortion(false);
      setPackageGrams("");
      setFoodSearchOpen(false);
      setBarcodeOpen(false);
    }
  }, [open]);

  async function loadPhoto(file: File, secondary = false) {
    try {
      const compressed = await compressImage(file);
      if (secondary) {
        setSecondImage(compressed);
        toast.success("Second angle added");
      } else {
        requestRef.current += 1;
        setImage(compressed);
        setSecondImage(null);
        setStage("preview");
      }
    } catch {
      toast.error("Couldn't read that photo. Try another one?");
    }
  }

  async function filePicked(event: React.ChangeEvent<HTMLInputElement>, secondary = false) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await loadPhoto(file, secondary);
  }

  function setFromEstimate(next: ScannerV2Estimate) {
    setEstimate(next);
    const copied = cloneComponents(next.components);
    setComponents(copied);
    originalRef.current = cloneComponents(next.components);
    setFoodName(next.food_name);
    setServingDescription(next.serving_description);
    const packageTotal = detectedTotalGrams(next.packaged_food ?? null);
    setPackageGrams(packageTotal == null ? "" : String(packageTotal));
    setStage("confirm");
  }

  function setError(error: string) {
    setErrMsg(ERRORS[error] ?? "Couldn't analyze that meal safely. Try another photo or add it manually.");
    setStage("error");
  }

  async function maybeGroundExactPackage(next: ScannerV2Estimate) {
    const detected = next.packaged_food;
    const grams = detectedTotalGrams(detected ?? null);
    if (!detected?.brand || !detected.product || grams == null) return;
    try {
      const result = await searchPackagedFoods({ data: { query: packageSearchQuery(detected) } });
      if (!result.ok) return;
      const exact = strictPackageMatch(detected, result.foods);
      if (exact) applyPackagedFood(exact, grams);
    } catch {
      // Package grounding is optional; the reviewed scan remains available.
    }
  }

  async function runAnalyze(extraContext = "") {
    if (!image) return;
    const request = ++requestRef.current;
    setStage("analyzing");
    try {
      const [imageHash, contextHash] = await Promise.all([
        secondImage ? Promise.resolve<string | null>(null) : perceptualImageHash(image).catch(() => null),
        contextFingerprint(extraContext).catch(() => ""),
      ]);
      const result = await analyzeFoodV2({
        data: {
          image,
          ...(secondImage ? { secondImage } : {}),
          ...(extraContext.trim() ? { context: extraContext.trim() } : {}),
          ...(imageHash ? { imageFingerprint: imageHash } : {}),
          contextFingerprint: contextHash,
        },
      });
      if (request !== requestRef.current) return;
      if (!result.ok) return setError(result.error);
      setFromEstimate(result.estimate);
      await maybeGroundExactPackage(result.estimate);
    } catch {
      if (request === requestRef.current) setError("AI_FAILED");
    }
  }

  async function analyzeLabel() {
    if (!image) return;
    const request = ++requestRef.current;
    setStage("analyzing");
    try {
      const result = await scanNutritionLabel({ data: { image } });
      if (request !== requestRef.current) return;
      if (!result.ok) return setError(result.error);
      setFromEstimate(result.estimate);
    } catch {
      if (request === requestRef.current) setError("AI_FAILED");
    }
  }

  function replaceComponents(next: ScannerV2Component[]) {
    setComponents(next);
    setFoodName(next.map((item) => item.label).filter(Boolean).join(" + ").slice(0, 200));
    setServingDescription(
      next.map((item) => item.serving_description).filter(Boolean).join(" · ").slice(0, 300),
    );
  }

  function updateComponent(index: number, patch: Partial<ScannerV2Component>) {
    setComponents((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function updateGrams(index: number, raw: string) {
    const grams = raw === "" ? null : Number(raw);
    setComponents((current) => current.map((item, i) => {
      if (i !== index) return item;
      if (grams == null || !Number.isFinite(grams) || grams < 0 || grams > 10000) {
        return { ...item, grams_estimate: grams };
      }
      const previous = item.grams_estimate;
      if (!previous || previous <= 0) return {
        ...item, grams_estimate: grams, grams_min: grams, grams_max: grams,
        confidence: Math.max(item.confidence, 0.75),
      };
      const ratio = grams / previous;
      return {
        ...item,
        grams_estimate: grams,
        grams_min: grams,
        grams_max: grams,
        calories: Math.round(item.calories * ratio),
        protein: round1(item.protein * ratio),
        carbs: round1(item.carbs * ratio),
        fat: round1(item.fat * ratio),
        confidence: Math.max(item.confidence, 0.8),
      };
    }));
  }

  function addManualComponent() {
    setComponents((current) => [...current, {
      label: "New item",
      serving_description: "Added manually",
      grams_estimate: null,
      grams_min: null,
      grams_max: null,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      confidence: 1,
      hidden_fat_risk: "low",
      source_name: "manual",
      source_ref: null,
      packaged_food: null,
    }]);
  }

  function applyPackagedFood(food: PackagedFood, grams: number) {
    if (!Number.isFinite(grams) || grams <= 0 || grams > 2000) {
      toast.error("Enter a package amount between 1 and 2000 g/ml.");
      return;
    }
    try {
      const nutrition = scalePackagedLabel(food, grams);
      const item: ScannerV2Component = {
        label: [food.brand, food.name].filter(Boolean).join(" ").slice(0, 160),
        serving_description: String(grams) + " g/ml · Open Food Facts community label",
        grams_estimate: grams,
        grams_min: grams,
        grams_max: grams,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        confidence: 0.95,
        hidden_fat_risk: "low",
        source_name: "Open Food Facts",
        source_ref: food.code ? "off:" + food.code : null,
        packaged_food: null,
      };
      replaceComponents([item]);
      setPackageGrams(String(grams));
      toast.success("Package label applied — compare it with the packet before saving");
    } catch {
      toast.error("Couldn't apply that package amount.");
    }
  }

  async function applyContext() {
    if (!estimate || !contextText.trim() || !image) return;
    setApplyingContext(true);
    try {
      const contextHash = await contextFingerprint(contextText);
      const result = await applyScanContext({ data: {
        scanId: estimate.scan_id,
        context: contextText.trim(),
        ...(contextHash ? { contextFingerprint: contextHash } : {}),
      } });
      if (!result.ok) {
        toast.error("Couldn't apply that context safely.");
        return;
      }
      if (result.applied) {
        setFromEstimate(result.estimate);
        setContextText("");
        toast.success("Updated without another AI call");
        return;
      }
      toast("That detail needs another look at the photo.");
      await runAnalyze(contextText.trim());
      setContextText("");
    } catch {
      toast.error("Couldn't apply that context safely.");
    } finally {
      setApplyingContext(false);
    }
  }

  async function reportEdits(scanId: string) {
    const original = originalRef.current;
    const current = components;
    const max = Math.max(original.length, current.length);
    for (let i = 0; i < max; i++) {
      const before = original[i];
      const after = current[i];
      try {
        if (before && !after) {
          await reportScanCorrection({ data: {
            scanId, scanItemId: before.id ?? null, correctionType: "remove",
            original: correctionPayload(before),
            corrected: { ...correctionPayload(before), calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0 },
          } });
          continue;
        }
        if (!before && after) {
          await reportScanCorrection({ data: {
            scanId, correctionType: "add",
            original: { ...correctionPayload(after), food_name: "(missing)", calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0 },
            corrected: correctionPayload(after),
          } });
          continue;
        }
        if (!before || !after) continue;
        const beforePayload = correctionPayload(before);
        const afterPayload = correctionPayload(after);
        if (JSON.stringify(beforePayload) === JSON.stringify(afterPayload)) continue;
        const correctionType =
          before.label !== after.label ? "identity"
            : before.grams_estimate !== after.grams_estimate ? "portion"
              : "nutrition";
        await reportScanCorrection({ data: {
          scanId, scanItemId: before.id ?? null, correctionType,
          original: beforePayload, corrected: afterPayload,
        } });
      } catch {
        // A learning-event failure must never undo a successfully saved meal.
      }
    }
  }

  function validComponents() {
    return components.length > 0 && components.every((item) =>
      item.label.trim().length > 0 &&
      [item.calories, item.protein, item.carbs, item.fat].every((value) => Number.isFinite(value) && value >= 0),
    );
  }

  async function confirm() {
    if (!estimate || !validComponents() || !foodName.trim()) {
      toast.error("Check the food names and nutrition numbers first.");
      return;
    }
    setBusy(true);
    try {
      const result = await saveScannedMealV2({ data: {
        scanId: estimate.scan_id,
        mealDate: today,
        mealType,
        foodName: foodName.trim(),
        servingDescription: servingDescription.trim(),
        calories: Math.round(totals.calories),
        protein: round1(totals.protein),
        carbs: round1(totals.carbs),
        fat: round1(totals.fat),
        confidence: estimate.confidence,
        photoUrl: null,
        components: components.map((item) => ({
          label: item.label,
          grams: item.grams_estimate,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          source_name: item.source_name,
          source_ref: item.source_ref,
          confidence: item.confidence,
        })),
      } });
      if (!result.ok) throw new Error(result.error);

      let savedMeal = result.meal;
      if (keepPhoto && image) {
        const uploaded = await uploadMealPhoto(room.id, image);
        if (uploaded) {
          const attached = await attachMyMealPhoto({ data: { mealId: savedMeal.id, photoPath: uploaded } });
          if (attached.ok) savedMeal = { ...savedMeal, photo_url: attached.photoPath };
          else toast.error("Meal saved, but the photo could not be attached.");
        } else {
          toast.error("Meal saved, but the photo upload failed.");
        }
      }
      upsertLocal(savedMeal);

      await reportEdits(estimate.scan_id);

      if (rememberPortion) {
        try {
          await saveFavoriteMeal({ data: {
            foodName: foodName.trim(),
            servingDescription: servingDescription.trim(),
            calories: Math.round(totals.calories),
            protein: round1(totals.protein),
            carbs: round1(totals.carbs),
            fat: round1(totals.fat),
          } });
          await queryClient.invalidateQueries({ queryKey: ["meal-favorites", me.id] });
        } catch {
          toast.error("Meal saved, but the favourite could not be saved.");
        }
      }

      toast.success("Added ❤️");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save that meal — nothing was partially logged.");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    requestRef.current += 1;
    setImage(null);
    setSecondImage(null);
    setEstimate(null);
    setComponents([]);
    originalRef.current = [];
    setContextText("");
    setStage("pick");
    cameraRef.current?.click();
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-xl border-border bg-background">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(event) => void filePicked(event)} />
        <input ref={libraryRef} type="file" accept="image/*" className="hidden"
          onChange={(event) => void filePicked(event)} />
        <input ref={secondRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(event) => void filePicked(event, true)} />

        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <DrawerTitle className="font-display text-2xl font-normal">
            {stage === "confirm" ? "Check the meal" : "Scan food"}
          </DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-muted-foreground">
            {stage === "confirm"
              ? "The camera can estimate, not measure. Fix anything that looks off before saving."
              : "The photo is analyzed on the server. It is not kept unless you explicitly choose to save it with the meal."}
          </DrawerDescription>

          {image && stage !== "pick" && (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <img src={image} alt="Primary meal view" className="max-h-48 w-full rounded-2xl object-cover" />
              {secondImage ? (
                <img src={secondImage} alt="Second meal angle" className="max-h-48 w-full rounded-2xl object-cover" />
              ) : (
                <button type="button" onClick={() => secondRef.current?.click()}
                  className="min-h-28 rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Add second angle only if portion depth is hard to judge
                </button>
              )}
            </div>
          )}

          {stage === "pick" && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => cameraRef.current?.click()}
                className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card">
                <Camera className="size-7 text-primary" /> Take photo
              </button>
              <button type="button" onClick={() => libraryRef.current?.click()}
                className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card">
                <ImageIcon className="size-7 text-primary" /> Choose photo
              </button>
            </div>
          )}

          {stage === "preview" && (
            <div className="mt-5 space-y-3">
              <Btn size="lg" className="w-full" onClick={() => void runAnalyze()}>Analyze meal</Btn>
              <Btn size="lg" variant="outline" className="w-full" onClick={() => void analyzeLabel()}>Read nutrition label</Btn>
              <Btn size="lg" variant="ghost" className="w-full" onClick={retake}>Retake</Btn>
            </div>
          )}

          {stage === "analyzing" && (
            <p className="mt-5 text-center text-sm text-muted-foreground">Identifying the food, portion uncertainty, and reliable nutrition sources…</p>
          )}

          {stage === "error" && (
            <div className="mt-5">
              <p>{errMsg}</p>
              <div className="mt-4 flex gap-2">
                <Btn className="flex-1" onClick={() => void runAnalyze()}>Try again</Btn>
                <Btn variant="outline" className="flex-1" onClick={() => { onOpenChange(false); onManual(); }}>Add manually</Btn>
              </div>
            </div>
          )}

          {stage === "confirm" && estimate && (
            <div className="mt-5 space-y-5">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-xl">{foodName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {estimate.confidence} evidence quality · estimate, not verified accuracy
                      {estimate.escalated ? " · checked by stronger model" : ""}
                    </p>
                  </div>
                  <div className="num text-right text-sm">
                    <div className="font-semibold">{Math.round(totals.calories)} kcal</div>
                    <div className="text-xs text-muted-foreground">P {round1(totals.protein)} · C {round1(totals.carbs)} · F {round1(totals.fat)}</div>
                  </div>
                </div>
              </div>

              {estimate.questions.length > 0 && (
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-sm font-medium">Help us narrow this down</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {estimate.questions.map((question) => <li key={question}>{question}</li>)}
                  </ul>
                </div>
              )}

              <div>
                <Field label="Add context" hint='Add what the photo cannot show, such as "2 packets, 61g each", "actually beef", or "2 tbsp ghee". Exact details are recalculated without another AI call when possible.'>
                  <TextInput value={contextText} maxLength={300}
                    onChange={(event) => setContextText(event.target.value)}
                    placeholder="Add weight, identity, oil/ghee, or package details" />
                </Field>
                <Btn variant="outline" className="mt-2 w-full" disabled={!contextText.trim() || applyingContext}
                  onClick={() => void applyContext()}>
                  {applyingContext ? "Applying…" : "Apply context"}
                </Btn>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">Meal components</h3>
                  <Btn size="md" variant="outline" onClick={addManualComponent}><Plus className="size-4" /> Add missing</Btn>
                </div>
                {components.map((item, index) => (
                  <div key={item.id ?? "new-" + index} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <TextInput value={item.label}
                          onChange={(event) => updateComponent(index, {
                            label: event.target.value.slice(0, 160),
                            source_name: "manual",
                            source_ref: null,
                          })} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.source_name} · Review ingredients and portions
                          {item.hidden_fat_risk !== "low" ? " · " + item.hidden_fat_risk + " hidden-fat uncertainty" : ""}
                        </p>
                        {item.personal_prior_grams && item.personal_prior_confirmations && (
                          <button type="button"
                            className="mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                            onClick={() => updateGrams(index, String(item.personal_prior_grams))}>
                            Use my usual {Math.round(item.personal_prior_grams)} g · confirmed {item.personal_prior_confirmations}×
                          </button>
                        )}
                      </div>
                      <button type="button" aria-label={"Remove " + item.label}
                        onClick={() => replaceComponents(components.filter((_, i) => i !== index))}
                        className="flex size-10 items-center justify-center rounded-full text-destructive">
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="text-xs text-muted-foreground">Grams
                        <TextInput type="number" min={0} max={10000} inputMode="decimal"
                          value={item.grams_estimate ?? ""}
                          onChange={(event) => updateGrams(index, event.target.value)} className="mt-1" />
                      </label>
                      <label className="text-xs text-muted-foreground">Calories
                        <TextInput type="number" min={0} max={20000} inputMode="decimal"
                          value={item.calories}
                          onChange={(event) => updateComponent(index, { calories: Number(event.target.value), source_name: "manual", source_ref: null })}
                          className="mt-1" />
                      </label>
                      <label className="text-xs text-muted-foreground">Protein
                        <TextInput type="number" min={0} max={2000} inputMode="decimal"
                          value={item.protein}
                          onChange={(event) => updateComponent(index, { protein: Number(event.target.value), source_name: "manual", source_ref: null })}
                          className="mt-1" />
                      </label>
                      <label className="text-xs text-muted-foreground">Carbs
                        <TextInput type="number" min={0} max={2000} inputMode="decimal"
                          value={item.carbs}
                          onChange={(event) => updateComponent(index, { carbs: Number(event.target.value), source_name: "manual", source_ref: null })}
                          className="mt-1" />
                      </label>
                      <label className="text-xs text-muted-foreground">Fat
                        <TextInput type="number" min={0} max={2000} inputMode="decimal"
                          value={item.fat}
                          onChange={(event) => updateComponent(index, { fat: Number(event.target.value), source_name: "manual", source_ref: null })}
                          className="mt-1" />
                      </label>
                      <div className="text-xs text-muted-foreground">
                        Portion range
                        <div className="mt-2 text-sm text-foreground">
                          {item.grams_min != null && item.grams_max != null
                            ? Math.round(item.grams_min) + "–" + Math.round(item.grams_max) + " g"
                            : "Not enough visual scale"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border p-4">
                <p className="text-sm font-medium">Packaged food?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the barcode or exact package label instead of a photo estimate.
                </p>
                <div className="mt-3 flex gap-2">
                  <Btn variant="outline" className="flex-1" onClick={() => setBarcodeOpen((value) => !value)}>
                    {barcodeOpen ? "Hide barcode" : "Scan barcode"}
                  </Btn>
                  <Btn variant="outline" className="flex-1" onClick={() => setFoodSearchOpen(true)}>
                    Find package
                  </Btn>
                </div>
                {barcodeOpen && (
                  <div className="mt-4 border-t border-border pt-4">
                    <BarcodeScanner onSelect={(food, amount) => {
                      applyPackagedFood(food, amount);
                      setBarcodeOpen(false);
                    }} />
                  </div>
                )}
                <div className="mt-3">
                  <label className="text-xs text-muted-foreground">Package amount for search result
                    <TextInput type="number" inputMode="decimal" min={1} max={2000}
                      value={packageGrams} onChange={(event) => setPackageGrams(event.target.value)}
                      placeholder="Total g/ml" className="mt-1" />
                  </label>
                </div>
                <FoodSearchSheet open={foodSearchOpen} onOpenChange={setFoodSearchOpen}
                  onSelect={(food) => applyPackagedFood(food, Number(packageGrams))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Meal name"><TextInput value={foodName} maxLength={200} onChange={(event) => setFoodName(event.target.value)} /></Field>
                <label className="text-sm">Meal
                  <select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3">
                    {MEAL_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
                  </select>
                </label>
              </div>

              <Field label="Serving note">
                <TextInput value={servingDescription} maxLength={300}
                  onChange={(event) => setServingDescription(event.target.value)} />
              </Field>

              <label className="flex min-h-12 items-start gap-3 rounded-xl border border-border p-3">
                <input type="checkbox" checked={keepPhoto} onChange={(event) => setKeepPhoto(event.target.checked)}
                  className="mt-0.5 size-4 accent-primary" />
                <span>
                  <span className="block text-sm font-medium">Keep this photo with the meal</span>
                  <span className="block text-xs text-muted-foreground">Off by default. If enabled, it is stored in the private room bucket and shown only through short-lived signed links.</span>
                </span>
              </label>

              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={rememberPortion} onChange={(event) => setRememberPortion(event.target.checked)}
                  className="size-4 accent-primary" />
                Save this portion to my favourites
              </label>

              <div className="space-y-2">
                <Btn size="lg" className="w-full" onClick={() => void confirm()} disabled={busy || components.length === 0}>
                  {busy ? "Saving…" : "Looks right ❤️"}
                </Btn>
                <div className="flex gap-2">
                  <Btn variant="outline" className="flex-1" onClick={() => secondRef.current?.click()}>
                    {secondImage ? "Replace second angle" : "Add second angle"}
                  </Btn>
                  <Btn variant="outline" className="flex-1" onClick={retake}>Retake</Btn>
                  <Btn variant="ghost" onClick={() => onOpenChange(false)}>Discard</Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
