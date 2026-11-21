import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSpace } from "@/lib/space";
import { addDays, fmt } from "@/lib/nutrition";
import {
  acknowledgeAdaptiveTargetChange,
  getAdaptiveTargetStatus,
  markNutritionDayComplete,
} from "@/lib/adaptive-target.functions";
import { Btn, Eyebrow } from "@/components/us/primitives";

export function AdaptiveTargetCard({ location = "today" }: { location?: "today" | "settings" } = {}) {
  const { me, today, setMember } = useSpace();
  const queryClient = useQueryClient();
  const yesterday = addDays(today, -1);

  const status = useQuery({
    queryKey: ["adaptive-target-status", me.id, today],
    queryFn: () => getAdaptiveTargetStatus({ data: { clientDate: today } }),
    staleTime: 30_000,
  });

  async function setComplete(complete: boolean) {
    try {
      const result = await markNutritionDayComplete({
        data: {
          logDate: yesterday,
          clientDate: today,
          complete,
        },
      });
      if (!result.ok) {
        toast.error("Couldn't update the completed-day record.");
        return;
      }
      if (result.change) {
        setMember({
          ...me,
          daily_calorie_target: result.change.newTarget,
        });
        toast.success("Your calorie target was updated from your logged data.");
      } else {
        toast.success(complete ? "Yesterday marked fully logged" : "Yesterday marked incomplete");
      }
      await queryClient.invalidateQueries({
        queryKey: ["adaptive-target-status", me.id, today],
      });
    } catch {
      toast.error("Couldn't update the completed-day record.");
    }
  }

  async function acknowledge(historyId: string) {
    try {
      await acknowledgeAdaptiveTargetChange({ data: { historyId } });
      await queryClient.invalidateQueries({
        queryKey: ["adaptive-target-status", me.id, today],
      });
    } catch {
      toast.error("Couldn't dismiss this update.");
    }
  }

  if (status.isPending) return null;
  if (status.isError || !status.data) {
    if (location === "today") return null;
    return (
      <div className="mt-4 rounded-xl border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Adaptive target status could not be checked. Your saved calorie target has not been changed here.
        </p>
        <Btn variant="outline" className="mt-2" onClick={() => void status.refetch()}>
          Try again
        </Btn>
      </div>
    );
  }
  const data = status.data;
  const change = data.latestUnseenChange;
  const needsConfirmation = data.enabled && data.configurationReady && !data.yesterdayComplete;
  // A confirmed day should not occupy space on Today every time someone opens
  // the app. The persistent record and its reversal live in Settings.
  if (location === "today" && !change && !needsConfirmation) return null;
  if (location === "settings" && !data.enabled) return null;

  return (
    <div className="mt-4 space-y-3">
      {change && (
        <section className="rounded-2xl border border-primary/30 bg-card p-4">
          <Eyebrow className="text-primary">Calorie target updated</Eyebrow>
          <div className="mt-2 flex items-baseline gap-2">
            {change.oldTarget != null && (
              <>
                <span className="num text-lg text-muted-foreground line-through">
                  {fmt(change.oldTarget)}
                </span>
                <span className="text-muted-foreground">→</span>
              </>
            )}
            <span className="num text-3xl font-semibold">{fmt(change.newTarget)}</span>
            <span className="text-sm text-muted-foreground">kcal/day</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Only your calorie target changes automatically; existing protein, carb and fat targets
            remain your preferences and may need review in Settings.
            Your previous target fell outside the Hall-model statistical interval
            from your confirmed intake and weight data. It is not a clinical
            confidence interval and cannot account for unlogged or inaccurately estimated food.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-secondary p-3">
              <div className="text-muted-foreground">Model-only target range</div>
              <div className="num mt-1 font-medium text-foreground">
                {fmt(change.targetCi95Low)}–{fmt(change.targetCi95High)} kcal
              </div>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <div className="text-muted-foreground">Evidence used</div>
              <div className="num mt-1 font-medium text-foreground">
                {change.completeDays} days · {change.weightPoints} weights
              </div>
            </div>
          </div>
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">
              Why this changed
            </summary>
            <div className="space-y-2 pb-2 leading-relaxed">
              <p>
                Estimated maintenance: {fmt(change.estimatedMaintenance)} kcal/day
                {" "}({fmt(change.maintenanceCi95Low)}–{fmt(change.maintenanceCi95High)} model-only interval; food logging error is excluded).
              </p>
              <p>
                Goal pace: {change.targetRatePctPerWeek}% body weight/week
                {" "}({change.desiredKgPerWeek >= 0 ? "+" : ""}{change.desiredKgPerWeek.toFixed(3)} kg/week at the latest measured weight).
              </p>
              <p>
                Model fit RMSE: {change.modelRmseKg.toFixed(3)} kg.
              </p>
              <ul className="list-disc space-y-1 pl-4">
                {change.sourceReferences.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </div>
          </details>
          <Btn variant="outline" className="mt-2 w-full" onClick={() => void acknowledge(change.id)}>
            Got it
          </Btn>
        </section>
      )}

      {location === "today" && needsConfirmation && (
        <section className="flex items-center justify-between gap-3 border-y border-border py-3" aria-label="Yesterday's food log">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Finished logging yesterday?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {yesterday} · Confirm only if all meals and calorie-containing drinks are recorded.
            </p>
          </div>
          <Btn variant="outline" className="shrink-0 text-primary" onClick={() => void setComplete(true)}>
            Confirm
          </Btn>
        </section>
      )}
      {location === "settings" && (
        <section className="border-t border-border pt-4" aria-labelledby="adaptive-day-review">
          <Eyebrow>Food log confirmations</Eyebrow>
          <p id="adaptive-day-review" className="mt-2 text-sm font-medium text-foreground">
            Yesterday · {yesterday}
          </p>
          {!data.configurationReady ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Save your goal, activity and pace above before confirming days.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.yesterdayComplete
                  ? "Marked fully logged. You can correct this record here."
                  : "Not confirmed. Only mark complete when every meal and calorie-containing drink is in your diary."}
              </p>
              <Btn variant="outline" className="mt-3" onClick={() => void setComplete(!data.yesterdayComplete)}>
                {data.yesterdayComplete ? "Undo confirmation" : "Mark yesterday complete"}
              </Btn>
              {data.yesterdayComplete && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Undo removes the completeness record. It does not reverse a calorie-target adjustment already applied.
                </p>
              )}
              <details className="mt-3 text-sm text-muted-foreground">
                <summary className="min-h-11 cursor-pointer py-2 text-primary">How adaptive targets use this</summary>
                <p className="pb-2 text-xs leading-relaxed">
                  The model compares dated weight changes with consecutive days of complete food logs.
                  A weight entry alone cannot change your target. Adjustments require at least 21
                  consecutive fully logged days and four weights spanning 14 days. These are conservative
                  safeguards rather than research-validated cutoffs.
                </p>
              </details>
            </>
          )}
        </section>
      )}
    </div>
  );
}
