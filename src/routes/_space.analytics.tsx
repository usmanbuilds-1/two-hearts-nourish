import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getWeeklySummary } from "@/lib/meal-operations.functions";
import { Screen, Eyebrow } from "@/components/us/primitives";

export const Route = createFileRoute("/_space/analytics")({
  component: AnalyticsView,
});

function AnalyticsView() {
  const { data: summary } = useQuery({
    queryKey: ["weekly-summary"],
    queryFn: () => getWeeklySummary(),
  });

  return (
    <Screen>
      <div className="space-y-4">
        <Eyebrow>This Week</Eyebrow>

        {summary ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Avg Calories</div>
                <div className="text-2xl font-bold">{summary.avgCalories}</div>
                <div className="text-xs text-muted-foreground mt-1">{summary.daysLogged} days</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Target Hit</div>
                <div className="text-2xl font-bold">{summary.targetAdherence}%</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Avg Protein</div>
                <div className="text-2xl font-bold">{summary.avgProtein}g</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Avg Carbs</div>
                <div className="text-2xl font-bold">{summary.avgCarbs}g</div>
              </div>
            </div>

            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-xs text-muted-foreground mb-2">Avg Fat</div>
              <div className="text-2xl font-bold">{summary.avgFat}g</div>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Loading analytics...
          </div>
        )}
      </div>
    </Screen>
  );
}
