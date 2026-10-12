import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImageIcon } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Btn } from "./primitives";
import { MealFields, emptyDraft, useSaveMeal, validDraft, type MealDraft } from "./MealSheet";
import { useSpace } from "@/lib/space";
import { compressImage, uploadMealPhoto } from "@/lib/image";
import { analyzeFood } from "@/lib/scan.functions";

type Stage = "pick" | "preview" | "analyzing" | "confirm" | "error";

const ERRORS: Record<string, string> = {
  AI_BUSY: "Lots of people are scanning right now. Give it a moment and try again.",
  AI_CREDITS: "Photo scanning is paused for now (AI usage limit reached). You can still add meals by hand.",
  NOT_MEMBER: "Your session expired. Please reopen your invite link.",
};

export function ScanSheet({ open, onOpenChange, onManual }: { open: boolean; onOpenChange: (o: boolean) => void; onManual: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [image, setImage] = useState<string | null>(null);
  const [draft, setDraft] = useState<MealDraft>(emptyDraft());
  const [editing, setEditing] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const save = useSaveMeal();
  const { room } = useSpace();

  useEffect(() => {
    if (!open) {
      // Photos are held only in memory and discarded when the sheet closes.
      setStage("pick");
      setImage(null);
      setEditing(false);
    }
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImage(await compressImage(file));
      setStage("preview");
    } catch {
      toast.error("Couldn't read that photo. Try another one?");
    }
  }

  async function analyze() {
    if (!image) return;
    setStage("analyzing");
    try {
      const r = await analyzeFood({ data: { image } });
      if (!r.ok) {
        setErrMsg(ERRORS[r.error] ?? "Couldn't figure that one out. Try another photo?");
        setStage("error");
        return;
      }
      const e = r.estimate;
      setDraft({
        ...emptyDraft(),
        food_name: e.food_name,
        serving_description: e.serving_description,
        calories: String(e.calories),
        protein: String(e.protein),
        carbs: String(e.carbs),
        fat: String(e.fat),
        ai_confidence: e.confidence,
      });
      setEditing(false);
      setStage("confirm");
    } catch {
      setErrMsg(navigator.onLine ? "Couldn't figure that one out. Try another photo?" : "You're offline. We'll reconnect when you're back.");
      setStage("error");
    }
  }

  async function confirm() {
    if (!validDraft(draft)) return void toast.error("Add a name and valid numbers first.");
    setBusy(true);
    try {
      // Upload the photo first (non-blocking — meal still saves if upload fails)
      let photoUrl: string | null = null;
      if (image) {
        photoUrl = await uploadMealPhoto(room.id, image);
      }
      await save({ ...draft, photo_url: photoUrl });
      toast.success("Added ❤️");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save that meal — it wasn't added. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const retake = () => {
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
            {stage === "confirm" ? "An estimate from your photo — adjust anything before saving." : "Your photo is saved so your partner can see your plate 👀"}
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
              {editing ? (
                <MealFields draft={draft} onChange={setDraft} />
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
