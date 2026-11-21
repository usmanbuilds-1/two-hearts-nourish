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
      toast.success("Meal and photo saved ❤️");
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
            {stage === "confirm" ? "What's on the plate? 👀" : "Scan food"}
          </DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-muted-foreground">
            {stage === "confirm" ? "Review the source and portion before saving. A database match is not a verified package label." : "Your photo is sent to Google Gemini for analysis and saved privately with the meal when you confirm."}
          </DrawerDescription>

          {image && stage !== "pick" && (
            <img src={image} alt="Your meal" className={`mt-5 w-full rounded-2xl object-cover ${stage === "confirm" ? "max-h-40" : "max-h-80"} ${stage === "analyzing" ? "animate-pulse" : ""}`} />
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
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3">
                <div>
                  <p className="text-sm font-medium">Want a second assessment?</p>
                  <p className="text-xs text-muted-foreground">Reanalyse this same photo. A new AI estimate may differ, not necessarily improve.</p>
                </div>
                <Btn variant="outline" disabled={rechecking || busy || Boolean(pendingPhoto) || Boolean(reanalysisResult)}
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
              {editing ? (
                <MealFields draft={draft} onChange={next => {
                    editedRef.current = true;
                    if (labelSource && (
                      next.calories !== draft.calories || next.protein !== draft.protein ||
                      next.carbs !== draft.carbs || next.fat !== draft.fat
                    )) setLabelAdjusted(true);
                    setDraft(next);
                  }} />
              ) : (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="font-display text-xl">{draft.food_name}</div>
                  {draft.serving_description && <div className="mt-0.5 text-sm text-muted-foreground">{draft.serving_description}</div>}
                  <div className="mt-4 grid grid-cols-4 text-center">
                    {[["kcal", draft.calories], ["protein", draft.protein], ["carbs", draft.carbs], ["fat", draft.fat]].map(([l, v]) => (
                      <div key={l}>
                        <div className="num text-lg font-semibold">{v}{l !== "kcal" && <span className="text-xs text-muted-foreground">g</span>}</div>
                        <div className="text-xs text-muted-foreground">{l}</div>
                      </div>
                    ))}
                  </div>
                   <div className="mt-4 text-xs text-muted-foreground">{labelSource ? "Source: Open Food Facts community label (check packet)" : <>AI estimate · Confidence: <span className="capitalize text-foreground">{draft.ai_confidence}</span></>}</div>
                  {!labelSource && draft.ai_confidence === "low" && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      The food type or serving may be uncertain. Check the guess and correct any hidden ingredients before saving; calories and macros may be significantly off.
                    </p>
                  )}
                </div>
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
<div className="mt-4">
                  <label htmlFor="scan-food-context" className="block text-sm font-medium text-foreground">
                    Was anything wrong? <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea id="scan-food-context" rows={2} maxLength={400} disabled={Boolean(pendingPhoto) || rechecking || Boolean(reanalysisResult)}
                    value={contextText} onChange={(event) => setContextText(event.target.value)}
                    placeholder="e.g. This is a chicken patty, not fish. It was cooked with butter."
                    className="mt-2 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Correct the food, ingredients, cooking method, or portion. We’ll analyze the same photo again using your correction.
                  </p>
                  {(contextNeedsRescan || correctionError) && (
                    <div className="mt-3 space-y-2">
                      {contextNeedsRescan && <p className="text-sm text-muted-foreground">
                        The estimate above still uses the previous information.
                      </p>}
                      {correctionError && <p role="alert" className="text-sm text-destructive">{correctionError}</p>}
                      {contextNeedsRescan && !reanalysisResult && (
                        <Btn size="lg" variant="outline" className="w-full" disabled={rechecking} onClick={() => void analyze()}>
                          {rechecking ? "Recalculating…" : "Recalculate with correction"}
                        </Btn>
                      )}
                      {contextNeedsRescan && !reanalysisResult && (
                        <Btn size="lg" variant="ghost" className="w-full" disabled={rechecking}
                          onClick={() => { setContextText(appliedContext); setCorrectionError(""); }}>
                          Discard correction and keep previous estimate
                        </Btn>
                      )}
                    </div>
                  )}
              </div>

              <p className="mt-4 text-xs text-muted-foreground">Your photo is saved privately with the meal.</p>
              {photoSaveError && <p role="alert" className="mt-3 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{photoSaveError}</p>}
              <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input type="checkbox" checked={rememberPortion} onChange={event => setRememberPortion(event.target.checked)}
                  className="size-4 accent-primary" />
                Save this portion to my favourites for next time
              </label>
              <div className="mt-5 flex flex-col gap-2">
                <Btn size="lg" onClick={confirm} disabled={busy || Boolean(reanalysisResult) || (!pendingPhoto && (rechecking || contextNeedsRescan))}>
                  {busy ? "Saving…" : pendingPhoto ? "Retry saving photo" : "Save meal"}
                </Btn>
                <div className="flex gap-2">
                  {!editing && !pendingPhoto && <Btn variant="outline" className="flex-1" onClick={() => setEditing(true)}>Edit</Btn>}
                  <Btn variant="outline" className="flex-1" onClick={retake} disabled={busy || Boolean(pendingPhoto)}>Retake photo</Btn>
                  <Btn variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{pendingPhoto ? "Close (meal logged)" : "Discard"}</Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
