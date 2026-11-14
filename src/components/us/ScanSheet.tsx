import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ImageIcon } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Btn, TextInput } from "./primitives";
import { MealFields, emptyDraft, useSaveMeal, validDraft, type MealDraft } from "./MealSheet";
import { useSpace } from "@/lib/space";
import { compressImage, uploadMealPhoto } from "@/lib/image";
import { analyzeFood } from "@/lib/scan.functions";
import { searchPackagedFoods } from "@/lib/food-catalog.functions";
import type { PackagedFood } from "@/lib/off-food";
import { detectedTotalGrams, packageSearchQuery, scalePackagedLabel, strictPackageMatch, type DetectedPackage } from "@/lib/packaged-scan";
import { FoodSearchSheet } from "./FoodSearchSheet";
import { saveFavoriteMeal } from "@/lib/meal-operations.functions";

type Stage = "pick" | "preview" | "analyzing" | "confirm" | "error";

const ERRORS: Record<string, string> = {
  AI_BUSY: "Lots of people are scanning right now. Give it a moment and try again.",
  AI_LIMIT: "Daily AI scan allowance reached. You can still log meals manually.",
  AI_QUOTA_UNAVAILABLE: "AI budget checks are unavailable. Please try again later.",
  AI_CREDITS: "Photo scanning is paused for now (AI usage limit reached). You can still add meals by hand.",
  NOT_MEMBER: "Your session expired. Please reopen your invite link.",
};

export function ScanSheet({ open, onOpenChange, onManual }: { open: boolean; onOpenChange: (o: boolean) => void; onManual: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // Prevent a late AI/database response from rewriting a newer photo or manual edit.
  const requestRef = useRef(0);
  const editedRef = useRef(false);
  const [stage, setStage] = useState<Stage>("pick");
  const [image, setImage] = useState<string | null>(null);
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
  const save = useSaveMeal();
  const { room, me } = useSpace();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      // Photos are held only in memory and discarded when the sheet closes.
      requestRef.current += 1;
      setStage("pick");
      setImage(null);
      setDetectedPackage(null);
      setCandidates([]);
      setCheckingLabel(false);
      setLabelSource(null);
      setAmountGrams("");
      setFoodSearchOpen(false);
      setRememberPortion(false);
      setEditing(false);
    }
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const id = ++requestRef.current;
    editedRef.current = false;
    setCandidates([]);
    setLabelSource(null);
    setDetectedPackage(null);
    setCheckingLabel(false);
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
      setDraft(previous => ({
        ...previous,
        food_name: [food.brand, food.name].filter(Boolean).join(" ").slice(0, 200),
        serving_description: String(grams) + " g/ml · Open Food Facts (check packet label)",
        calories: String(nutrition.calories),
        protein: String(nutrition.protein),
        carbs: String(nutrition.carbs),
        fat: String(nutrition.fat),
        ai_confidence: null,
        nominal_calories: undefined,
        nominal_protein: undefined,
        nominal_carbs: undefined,
        nominal_fat: undefined,
        portion_percentage: 100,
      }));
    } catch {
      toast.error("Enter an amount greater than 0 and no more than 2000 g.");
    }
  }

  async function analyze() {
    if (!image) return;
    const id = ++requestRef.current;
    editedRef.current = false;
    setStage("analyzing");
    setLabelSource(null);
    setLabelAdjusted(false);
    setCandidates([]);
    setDetectedPackage(null);
    setCheckingLabel(false);
    try {
      // One normal Gemini photo request. Product search below uses NO Gemini tokens.
      const r = await analyzeFood({ data: { image } });
      if (requestRef.current !== id) return;
      if (!r.ok) {
        setErrMsg(ERRORS[r.error] ?? "Couldn't figure that one out. Try another photo?");
        setStage("error");
        return;
      }
      const estimate = r.estimate;
      setDraft({
        ...emptyDraft(),
        food_name: estimate.food_name,
        serving_description: estimate.serving_description,
        calories: String(estimate.calories),
        protein: String(estimate.protein),
        carbs: String(estimate.carbs),
        fat: String(estimate.fat),
        ai_confidence: estimate.confidence,
      });
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
        if (!result.ok) return; // AI estimate remains available; never invent a match.
        setCandidates(result.foods.slice(0, 5));
        const exact = strictPackageMatch(detected, result.foods);
        if (exact && grams !== null && !editedRef.current) applyLabel(exact, grams);
      } catch {
        // Open Food Facts is optional. The user can edit the AI estimate or find a label manually.
      } finally {
        if (requestRef.current === id) setCheckingLabel(false);
      }
    } catch {
      if (requestRef.current !== id) return;
      setErrMsg(navigator.onLine ? "Couldn't figure that one out. Try another photo?" : "You're offline. We'll reconnect when you're back.");
      setStage("error");
    }
  }

  async function confirm() {
    if (!validDraft(draft)) return void toast.error("Add a name and valid numbers first.");
    setBusy(true);
    editedRef.current = true;
    try {
      // Upload the photo first (non-blocking — meal still saves if upload fails)
      let photoUrl: string | null = null;
      if (image) {
        photoUrl = await uploadMealPhoto(room.id, image);
      }
      await save({ ...draft, photo_url: photoUrl });
      if (rememberPortion && me) {
        try {
          await saveFavoriteMeal({ data: {
            foodName: draft.food_name.trim(),
            servingDescription: draft.serving_description,
            calories: Number(draft.calories || 0),
            protein: Number(draft.protein || 0),
            carbs: Number(draft.carbs || 0),
            fat: Number(draft.fat || 0),
          } });
          await queryClient.invalidateQueries({ queryKey: ["meal-favorites", me.id] });
        } catch {
          toast.error("Meal added, but saving its favourite failed. You can still star it in Today.");
        }
      }
      toast.success("Added ❤️");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save that meal — it wasn't added. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const retake = () => {
    requestRef.current += 1;
    editedRef.current = false;
    setCandidates([]);
    setDetectedPackage(null);
    setLabelSource(null);
    setAmountGrams("");
    setImage(null);
    setStage("pick");
    cameraRef.current?.click();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-xl border-border bg-background">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <DrawerTitle className="font-display text-2xl font-normal">
            {stage === "confirm" ? "What's on the plate? 👀" : "Scan food"}
          </DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-muted-foreground">
            {stage === "confirm" ? "Review the source and portion before saving. A database match is not a verified package label." : "The photo is sent to Gemini for estimation. It is stored privately only when you save the meal."}
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
                    Amount eaten (g/ml)
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
                    Total amount eaten (g/ml)
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
                  <div className="mt-4 text-xs text-muted-foreground">Confidence: <span className="capitalize text-foreground">{draft.ai_confidence}</span></div>
                </div>
              )}
              <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input type="checkbox" checked={rememberPortion} onChange={event => setRememberPortion(event.target.checked)}
                  className="size-4 accent-primary" />
                Save this portion to my favourites for next time
              </label>
              <div className="mt-5 flex flex-col gap-2">
                <Btn size="lg" onClick={confirm} disabled={busy}>{busy ? "Saving…" : "Looks right ❤️"}</Btn>
                <div className="flex gap-2">
                  {!editing && <Btn variant="outline" className="flex-1" onClick={() => setEditing(true)}>Edit</Btn>}
                  <Btn variant="outline" className="flex-1" onClick={retake}>Retake photo</Btn>
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
