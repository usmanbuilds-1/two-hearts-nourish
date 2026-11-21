import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Copy, MoveRight, Pencil, Plus } from "lucide-react";
import { useSpace } from "@/lib/space";
import { Btn, Screen } from "@/components/us/primitives";
import { DiaryNutritionSummary } from "@/components/us/DiaryNutritionSummary";
import { DiaryMealGroup } from "@/components/us/DiaryMealGroup";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { MealSheet } from "@/components/us/MealSheet";
import { DiarySheet } from "@/components/us/DiarySheet";
import { copyMealToDay, copyDayMeals, moveMealToDay } from "@/lib/meal-operations.functions";
import { supabase } from "@/integrations/supabase/client";
import { totals, addDays, MEAL_TYPES, fmt, localDate, type Meal, type MealType } from "@/lib/nutrition";
import { toast } from "sonner";

export const Route = createFileRoute("/_space/diary")({
  component: DiaryView,
});

type ActionKind = "options" | "copy" | "move" | "copyDay";

function DiaryView() {
  const { me, meals, upsertLocal, today } = useSpace();
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(localDate);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<MealType | null>(null);
  const [collapsed, setCollapsed] = useState<Partial<Record<MealType, boolean>>>({});
  const [editMeal, setEditMeal] = useState<Meal | null>(null);
  const [actionMeal, setActionMeal] = useState<Meal | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [pickedDate, setPickedDate] = useState("");
  const [busy, setBusy] = useState(false);
  const copyRequestId = useRef<string | null>(null);

  // SpaceProvider caches the most recent 90 days. Load older Diary dates
  // directly so navigating the calendar never falsely displays "empty".
  const historical = date < addDays(today, -89);
  const history = useQuery<Meal[]>({
    queryKey: ["diary-historical", me.id, date],
    enabled: historical,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("meals")
        .select("*")
        .eq("member_id", me.id)
        .eq("meal_date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Meal[];
    },
  });
  const mine = useMemo(
    () => historical ? (history.data ?? []) : meals.filter(
      meal => meal.meal_date === date && meal.member_id === me.id,
    ),
    [historical, history.data, meals, date, me.id],
  );
  const dayTotals = useMemo(() => totals(mine), [mine]);
  const displayDate = new Date(date + "T12:00:00");
  const shortDate = (value: string) =>
    new Date(value + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function startAdd(type: MealType | null) {
    setAddType(type);
    setAddOpen(true);
  }
  function openAction(meal: Meal, kind: ActionKind) {
    setActionMeal(meal);
    setPickedDate("");
    copyRequestId.current = null;
    setAction(kind);
  }
  function closeAction() {
    if (busy) return;
    setActionMeal(null);
    setAction(null);
    setPickedDate("");
    copyRequestId.current = null;
  }
  async function confirmCopy() {
    if (busy || !actionMeal || !pickedDate) return;
    if (pickedDate === actionMeal.meal_date) {
      toast.error("Choose a different date.");
      return;
    }
    setBusy(true);
    const id = copyRequestId.current ?? crypto.randomUUID();
    copyRequestId.current = id;
    try {
      const res = await copyMealToDay({ data: {
        mealId: actionMeal.id, targetDate: pickedDate, requestId: id,
      } });
      upsertLocal(res.meal);
      void qc.invalidateQueries({ queryKey: ["diary-historical", me.id, pickedDate] });
      toast.success("Meal copied to " + shortDate(pickedDate));
      setAction(null);
      setActionMeal(null);
      setPickedDate("");
      copyRequestId.current = null;
    } catch {
      toast.error("Couldn't confirm the copy. Try again; we won't duplicate it.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmMove() {
    if (busy || !actionMeal || !pickedDate) return;
    if (pickedDate === actionMeal.meal_date) {
      toast.error("Choose a different date.");
      return;
    }
    setBusy(true);
    try {
      const res = await moveMealToDay({ data: {
        mealId: actionMeal.id, sourceDate: actionMeal.meal_date, targetDate: pickedDate,
      } });
      upsertLocal(res.meal);
      void qc.invalidateQueries({ queryKey: ["diary-historical", me.id, actionMeal.meal_date] });
      void qc.invalidateQueries({ queryKey: ["diary-historical", me.id, pickedDate] });
      toast.success("Meal moved to " + shortDate(pickedDate));
      setAction(null);
      setActionMeal(null);
      setPickedDate("");
    } catch {
      toast.error("Couldn't move the meal. Its original entry is unchanged or needs refreshing.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmCopyDay() {
    if (busy || !pickedDate) return;
    if (pickedDate === date) { toast.error("Choose a different date."); return; }
    if (mine.length === 0) { toast.error("There are no meals to copy."); return; }
    setBusy(true);
    try {
      const res = await copyDayMeals({ data: { sourceDate: date, targetDate: pickedDate } });
      res.meals.forEach(upsertLocal);
      void qc.invalidateQueries({ queryKey: ["diary-historical", me.id, pickedDate] });
      toast.success(res.count + (res.count === 1 ? " meal copied to " : " meals copied to ") + shortDate(pickedDate));
      setAction(null);
      setActionMeal(null);
      setPickedDate("");
    } catch {
      toast.error("Couldn't confirm copying the day. Check the destination before retrying.");
    } finally {
      setBusy(false);
    }
  }
  const datePickerLabel = action === "move" ? "Move to" : "Copy to";
  const datePickerConfirm = action === "move" ? confirmMove : action === "copyDay" ? confirmCopyDay : confirmCopy;

  return (
    <Screen className="pb-0">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-primary">Two Hearts Nourish</p>
          <h1 className="mt-1 font-display text-4xl font-normal leading-tight text-foreground">Diary</h1>
        </div>
        <label className="relative flex size-11 cursor-pointer items-center justify-center rounded-xl text-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <span className="sr-only">Choose diary date</span>
          <CalendarDays className="size-5" aria-hidden="true" />
          <input type="date" value={date} onChange={event => setDate(event.target.value || date)}
            aria-label="Choose diary date from calendar"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </header>

      <div className="mt-3 flex items-center gap-2" role="group" aria-label="Diary date navigation">
        <button type="button" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <label className="relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-2 text-sm font-semibold text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <span className="truncate">{displayDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
          <ChevronDown className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <input type="date" value={date} aria-label="Choose diary date"
            onChange={event => setDate(event.target.value || date)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <button type="button" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      {historical && history.isPending ? (
        <p className="mt-6 text-sm text-muted-foreground" role="status">Loading meals for this day…</p>
      ) : historical && history.isError ? (
        <div className="mt-6 space-y-2 border-y border-border py-4">
          <p className="text-sm text-foreground" role="alert">Couldn't load this day's meals. Your existing entries are unchanged.</p>
          <Btn variant="outline" onClick={() => void history.refetch()}>Try again</Btn>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <DiaryNutritionSummary member={me} logged={dayTotals} />
          </div>
          <div className="mt-4">
            {MEAL_TYPES.map(type => (
              <DiaryMealGroup key={type.key}
                type={type.key} label={type.label}
                entries={mine.filter(meal => meal.meal_type === type.key)}
                expanded={!collapsed[type.key]}
                onToggle={() => setCollapsed(previous => ({ ...previous, [type.key]: !previous[type.key] }))}
                onAdd={() => startAdd(type.key)}
                onEdit={setEditMeal}
                onOptions={meal => openAction(meal, "options")} />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Btn size="lg" className="min-w-0 gap-1.5 rounded-xl px-2 text-sm" onClick={() => startAdd(null)}>
              <Plus className="size-4 shrink-0" aria-hidden="true" /> Add meal
            </Btn>
            <Btn size="lg" variant="outline" className="min-w-0 gap-1.5 rounded-xl px-2 text-sm"
              disabled={mine.length === 0}
              onClick={() => { setPickedDate(""); copyRequestId.current = null; setAction("copyDay"); }}>
              <Copy className="size-4 shrink-0" aria-hidden="true" /> Copy day
            </Btn>
          </div>
        </>
      )}

      {/* ── MEAL OPTIONS SHEET ── */}
      <Drawer open={action === "options"} onOpenChange={(o) => !o && !busy && closeAction()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate">{actionMeal?.food_name ?? "Meal options"}</DrawerTitle>
            <DrawerDescription>{actionMeal?.calories} kcal</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 space-y-2 pb-8">
            <Btn variant="outline" className="w-full justify-start gap-3" onClick={() => { closeAction(); setEditMeal(actionMeal); }}>
              <span className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><Pencil className="size-4" /></span>
              Edit meal
            </Btn>
            <Btn variant="outline" className="w-full justify-start gap-3" onClick={() => setAction("copy")}>
              <span className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><Copy className="size-4" /></span>
              Copy meal to another day
            </Btn>
            <Btn variant="outline" className="w-full justify-start gap-3" onClick={() => setAction("move")}>
              <span className="size-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><MoveRight className="size-4" /></span>
              Move meal to another day
            </Btn>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── DATE PICKER SHEET (copy / move / copy day) ── */}
      <Drawer open={action === "copy" || action === "move" || action === "copyDay"} onOpenChange={(o) => !o && !busy && closeAction()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {action === "copyDay"
                ? `Copy ${displayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to…`
                : `${datePickerLabel} another day`}
            </DrawerTitle>
            <DrawerDescription>
              {action === "move"
                ? "Move the same meal to your chosen date. Its photo and portion are preserved."
                : action === "copyDay"
                ? "Each entry on this day will be copied. The originals stay here."
                : "A separate meal will be added. The original stays here; its photo is not copied."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-4 space-y-4 pb-8">
            <input
              type="date"
              value={pickedDate}
              onChange={(e) => { setPickedDate(e.target.value); copyRequestId.current = null; }}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Btn className="w-full" disabled={!pickedDate || busy || pickedDate === (action === "copyDay" ? date : actionMeal?.meal_date)} onClick={datePickerConfirm}>
              {busy ? "Working…" : action === "move" ? "Move meal" : action === "copyDay" ? `Copy ${mine.length} meals` : "Copy meal"}
            </Btn>
            <Btn variant="outline" className="w-full" disabled={busy} onClick={closeAction}>Cancel</Btn>
          </div>
        </DrawerContent>
      </Drawer>

      <DiarySheet key={date + ":" + (addType ?? "auto") + ":" + (addOpen ? "open" : "closed")} open={addOpen} targetDate={date} initialMealType={addType} onOpenChange={value => { setAddOpen(value); if (!value) void qc.invalidateQueries({ queryKey: ["diary-historical", me.id, date] }); }} />
      <MealSheet open={!!editMeal} meal={editMeal} onOpenChange={value => { if (!value) { setEditMeal(null); void qc.invalidateQueries({ queryKey: ["diary-historical", me.id, date] }); } }} />
    </Screen>
  );
}
