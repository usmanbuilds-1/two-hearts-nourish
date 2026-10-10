import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWeeklySummary } from "@/lib/meal-operations.functions";
import { Screen, Eyebrow, Btn } from "@/components/us/primitives";
import { MacroSuggestions } from "@/components/us/MacroSuggestions";
import { useSpace } from "@/lib/space";
import { Sparkles, TrendingUp, Target, Flame, Dumbbell } from "lucide-react";

export const Route = createFileRoute("/_space/analytics")({
  component: AnalyticsView,
});

function AnalyticsView() {
  const { me } = useSpace();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["weekly-summary"],
    queryFn: () => getWeeklySummary(),
  });

  const dailyTarget = me.daily_calorie_target ?? 2000;
  const avgKcal = summary?.avgCalories ?? 0;
  const remainingKcal = Math.max(0, dailyTarget - avgKcal);

  return (
    <Screen>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Weekly Overview ❤️</Eyebrow>

          <Btn size="sm" onClick={() => setSuggestionsOpen(true)} className="text-xs">
            <Sparkles className="size-3.5 mr-1" /> Smart Meal Ideas
          </Btn>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            Calculating your weekly nourishment stats...
          </div>
        ) : summary ? (
          <>
            {/* Top key metric cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-card border border-border rounded-2xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Flame className="size-4 text-orange-500" /> Avg Calories
                </div>
                <div className="text-2xl font-bold num">{summary.avgCalories} <span className="text-xs font-normal text-muted-foreground">kcal/day</span></div>
                <div className="text-xs text-muted-foreground">{summary.daysLogged} days logged</div>
              </div>

              <div className="p-4 bg-card border border-border rounded-2xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Target className="size-4 text-emerald-500" /> Goal Adherence
                </div>
                <div className="text-2xl font-bold num">{summary.targetAdherence}%</div>
                <div className="text-xs text-muted-foreground">Target: {dailyTarget} kcal</div>
              </div>
            </div>

            {/* Macro Breakdown */}
            <div className="p-4 bg-card border border-border rounded-2xl space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Dumbbell className="size-4 text-primary" /> Daily Average Macros
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-secondary/60 rounded-xl">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Protein</div>
                  <div className="text-lg font-bold num">{summary.avgProtein}g</div>
                </div>
                <div className="p-2.5 bg-secondary/60 rounded-xl">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Carbs</div>
                  <div className="text-lg font-bold num">{summary.avgCarbs}g</div>
                </div>
                <div className="p-2.5 bg-secondary/60 rounded-xl">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Fat</div>
                  <div className="text-lg font-bold num">{summary.avgFat}g</div>
                </div>
              </div>
            </div>

            {/* Encouraging message */}
            <div className="p-4 bg-secondary/40 border border-border/60 rounded-2xl flex items-start gap-3">
              <TrendingUp className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs leading-relaxed">
                <p className="font-medium text-foreground">Consistency over perfection ❤️</p>
                <p className="text-muted-foreground">
                  You logged {summary.daysLogged} days this past week. Every logged meal helps you and {me.display_name}'s partner build healthy, lasting habits together.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <MacroSuggestions
        open={suggestionsOpen}
        onOpenChange={setSuggestionsOpen}
        remainingCalories={remainingKcal || 500}
        targetProtein={Number(me.daily_protein_target) || 100}
        targetCarbs={Number(me.daily_carbs_target) || 200}
        targetFat={Number(me.daily_fat_target) || 60}
      />
    </Screen>
  );
}
