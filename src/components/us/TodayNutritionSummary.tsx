import { Heart } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { fmt, totals, type Meal, type Member } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/** A true percentage, clamped for over-target values; no target is not 100%. */
export function goalProgress(value: number, target: number | null | undefined): number {
  if (!Number.isFinite(value) || !Number.isFinite(Number(target)) || Number(target) <= 0) return 0;
  return Math.max(0, Math.min(100, (value / Number(target)) * 100));
}

function CalorieRing({
  label, value, target, partner,
}: { label: string; value: number; target: number; partner: boolean }) {
  const percentage = goalProgress(value, target);
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative mx-auto size-[132px] max-[360px]:size-[112px]"
      role="img"
      aria-label={target > 0
        ? `${label}: ${fmt(value)} of ${fmt(target)} calories logged`
        : `${label}: ${fmt(value)} calories logged, no calorie target set`}>
      <svg viewBox="0 0 112 112" className="size-full" aria-hidden="true">
        <circle cx="56" cy="56" r={radius} fill="none" strokeWidth="8"
          className={cn("stroke-current opacity-15", partner ? "text-partner" : "text-primary")} />
        {target > 0 && (
          <circle cx="56" cy="56" r={radius} fill="none" strokeWidth="8" strokeLinecap="round"
            className={cn("stroke-current", partner ? "text-partner" : "text-primary")}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percentage / 100)}
            transform="rotate(-90 56 56)"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="num text-xl font-semibold leading-none tracking-tight max-[360px]:text-lg">
          {fmt(value)}
        </div>
        <div className="num mt-1 text-[11px] leading-tight text-muted-foreground">
          {target > 0 ? `/ ${fmt(target)}` : "No goal"} kcal
        </div>
      </div>
    </div>
  );
}

const macroLabels = [
  { key: "protein", label: "P" },
  { key: "carbs", label: "C" },
  { key: "fat", label: "F" },
] as const;

/** Uses the existing actual (non-planned) meals and saved member targets. */
export function TodayNutritionSummary({
  me, partner, mine, theirs,
}: { me: Member; partner: Member | null; mine: Meal[]; theirs: Meal[] }) {
  const people = [
    { member: me, label: "You", meals: mine, isPartner: false },
    ...(partner ? [{ member: partner, label: partner.display_name, meals: theirs, isPartner: true }] : []),
  ];
  return (
    <section className="mt-5" aria-label="Daily nutrition for your space">
      <div className={cn("grid", partner ? "grid-cols-2" : "grid-cols-1")}>
        {people.map(({ member, label, meals, isPartner }) => {
          const logged = totals(meals);
          const calorieTarget = Number(member.daily_calorie_target ?? 0);
          return (
            <div key={member.id}
              className={cn("min-w-0 px-3 pb-3 pt-2 text-center sm:px-6",
                isPartner && "border-l border-border")}>
              <p className={cn("mb-2 truncate text-xs font-semibold uppercase tracking-[.11em]",
                isPartner ? "text-partner" : "text-primary")}>
                {label}
              </p>
              <CalorieRing label={label} value={logged.calories}
                target={calorieTarget} partner={isPartner} />
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-left">
                {macroLabels.map(({ key, label: macroLabel }) => {
                  const value = Number(logged[key]);
                  const target = Number(key === "protein"
                    ? member.daily_protein_target
                    : key === "carbs" ? member.daily_carbs_target : member.daily_fat_target);
                  return (
                    <div key={key} className="min-w-0">
                      <div className="num flex flex-wrap items-baseline gap-x-0.5 whitespace-nowrap text-[11px] font-semibold sm:text-xs">
                        <span className="text-muted-foreground">{macroLabel}</span>
                        <span>{fmt(value)}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">g</span>
                      </div>
                      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-secondary"
                        aria-label={target > 0
                          ? `${macroLabel}: ${fmt(value)} of ${fmt(target)} grams`
                          : `${macroLabel}: ${fmt(value)} grams; no target`}>
                        <div className={cn("h-full rounded-full", isPartner ? "bg-partner" : "bg-primary")}
                          style={{ width: `${goalProgress(value, target)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {calorieTarget <= 0 && (
                <Link to="/settings" className="mt-2 inline-flex min-h-8 items-center justify-center text-xs text-primary underline underline-offset-2">
                  Set a calorie goal
                </Link>
              )}
            </div>
          );
        })}
      </div>
      {partner && (
        <p className="mt-1 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <Heart className="size-3 text-primary" aria-hidden="true" />
          Two people, their own goals
        </p>
      )}
    </section>
  );
}
