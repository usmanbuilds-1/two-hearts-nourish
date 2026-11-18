import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSpace } from "@/lib/space";
import { addDays, fmt } from "@/lib/nutrition";
import {
  acknowledgeAdaptiveTargetChange,
  getAdaptiveTargetStatus,
  markNutritionDayComplete,
} from "@/lib/adaptive-target.functions";
import { Btn, Eyebrow } from "@/components/us/primitives";

export function AdaptiveTargetCard() {
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

  if (status.isPending || status.isError || !status.data) return null;
  const data = status.data;
  const change = data.latestUnseenChange;

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
            Your previous target fell outside the Hall-model 95% confidence interval
            from your confirmed intake and weight data.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-secondary p-3">
              <div className="text-muted-foreground">Model target range</div>
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
                {" "}({fmt(change.maintenanceCi95Low)}–{fmt(change.maintenanceCi95High)} at 95% confidence).
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

      {data.enabled && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <Eyebrow>Adaptive target evidence</Eyebrow>
          {!data.configurationReady ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Finish the adaptive-target setup in Settings before the model can evaluate your target.
              </p>
              <Link
                to="/settings"
                className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary"
              >
                Open Settings
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Only days you confirm as fully logged are allowed into the calorie model.
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Was yesterday fully logged?</div>
                  <div className="text-xs text-muted-foreground">{yesterday}</div>
                </div>
                <Btn
                  variant={data.yesterdayComplete ? "outline" : "primary"}
                  onClick={() => void setComplete(!data.yesterdayComplete)}
                >
                  {data.yesterdayComplete ? "Undo" : "Yes, complete"}
                </Btn>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Only confirm this if all food and calorie-containing drinks from yesterday are in the diary.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
