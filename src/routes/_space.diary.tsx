import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Copy, MoreHorizontal, MoveRight, Plus, Trash2 } from "lucide-react";
import { useSpace } from "@/lib/space";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { MealSheet } from "@/components/us/MealSheet";
import { DiarySheet } from "@/components/us/DiarySheet";
import { copyMealToDay, copyDayMeals } from "@/lib/meal-operations.functions";
import { supabase } from "@/integrations/supabase/client";
import { totals, addDays, MEAL_TYPES, fmt } from "@/lib/nutrition";
import type { Meal } from "@/lib/nutrition";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space/diary")({
  component: DiaryView,
});

/** today's local date as YYYY-MM-DD without UTC drift */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ActionKind = "options" | "copy" | "move" | "copyDay";

function DiaryView() {
  const { me, meals, upsertLocal, removeLocal, reload } = useSpace();
  const [date, setDate] = useState<string>(localToday);
  const [addOpen, setAddOpen] = useState(false);
  const [editMeal, setEditMeal] = useState<Meal | null>(null);

  // Action sheet state
  const [actionMeal, setActionMeal] = useState<Meal | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [pickedDate, setPickedDate] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const mine = useMemo(
    () => meals.filter((m) => m.meal_date === date && m.member_id === me.id),
    [meals, date, me.id],
  );
  const dayTotals = useMemo(() => totals(mine), [mine]);
  const target = me.daily_calorie_target ?? 0;
  const remaining = target > 0 ? target - dayTotals.calories : null;

  function prevDay() { setDate(addDays(date, -1)); }
  function nextDay() { setDate(addDays(date, 1)); }
  const displayDate = new Date(date + "T12:00:00");

  function openAction(meal: Meal, kind: ActionKind) {
    setActionMeal(meal);
    setPickedDate(localToday());
    setAction(kind);
  }

  function closeAction() { setActionMeal(null); setAction(null); setPickedDate(""); }

  async function confirmCopy() {
    if (!actionMeal || !pickedDate) return;
    if (pickedDate === actionMeal.meal_date) {
      toast.error("That's the same day — pick a different date.");
      return;
    }
    setBusy(true);
    try {
      const res = await copyMealToDay({ data: { mealId: actionMeal.id, targetDate: pickedDate } });
      upsertLocal(res.meal);
      toast.success(`Copied to ${new Date(pickedDate + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
      closeAction();
    } catch {
      toast.error("Couldn't copy meal. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMove() {
    if (!actionMeal || !pickedDate) return;
    if (pickedDate === actionMeal.meal_date) {
      toast.error("That's the same day — pick a different date.");
      return;
    }
    setBusy(true);
    try {
      const res = await copyMealToDay({ data: { mealId: actionMeal.id, targetDate: pickedDate } });
      upsertLocal(res.meal);
      const { error } = await supabase.from("meals").delete().eq("id", actionMeal.id);
      if (error) throw new Error("delete");
      removeLocal(actionMeal.id);
      toast.success(`Moved to ${new Date(pickedDate + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
      closeAction();
    } catch {
      toast.error("Couldn't move meal. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCopyDay() {
    if (!pickedDate) return;
    if (pickedDate === date) { toast.error("Pick a different day."); return; }
    if (mine.length === 0) { toast.error("No meals on this day to copy."); return; }
    setBusy(true);
    try {
      const res = await copyDayMeals({ data: { sourceDate: date, targetDate: pickedDate } });
      await reload();
      toast.success(`${res.count} meal${res.count === 1 ? "" : "s"} copied to ${new Date(pickedDate + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
      closeAction();
    } catch {
      toast.error("Couldn't copy day. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const datePickerLabel = action === "move" ? "Move to" : "Copy to";
  const datePickerConfirm = action === "move" ? confirmMove : action === "copyDay" ? confirmCopyDay : confirmCopy;

  return (
    <Screen>
      <div className="space-y-4">
        {/* Date navigation */}
        <div className="flex items-center justify-between">
          <Btn size="sm" variant="ghost" onClick={prevDay}><ChevronLeft className="size-4" /></Btn>
          <span className="font-medium">
            {displayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
          <Btn size="sm" variant="ghost" onClick={nextDay}><ChevronRight className="size-4" /></Btn>
        </div>

        {/* Macro summary ring */}
        <div className="grid grid-cols-4 gap-2 rounded-2xl border border-border bg-card p-3">
          {[
            ["Kcal", dayTotals.calories, target || null],
            ["P", dayTotals.protein, Number(me.daily_protein_target) || null],
            ["C", dayTotals.carbs,   Number(me.daily_carbs_target)  || null],
            ["F", dayTotals.fat,     Number(me.daily_fat_target)    || null],
          ].map(([label, val, tgt]) => (
            <div key={label as string} className="text-center">
              <div className="text-[10px] text-muted-foreground">{label as string}</div>
              <div className="num font-bold text-sm">{fmt(val as number)}{label !== "Kcal" ? "g" : ""}</div>
              {tgt ? <div className="text-[10px] text-muted-foreground">/ {fmt(tgt as number)}</div> : null}
            </div>
          ))}
        </div>

        {/* Remaining / over */}
        {remaining !== null && (
          <p className={cn("text-center text-sm font-medium", remaining >= 0 ? "text-primary" : "text-destructive")}>
            {remaining >= 0 ? `${fmt(remaining)} kcal remaining` : `${fmt(Math.abs(remaining))} kcal over target`}
          </p>
        )}

        {/* Meals by type */}
        {MEAL_TYPES.map((t) => {
          const list = mine.filter((m) => m.meal_type === t.key);
          return (
            <div key={t.key}>
              <Eyebrow className="mb-2">{t.label} {t.icon}</Eyebrow>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 pl-1">Not logged yet</p>
              ) : (
                <div className="space-y-2">
                  {list.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                      {/* tap food name to edit */}
                      <button className="min-w-0 flex-1 text-left" onClick={() => setEditMeal(m)}>
                        <div className="truncate text-sm font-medium">{m.food_name}</div>
                        {m.serving_description && <div className="text-xs text-muted-foreground">{m.serving_description}</div>}
                      </button>
                      {/* macro summary */}
                      <div className="num text-right text-xs shrink-0 text-muted-foreground">
                        <div className="font-semibold text-foreground">{fmt(m.calories)} kcal</div>
                        <div>P {fmt(Number(m.protein))}g</div>
                      </div>
                      {/* ⋯ action menu */}
                      <button
                        onClick={() => openAction(m, "options")}
                        className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        aria-label="Meal options"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom actions */}
        <div className="pt-2 border-t space-y-2">
          <Btn className="w-full" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-2" />
            Add to {displayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Btn>
          {mine.length > 0 && (
            <Btn variant="outline" className="w-full text-sm" onClick={() => { setPickedDate(localToday()); setAction("copyDay"); }}>
              <Copy className="size-4 mr-2" /> Copy entire day to another day
            </Btn>
          )}
        </div>
      </div>

      {/* ── MEAL OPTIONS SHEET ── */}
      <Drawer open={action === "options"} onOpenChange={(o) => !o && closeAction()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate">{actionMeal?.food_name ?? "Meal options"}</DrawerTitle>
            <DrawerDescription>{actionMeal?.calories} kcal</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 space-y-2 pb-8">
            <Btn variant="outline" className="w-full justify-start gap-3" onClick={() => { closeAction(); setEditMeal(actionMeal); }}>
              <span className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0">✏️</span>
              Edit meal
            </Btn>
            <Btn variant="outline" className="w-full justify-start gap-3" onClick={() => setAction("copy")}>
              <span className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><Copy className="size-4" /></span>
              Copy to another day
            </Btn>
            <Btn variant="outline" className="w-full justify-start gap-3" onClick={() => setAction("move")}>
              <span className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><MoveRight className="size-4" /></span>
              Move to another day
            </Btn>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── DATE PICKER SHEET (copy / move / copy day) ── */}
      <Drawer open={action === "copy" || action === "move" || action === "copyDay"} onOpenChange={(o) => !o && closeAction()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {action === "copyDay"
                ? `Copy ${displayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to…`
                : `${datePickerLabel} another day`}
            </DrawerTitle>
            <DrawerDescription>
              {action === "move"
                ? "The meal will be removed from this day."
                : action === "copyDay"
                ? `All ${mine.length} meals will be duplicated to the chosen day.`
                : "A copy will be added to the chosen day."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-4 space-y-4 pb-8">
            <input
              type="date"
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Btn className="w-full" disabled={!pickedDate || busy} onClick={datePickerConfirm}>
              {busy ? "Working…" : action === "move" ? "Move meal" : action === "copyDay" ? `Copy ${mine.length} meals` : "Copy meal"}
            </Btn>
            <Btn variant="outline" className="w-full" onClick={closeAction}>Cancel</Btn>
          </div>
        </DrawerContent>
      </Drawer>

      <DiarySheet open={addOpen} onOpenChange={setAddOpen} targetDate={date} />
      <MealSheet open={!!editMeal} meal={editMeal} onOpenChange={(o) => !o && setEditMeal(null)} />
    </Screen>
  );
}
