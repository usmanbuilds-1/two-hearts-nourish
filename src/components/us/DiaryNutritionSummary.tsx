import { Link } from "@tanstack/react-router";
import { fmt, type Member, type Totals } from "@/lib/nutrition";

export function diaryProgress(value: number, target: number | null | undefined): number {
  const n = Number(target);
  if (!Number.isFinite(value) || !Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(100, value / n * 100));
}

/** Matches Today's real member targets, without inferred calorie or macro goals. */
export function DiaryNutritionSummary({ member, logged }: { member: Member; logged: Totals }) {
  const target = Number(member.daily_calorie_target ?? 0);
  const remaining = target > 0 ? target - logged.calories : null;
  const macros = [
    { key: "protein", title: "Protein", value: logged.protein, goal: Number(member.daily_protein_target ?? 0) },
    { key: "carbs", title: "Carbs", value: logged.carbs, goal: Number(member.daily_carbs_target ?? 0) },
    { key: "fat", title: "Fat", value: logged.fat, goal: Number(member.daily_fat_target ?? 0) },
  ] as const;
  return (
    <section aria-label="Your daily nutrition" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="num font-display text-[2.35rem] font-medium leading-none tracking-tight text-foreground">
            {fmt(logged.calories)}
          </span>
          <span className="num text-sm text-muted-foreground">
            {target > 0 ? `/ ${fmt(target)} kcal` : "kcal logged"}
          </span>
        </div>
        {remaining !== null ? (
          <span className="num rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            {remaining >= 0 ? `${fmt(remaining)} remaining` : `${fmt(-remaining)} above target`}
          </span>
        ) : (
          <Link to="/settings" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Set a calorie goal
          </Link>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-primary/15"
        role="progressbar" aria-label="Calories logged against daily target"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(diaryProgress(logged.calories, target))}>
        <div className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${diaryProgress(logged.calories, target)}%` }} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border pb-4 pt-2">
        {macros.map(({ key, title, value, goal }) => (
          <div key={key} className="min-w-0 px-2 first:pl-0 last:pr-0">
            <p className="text-xs font-medium text-foreground">{title}</p>
            <p className="num mt-0.5 text-sm font-semibold text-foreground">
              {fmt(value)} <span className="font-normal text-muted-foreground">{goal > 0 ? `/ ${fmt(goal)} g` : "g"}</span>
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-primary/15"
              role="progressbar" aria-label={`${title} logged against daily target`}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(diaryProgress(value, goal))}>
              <div className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${diaryProgress(value, goal)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
