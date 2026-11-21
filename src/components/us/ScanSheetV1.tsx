import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ImageIcon } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Btn, TextInput } from "./primitives";
import { MealFields, emptyDraft, useSaveMeal, validDraft, type MealDraft } from "./MealSheet";
import { useSpace } from "@/lib/space";
import { compressImage, uploadMealPhoto } from "@/lib/image";
import { analyzeFood, type FoodEstimate } from "@/lib/scan.functions";
import { resetPortionBasis, scaleMealPortion } from "@/lib/meal-portion";
import { ScanPortionPicker } from "./ScanPortionPicker";
import { searchPackagedFoods } from "@/lib/food-catalog.functions";
import type { PackagedFood } from "@/lib/off-food";
import { detectedTotalGrams, packageSearchQuery, scalePackagedLabel, strictPackageMatch, type DetectedPackage } from "@/lib/packaged-scan";
import { FoodSearchSheet } from "./FoodSearchSheet";
import { saveFavoriteMeal } from "@/lib/meal-operations.functions";
import { attachMyMealPhoto } from "@/lib/scanned-meal.functions";
import { saveMealPhoto } from "@/lib/meal-photo-save";
import type { Meal } from "@/lib/nutrition";

type Stage = "pick" | "preview" | "analyzing" | "confirm" | "error";

const ERRORS: Record<string, string> = {
  AI_BUSY: "Google's scanner service is busy or timed out. Try again later, or log manually.",
  AI_LIMIT: "Today's AI scan allowance is used up. You can still log meals manually.",
  AI_QUOTA_UNAVAILABLE: "The scanner's safety limit couldn't be checked. Manual logging still works.",
  AI_UNAVAILABLE: "The scanner isn't configured on this deployment. Manual logging still works.",
  AI_MODEL_ACCESS: "The scanner models aren't available to this app's API key. This needs an app configuration fix.",
  AI_CONFIGURATION: "The image-analysis request was rejected. The app needs a scanner configuration fix.",
  AI_CREDITS: "The scanner provider requires billing or has insufficient credits. Manual logging still works.",
  AI_MALFORMED: "The scanner couldn't validate a food estimate. Try again or enter the meal manually.",
  AI_BLOCKED: "This image couldn't be analyzed. Try another photo or enter manually.",
  AI_FAILED: "The scanner request failed. Try again or log the meal manually.",
  NOT_MEMBER: "Your session needs to reconnect. Reopen the app; your meals are not erased.",
};

export function ScanSheetV1({ open, onOpenChange, onManual }: { open: boolean; onOpenChange: (o: boolean) => void; onManual: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // Prevent a late AI/database response from rewriting a newer photo or manual edit.
  const requestRef = useRef(0);
  const editedRef = useRef(false);
  const [stage, setStage] = useState<Stage>("pick");
  const [image, setImage] = useState<string | null>(null);
  const [contextText, setContextText] = useState("");
  const [appliedContext, setAppliedContext] = useState("");
  const [rechecking, setRechecking] = useState(false);
  const [reanalysisResult, setReanalysisResult] = useState<{ estimate: FoodEstimate; context: string } | null>(null);
  const [correctionError, setCorrectionError] = useState("");
  const [draft, setDraft] = useState<MealDraft>(emptyDraft());
  const [editing, setEditing] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [detectedPackage, setDetectedPackage] = useState<DetectedPackage | null>(null);
  const [candidates, setCandidates] = useState<PackagedFood[]>([]);
  const [checkingLabel, setCheckingLabel] = useState(false);
  const [labelSource, setLabelSource] = useState<PackagedFood | null>(null);
  const [labelAdjusted, setLabelAdjusted] = useState(false);
  const [amountGrams, setAmountGrams] = useState("");
  const [foodSearchOpen, setFoodSearchOpen] = useState(false);
  const [rememberPortion, setRememberPortion] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ meal: Meal; uploadedPath: string | null } | null>(null);
  const [photoSaveError, setPhotoSaveError] = useState("");
  const save = useSaveMeal();
  const { room, me, upsertLocal } = useSpace();
  const queryClient = useQueryClient();
  // An edit made after a scan must be applied to the image before its old
  // nutrition estimate can be saved under a newly described food.
  const contextNeedsRescan = stage === "confirm" && contextText.trim() !== appliedContext;

  useEffect(() => {
    if (!open) {
      // Photos are held only in memory and discarded when the sheet closes.
      requestRef.current += 1;
      setStage("pick");
      setImage(null);
      setContextText("");
      setAppliedContext("");
      setRechecking(false);
      setReanalysisResult(null);
      setDraft(emptyDraft());
      setCorrectionError("");
      setDetectedPackage(null);
      setCandidates([]);
      setCheckingLabel(false);
      setLabelSource(null);
      setAmountGrams("");
      setFoodSearchOpen(false);
      setRememberPortion(false);
      setPendingPhoto(null);
      setPhotoSaveError("");
      setEditing(false);
    }
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const id = ++requestRef.current;
    setPendingPhoto(null);
    setPhotoSaveError("");
    setReanalysisResult(null);
    setDraft(emptyDraft());
    editedRef.current = false;
    setCandidates([]);
    setLabelSource(null);
    setDetectedPackage(null);
    setCheckingLabel(false);
    setContextText("");
    setAppliedContext("");
    setCorrectionError("");
    try {
      const compressed = await compressImage(file);
      if (id !== requestRef.current) return;
      setImage(compressed);
      setStage("preview");
    } catch {
      toast.error("Couldn't read that photo. Try another one?");
    }
  }

  function applyLabel(food: PackagedFood, grams: number) {
    try {
      const nutrition = scalePackagedLabel(food, grams);
      editedRef.current = true;
      setAmountGrams(String(grams));
      setLabelSource(food);
      setLabelAdjusted(false);
      setDraft(previous => scaleMealPortion(resetPortionBasis({
        ...previous,
        food_name: [food.brand, food.name].filter(Boolean).join(" ").slice(0, 200),
        serving_description: String(grams) + " g/ml pictured · Open Food Facts (check packet label)",
        calories: String(nutrition.calories),
        protein: String(nutrition.protein),
        carbs: String(nutrition.carbs),
        fat: String(nutrition.fat),
        ai_confidence: null,
      }), previous.portion_percentage));
    } catch {
      toast.error("Enter an amount greater than 0 and no more than 2000 g.");
    }
  }


  async function applyEstimate(estimate: FoodEstimate, foodContext: string, id: number) {
    editedRef.current = false;
    setLabelSource(null);
    setLabelAdjusted(false);
    setCandidates([]);
    setDetectedPackage(null);
    setCheckingLabel(false);
    setAppliedContext(foodContext);
    // A new AI or package estimate is for the FULL photographed portion.
    // Preserve how much the member ate without scaling already-scaled numbers.
    setDraft(previous => scaleMealPortion(resetPortionBasis({
      ...previous,
      food_name: estimate.food_name,
      serving_description: estimate.serving_description,
      calories: String(estimate.calories),
      protein: String(estimate.protein),
      carbs: String(estimate.carbs),
      fat: String(estimate.fat),
      ai_confidence: estimate.confidence,
    }), previous.portion_percentage));
    setEditing(false);
    setStage("confirm");

    const detected = estimate.packaged_food ?? null;
    setDetectedPackage(detected);
    const grams = detectedTotalGrams(detected);
    setAmountGrams(grams === null ? "" : String(grams));
    if (!detected?.brand || !detected.product) return;

    setCheckingLabel(true);
    try {
      const result = await searchPackagedFoods({ data: { query: packageSearchQuery(detected) } });
      if (requestRef.current !== id) return;
      if (!result.ok) return;
      setCandidates(result.foods.slice(0, 5));
      const exact = strictPackageMatch(detected, result.foods);
      if (exact && grams !== null && !editedRef.current) applyLabel(exact, grams);
    } catch {
      // Optional community-label lookup; leave the AI estimate editable.
    } finally {
      if (requestRef.current === id) setCheckingLabel(false);
    }
  }

  async function analyze() {
    if (!image || rechecking || busy || pendingPhoto || reanalysisResult) return;
    const isCorrection = stage === "confirm";
    const id = ++requestRef.current;
    const foodContext = contextText.trim();
    setCorrectionError("");
    if (isCorrection) setRechecking(true);
    else setStage("analyzing");
    try {
      // Reanalysis is always a fresh request for THIS image; it uses an extra
      // AI quota unit and a deliberate second-pass instruction, not a new photo.
      const result = await analyzeFood({ data: {
        image,
        ...(foodContext ? { context: foodContext } : {}),
        ...(isCorrection ? { reanalyse: true } : {}),
      } });
      if (requestRef.current !== id) return;
      if (!result.ok) {
        const message = ERRORS[result.error] ?? "Couldn't analyze that photo. Try again or enter the meal manually.";
        if (isCorrection) setCorrectionError(message);
        else { setErrMsg(message); setStage("error"); }
        return;
      }
      if (isCorrection) {
        // Never overwrite an edited or previously reviewed estimate silently.
        setReanalysisResult({ estimate: result.estimate, context: foodContext });
      } else {
        await applyEstimate(result.estimate, foodContext, id);
      }
    } catch {
      if (requestRef.current !== id) return;
      const message = navigator.onLine
        ? "Couldn't reanalyse. Your previous estimate is still available."
        : "You're offline. Your previous estimate is still available.";
      if (isCorrection) setCorrectionError(message);
      else { setErrMsg(message); setStage("error"); }
    } finally {
      if (requestRef.current === id) setRechecking(false);
    }
  }

  function acceptReanalysis() {
    if (!reanalysisResult || busy || pendingPhoto) return;
    const candidate = reanalysisResult;
    const id = ++requestRef.current;
    setReanalysisResult(null);
    setCorrectionError("");
    void applyEstimate(candidate.estimate, candidate.context, id);
  }

  function keepPreviousEstimate() {
    setReanalysisResult(null);
    setCorrectionError("");
    // Rejected context changes must not leave an unsavable old estimate.
    setContextText(appliedContext);
  }

  const revisedPortion = reanalysisResult
    ? scaleMealPortion(resetPortionBasis({
        ...draft,
        food_name: reanalysisResult.estimate.food_name,
        calories: String(reanalysisResult.estimate.calories),
        protein: String(reanalysisResult.estimate.protein),
        carbs: String(reanalysisResult.estimate.carbs),
        fat: String(reanalysisResult.estimate.fat),
      }), draft.portion_percentage)
    : null;

  async function confirm() {
    // The estimate describes the pictured full serving; meal history and
    // favourites must explicitly describe the fraction actually consumed.
    const consumedServing = draft.portion_percentage === 100
      ? draft.serving_description
      : `${draft.serving_description.trim() || "Full pictured portion"} · ${draft.portion_percentage}% eaten`.slice(0, 160);
    if (busy || reanalysisResult) return;
    if (!pendingPhoto && (rechecking || contextText.trim() !== appliedContext)) {
      toast.error("Update the estimate with your new context before saving.");
      return;
    }
    if (!pendingPhoto && !validDraft(draft)) return void toast.error("Add a name and valid numbers first.");
    if (!image) return void toast.error("Choose a photo first.");
    setBusy(true);
    editedRef.current = true;
    try {
      // Insert nutrition only once. If photo storage fails, the next press
      // retries the attachment to the SAME meal, never another meal insertion.
      const savedMeal = pendingPhoto?.meal ?? await save({ ...draft, serving_description: consumedServing, photo_url: null });
      const result = await saveMealPhoto({
        roomId: room.id,
        mealId: savedMeal.id,
        compressedImage: image,
        uploadedPath: pendingPhoto?.uploadedPath ?? null,
      }, {
        upload: uploadMealPhoto,
        attach: async (mealId, uploadedPath) => {
          const r = await attachMyMealPhoto({ data: { mealId, photoPath: uploadedPath } });
          return r.ok ? { ok: true, photoPath: r.photoPath } : { ok: false };
        },
      });
      if (!result.ok) {
        setPendingPhoto({ meal: savedMeal, uploadedPath: result.uploadedPath });
        setPhotoSaveError(result.failedAt === "upload"
          ? "The meal was logged but the photo couldn't upload. Tap Retry saving photo."
          : "The meal was logged but the photo couldn't be attached. Tap Retry saving photo.");
        toast.error("Photo not saved yet.");
        return;
      }
      // The meal was first inserted without a photo. Update local UI
      // immediately so Today doesn't keep showing an empty placeholder.
      upsertLocal({ ...savedMeal, photo_url: result.photoPath });
      setPhotoSaveError("");
      setPendingPhoto(null);
      if (rememberPortion && me) {
        try {
          await saveFavoriteMeal({ data: {
            foodName: draft.food_name.trim(),
            servingDescription: consumedServing,
            calories: Number(draft.calories || 0),
            protein: Number(draft.protein || 0),
            carbs: Number(draft.carbs || 0),
            fat: Number(draft.fat || 0),
          } });
          await queryClient.invalidateQueries({ queryKey: ["meal-favorites", me.id] });
        } catch {
          toast.error("Meal and photo saved, but saving the favourite failed. You can star the meal in Today.");
        }
      }
      toast.success("Meal saved");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't confirm the save. Check Today before trying again.");
    } finally {
      setBusy(false);
    }
  }

  const retake = () => {
    if (pendingPhoto) return;
    requestRef.current += 1;
    editedRef.current = false;
    setCandidates([]);
    setDetectedPackage(null);
    setLabelSource(null);
    setAmountGrams("");
    setContextText("");
    setAppliedContext("");
    setCorrectionError("");
    setRechecking(false);
    setReanalysisResult(null);
    setDraft(emptyDraft());
    setImage(null);
    setStage("pick");
    cameraRef.current?.click();
  };

  return (
    <Drawer open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-xl border-border bg-background">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <DrawerTitle className="font-display text-2xl font-normal">
            {stage === "confirm" ? "Review your meal" : "Scan food"}
          </DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-muted-foreground">
            {stage === "confirm" ? "Estimate — review before saving" : "Take a photo or choose one from your library."}
          </DrawerDescription>

          {image && stage !== "pick" && (
            <img src={image} alt="Your meal" className={`mt-4 w-full rounded-2xl object-cover ${stage === "confirm" ? "h-44 sm:h-52" : "max-h-80"} ${stage === "analyzing" ? "animate-pulse" : ""}`} />
          )}

          {stage === "pick" && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => cameraRef.current?.click()} className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-foreground active:scale-[0.98]">
                <Camera className="size-7 text-primary" /> Take photo
              </button>
              <button onClick={() => libraryRef.current?.click()} className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-foreground active:scale-[0.98]">
                <ImageIcon className="size-7 text-primary" /> Choose photo
              </button>
            </div>
          )}

          {stage === "preview" && (
            <div className="mt-5 flex gap-2">
              <Btn size="lg" className="flex-1" onClick={analyze}>Analyze</Btn>
              <Btn size="lg" variant="outline" onClick={retake}>Retake photo</Btn>
            </div>
          )}

          {stage === "analyzing" && <p className="mt-5 text-center text-muted-foreground">Looking closely at your plate…</p>}

          {stage === "error" && (
            <div className="mt-5">
              <p className="text-foreground">{errMsg}</p>
              <div className="mt-4 flex gap-2">
                <Btn size="lg" className="flex-1" onClick={image ? analyze : retake}>Try again</Btn>
                <Btn size="lg" variant="outline" onClick={() => { onOpenChange(false); onManual(); }}>Add manually</Btn>
              </div>
            </div>
          )}

          {stage === "confirm" && (
            <div className="mt-5">
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-accent/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">AI estimate</p>
                  <p className="text-xs text-muted-foreground">Run a fresh estimate on this same photo.</p>
                </div>
                <Btn variant="outline" className="shrink-0 border-primary/30 text-primary" disabled={rechecking || busy || Boolean(pendingPhoto) || Boolean(reanalysisResult) || checkingLabel}
                  onClick={() => void analyze()}>
                  {rechecking ? "Reanalysing…" : "Reanalyse"}
                </Btn>
              </div>
              {reanalysisResult && revisedPortion && (
                <section aria-label="Reanalysis comparison" className="mb-4 rounded-xl border border-primary/40 bg-card p-3">
                  <p className="text-sm font-semibold">Compare the new estimate</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    For the {draft.portion_percentage}% you ate. Your current values will stay until you choose the new ones.
                  </p>
                  <p className="mt-2 text-sm">
                    {draft.food_name} · {draft.calories} kcal → {revisedPortion.food_name} · {revisedPortion.calories} kcal
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Protein {draft.protein} → {revisedPortion.protein} g · Carbs {draft.carbs} → {revisedPortion.carbs} g · Fat {draft.fat} → {revisedPortion.fat} g
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Btn onClick={acceptReanalysis} className="flex-1">Use new estimate</Btn>
                    <Btn variant="outline" onClick={keepPreviousEstimate} className="flex-1">Keep previous</Btn>
                  </div>
                </section>
              )}
              {editing ? (
                <div className="border-t border-border pt-4">
                  <MealFields draft={draft} onChange={next => {
                    editedRef.current = true;
                    if (labelSource && (
                      next.calories !== draft.calories || next.protein !== draft.protein ||
                      next.carbs !== draft.carbs || next.fat !== draft.fat
                    )) setLabelAdjusted(true);
                    setDraft(next);
                  }} />
                  <Btn variant="ghost" className="mt-3 w-full text-primary" onClick={() => setEditing(false)}>
                    Done editing
                  </Btn>
                </div>
              ) : (
                <section aria-label="Estimated nutrition" className="border-b border-border pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-[1.6rem] leading-tight text-foreground">
                        {draft.food_name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {labelSource ? "Community label · check the packet" : `AI estimate · ${draft.ai_confidence ?? "unknown"} confidence`}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5 text-right text-primary">
                      <span className="num font-display text-2xl leading-none">{draft.calories}</span>
                      <span className="ml-1 font-display text-base">kcal</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-sm text-foreground">
                    <div>Protein <span className="num font-semibold">{draft.protein} g</span></div>
                    <div>Carbs <span className="num font-semibold">{draft.carbs} g</span></div>
                    <div>Fat <span className="num font-semibold">{draft.fat} g</span></div>
                  </div>
                  {!labelSource && draft.ai_confidence === "low" && (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Food type or quantity may be uncertain. Check hidden ingredients before saving.
                    </p>
                  )}
                </section>
              )}
              {!editing && (
                <ScanPortionPicker
                  percentage={draft.portion_percentage}
                  fullCalories={draft.nominal_calories ?? Number(draft.calories)}
                  eatenCalories={Number(draft.calories)}
                  disabled={busy || rechecking || Boolean(pendingPhoto) || Boolean(reanalysisResult)}
                  onChange={percentage => setDraft(previous => scaleMealPortion(previous, percentage))}
                />
              )}
              {!editing && (
                <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border py-3">
                  <span className="text-sm font-medium">Serving</span>
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="max-w-44 truncate text-sm text-muted-foreground" title={draft.serving_description}>
                      {draft.serving_description || "Full pictured portion"}
                    </span>
                    <Btn variant="ghost" className="shrink-0 px-2 text-primary" onClick={() => setEditing(true)}>
                      Edit
                    </Btn>
                  </div>
                </div>
              )}
              <details className="mt-3 border-b border-border pb-3">
                <summary className="cursor-pointer rounded-sm py-2 text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring">
                  Check food label or barcode
                </summary>
                <div className="mt-2 space-y-2">
              {detectedPackage && (
                <p className="mb-3 text-sm text-muted-foreground">
                  Packaging spotted: {detectedPackage.brand} {detectedPackage.product}
                  {detectedTotalGrams(detectedPackage) !== null
                    ? " · " + String(detectedPackage.pack_count) + " × " + String(detectedPackage.grams_per_pack) + " g (confirm on pack)"
                    : " · serving size not readable"}
                </p>
              )}
              {checkingLabel && <p className="mb-3 text-sm text-muted-foreground">Checking the food database for a matching label…</p>}
              {labelSource && (
                <div className="mb-3 space-y-2 border-b border-border pb-3">
                  <p className="text-sm font-medium">Open Food Facts community label: {labelSource.name}</p>
                  <p className="text-xs text-muted-foreground">These numbers come from a matching database entry, not Gemini. Compare the brand, flavour and nutrition label on your packet. Community data may be wrong.</p>
                  <label className="block text-sm">
                    Total amount shown in photo (g/ml)
                    <TextInput type="number" inputMode="decimal" min={1} max={2000}
                      value={amountGrams} onChange={event => setAmountGrams(event.target.value)}
                      className="mt-1" />
                  </label>
                  <Btn variant="outline" disabled={!Number.isFinite(Number(amountGrams)) || Number(amountGrams) <= 0 || Number(amountGrams) > 2000}
                    onClick={() => applyLabel(labelSource, Number(amountGrams))}>
                    Recalculate from label
                  </Btn>
                  {labelAdjusted && <p className="text-xs text-muted-foreground">Numbers were adjusted after applying the label.</p>}
                </div>
              )}
              {!labelSource && candidates.length > 0 && !editing && (
                <div className="mb-4 space-y-2">
                  <p className="text-sm font-medium">Possible packaged foods</p>
                  <p className="text-xs text-muted-foreground">Not automatically verified. Choose only if the exact product and variant match your packet.</p>
                  <label className="block text-sm">
                    Total package amount shown in photo (g/ml)
                    <TextInput type="number" inputMode="decimal" min={1} max={2000}
                      value={amountGrams} onChange={event => setAmountGrams(event.target.value)}
                      className="mt-1" placeholder="Enter packet weight × count" />
                  </label>
                  {candidates.map(food => (
                    <button key={food.code} type="button"
                      disabled={!Number.isFinite(Number(amountGrams)) || Number(amountGrams) <= 0 || Number(amountGrams) > 2000}
                      onClick={() => applyLabel(food, Number(amountGrams))}
                      className="w-full rounded-xl border border-border p-3 text-left text-sm disabled:opacity-40">
                      <span className="block font-medium">{food.brand} {food.name}{food.packageQuantity ? " · " + food.packageQuantity : ""}</span>
                      <span className="block text-xs text-muted-foreground">Per 100 g/ml: {food.calories} kcal · P {food.protein} · C {food.carbs} · F {food.fat}</span>
                    </button>
                  ))}
                </div>
              )}
              {!labelSource && !checkingLabel && (
                <p className="mb-3 text-xs text-muted-foreground">
                  AI estimate only. For packaged food, check its nutrition label before saving.
                </p>
              )}
              {!editing && <Btn variant="outline" className="mb-4 w-full" onClick={() => setFoodSearchOpen(true)}>
                {labelSource ? "Use a different package label" : "Find label by name or barcode"}
              </Btn>}
              <FoodSearchSheet open={foodSearchOpen} onOpenChange={setFoodSearchOpen} onSelect={applyLabel} />

                </div>
              </details>
              <div className="mt-4">
                  <label htmlFor="scan-food-context" className="block text-sm font-medium text-foreground">
                    Add details for a better estimate <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea id="scan-food-context" rows={2} maxLength={400}
                    disabled={Boolean(pendingPhoto) || rechecking || Boolean(reanalysisResult)}
                    value={contextText} onChange={event => setContextText(event.target.value)}
                    placeholder="e.g. Cooked with 1 tbsp oil"
                    className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3 py-3 text-base text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <Btn variant="ghost" className="px-1 text-primary"
                      disabled={!contextNeedsRescan || rechecking || busy || Boolean(reanalysisResult) || Boolean(pendingPhoto)}
                      onClick={() => void analyze()}>
                      {rechecking ? "Updating estimate…" : "Update estimate"}
                    </Btn>
                    {contextNeedsRescan && !reanalysisResult && (
                      <Btn variant="ghost" className="px-1 text-xs text-muted-foreground" disabled={rechecking}
                        onClick={() => { setContextText(appliedContext); setCorrectionError(""); }}>
                        Discard changes
                      </Btn>
                    )}
                  </div>
                  {contextNeedsRescan && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your current estimate does not include these details yet.
                    </p>
                  )}
                  {correctionError && <p role="alert" className="mt-2 text-sm text-destructive">{correctionError}</p>}
              </div>

              
              {photoSaveError && <p role="alert" className="mt-3 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{photoSaveError}</p>}
              <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input type="checkbox" checked={rememberPortion} onChange={event => setRememberPortion(event.target.checked)}
                  className="size-4 accent-primary" />
                Remember this portion
              </label>
              <div className="mt-5 flex flex-col gap-2">
                <Btn size="lg" className="w-full" onClick={confirm} disabled={busy || Boolean(reanalysisResult) || (!pendingPhoto && (rechecking || contextNeedsRescan))}>
                  {busy ? "Saving…" : pendingPhoto ? "Retry saving photo" : "Save meal"}
                </Btn>
                <div className="flex items-center justify-center gap-3">
                  <Btn variant="ghost" className="text-primary" onClick={retake} disabled={busy || Boolean(pendingPhoto)}>Retake photo</Btn>
                  <Btn variant="ghost" className="text-muted-foreground" onClick={() => onOpenChange(false)} disabled={busy}>
                    {pendingPhoto ? "Close (meal logged)" : "Discard"}
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
