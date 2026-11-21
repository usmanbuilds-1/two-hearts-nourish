import { fmt, type Member, type Totals } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import type { WeekRow } from "./WeekOverview";

type MacroKey = "protein" | "carbs" | "fat";
const MACROS: { key: MacroKey; label: string; targetKey: "daily_protein_target" | "daily_carbs_target" | "daily_fat_target" }[] = [
  { key: "protein", label: "Protein", targetKey: "daily_protein_target" },
  { key: "carbs", label: "Carbs", targetKey: "daily_carbs_target" },
  { key: "fat", label: "Fat", targetKey: "daily_fat_target" },
];

/** Only average dates with at least one consumed meal. Empty days and planned
 * entries must not be treated as 0 g of intake. Rows originate from the Week
 * overview's consumed-only meal filter.
 */
export function averageWeekMacros(rows: WeekRow[], owner: "mine" | "theirs"): {
  days: number;
  average: Record<MacroKey, number> | null;
} {
  const logged = rows.map(row => row[owner]).filter(total => total.count > 0);
  if (!logged.length) return { days: 0, average: null };
  const average = (key: MacroKey) =>
    logged.reduce((sum: number, total: Totals) => sum + total[key], 0) / logged.length;
  return {
    days: logged.length,
    average: { protein: average("protein"), carbs: average("carbs"), fat: average("fat") },
  };
}

function PersonMacroProgress({
  name, member, rows, owner, color,
}: {
  name: string;
  member: Member;
  rows: WeekRow[];
  owner: "mine" | "theirs";
  color: "you" | "partner";
}) {
  const { days, average } = averageWeekMacros(rows, owner);
  return (
    <section aria-label={`${name} average macros`} className="border-t border-border py-4 first:border-t-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
        <p className="shrink-0 text-xs text-muted-foreground">{days} / 7 days logged</p>
      </div>
      {!average ? (
        <p className="text-sm text-muted-foreground">No food logged for this period.</p>
      ) : (
        <div className="space-y-3">
          {MACROS.map(({ key, label, targetKey }) => {
            const goal = Number(member[targetKey] ?? 0);
            const hasGoal = Number.isFinite(goal) && goal > 0;
            const value = average[key];
            const ratio = hasGoal ? value / goal : null;
            const pct = ratio === null ? null : Math.max(0, Math.min(100, ratio * 100));
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="num text-xs font-medium text-foreground">
                    {fmt(value)} g
                    <span className="font-normal text-muted-foreground">
                      {hasGoal ? ` / ${fmt(goal)} g` : " · No goal"}
                    </span>
                  </span>
                </div>
                {pct !== null && (
                  <div role="progressbar" aria-label={`${name} average ${label.toLowerCase()} against goal`}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
                    className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className={cn("h-full rounded-full transition-[width]",
                      color === "you" ? "bg-primary" : "bg-partner")}
                      style={{ width: `${pct}%` }}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function WeekMacroProgress({
  rows, me, partner,
}: {
  rows: WeekRow[];
  me: Member;
  partner: Member | null;
}) {
  return (
    <section aria-label="Weekly macro progress" className="border-t border-border pt-4">
      <div className="mb-1">
        <h2 className="font-display text-[1.4rem] font-normal text-foreground">Macro progress</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Daily average on logged days, compared with each person’s own goal.
          Unlogged days are excluded.
        </p>
      </div>
      <PersonMacroProgress name="You" member={me} rows={rows} owner="mine" color="you" />
      {partner && (
        <PersonMacroProgress name={partner.display_name || "Partner"} member={partner}
          rows={rows} owner="theirs" color="partner"/>
      )}
    </section>
  );
}
