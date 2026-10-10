import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useSpace } from "@/lib/space";
import { addDays, fmt, parseLocalDate, totals } from "@/lib/nutrition";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { MacroSuggestions } from "@/components/us/MacroSuggestions";
import { getWeeklySummary, type WeeklySummary } from "@/lib/meal-operations.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space/week")({
  head: () => ({ meta: [{ title: "Week — Us" }, { name: "description", content: "Charts, 30-day history and weekly stats." }] }),
  component: WeekView,
});

/** Kept so history.tsx can re-export without error */
export function WeekAndHistory() { return <WeekView />; }

type Tab = "week" | "history" | "stats";

function WeekView() {
  const { me, partner, meals, today } = useSpace();
  const [tab, setTab]       = useState<Tab>("week");
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats]   = useState<WeeklySummary | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    if (tab === "stats" && !stats && !statsLoading) {
      setStatsLoading(true);
      getWeeklySummary().then(setStats).catch(() => {}).finally(() => setStatsLoading(false));
    }
  }, [tab, stats, statsLoading]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today]);
  const rows = useMemo(() => days.map((d) => {
    const mine  = meals.filter((m) => m.meal_date === d && m.member_id === me.id);
    const theirs = partner ? meals.filter((m) => m.meal_date === d && m.member_id === partner.id) : [];
    return { d, mine: totals(mine), theirs: totals(theirs) };
  }), [days, meals, me.id, partner]);

  const avg = (sel: (r: typeof rows[0]) => { calories: number; protein: number; count: number }) => {
    const logged = rows.map(sel).filter((t) => t.count > 0);
    return logged.length
      ? { kcal: logged.reduce((a, t) => a + t.calories, 0) / logged.length, p: logged.reduce((a, t) => a + t.protein, 0) / logged.length, n: logged.reduce((a, t) => a + t.count, 0) }
      : { kcal: 0, p: 0, n: 0 };
  };
  const a1   = avg((r) => r.mine);
  const a2   = avg((r) => r.theirs);
  const both = rows.filter((r) => r.mine.count && r.theirs.count).length;
  const max  = Math.max(1, ...rows.flatMap((r) => [r.mine.calories, r.theirs.calories]));
  const targetPct = me.daily_calorie_target && max > 0 ? Math.min(100, (me.daily_calorie_target / max) * 100) : null;
  const myProteinTarget    = Number(me.daily_protein_target ?? 0);
  const theirProteinTarget = Number(partner?.daily_protein_target ?? 0);

  const last30  = useMemo(() => Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)), [today]);
  const dayData = useMemo(() => last30.map((d) => {
    const mine   = meals.filter((m) => m.meal_date === d && m.member_id === me.id);
    const theirs = partner ? meals.filter((m) => m.meal_date === d && m.member_id === partner.id) : [];
    const myT    = totals(mine);
    const theirT = totals(theirs);
    const myHit    = me.daily_calorie_target ? myT.calories >= me.daily_calorie_target * 0.85 : mine.length > 0;
    const theirHit = partner?.daily_calorie_target ? theirT.calories >= partner.daily_calorie_target * 0.85 : theirs.length > 0;
    const status: "both" | "one" | "empty" =
      mine.length && theirs.length && myHit && theirHit ? "both"
      : mine.length || theirs.length ? "one"
      : "empty";
    return { d, mine, theirs, myT, theirT, status };
  }), [last30, meals, me, partner]);

  const selectedDay = selected ? dayData.find((d) => d.d === selected) : null;
  const dailyTarget = me.daily_calorie_target ?? 2000;

  return (
    <Screen>
      {/* Tab bar */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1 mb-5">
        {(["week", "history", "stats"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("rounded-lg py-2 text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
            {t === "week" ? "This Week" : t === "history" ? "30 Days" : "Stats"}
          </button>
        ))}
      </div>

      {/* ── TAB: THIS WEEK ── */}
      {tab === "week" && (
        <div className="space-y-5">
          <div>
            <h1 className="text-3xl">Our Week ❤️</h1>
            <p className="mt-1 text-muted-foreground">{both} of 7 days you both logged.</p>
          </div>
          <div className="relative flex h-40 items-end gap-2 rounded-2xl border border-border bg-card p-4">
            {rows.map((r) => (
              <div key={r.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 max-w-3 rounded-t bg-primary" style={{ height: `${(r.mine.calories / max) * 100}%` }} />
                  <div className="w-1/2 max-w-3 rounded-t bg-partner" style={{ height: `${(r.theirs.calories / max) * 100}%` }} />
                </div>
                <div className="text-[10px] uppercase text-muted-foreground">
                  {parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "short" })}
                </div>
              </div>
            ))}
            {targetPct !== null && (
              <div className="pointer-events-none absolute inset-x-4 border-t border-dashed border-primary/50" style={{ bottom: `calc(${targetPct}% + 1rem)` }}>
                <span className="absolute -top-4 right-0 text-[10px] text-primary/60">target</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["You", partner?.display_name ?? "Partner"] as const).map((l, i) => {
              const a = i === 0 ? a1 : a2;
              const c = i === 0 ? "text-primary" : "text-partner";
              return (
                <div key={l} className="rounded-2xl border border-border bg-card p-4">
                  <Eyebrow className={c}>{l}</Eyebrow>
                  <div className="num mt-2 text-xl font-semibold">{fmt(a.kcal)} <span className="text-sm font-normal text-muted-foreground">avg kcal</span></div>
                  <div className="num text-sm">{fmt(a.p)}g avg protein</div>
                  <div className="num text-xs text-muted-foreground">{a.n} meals</div>
                </div>
              );
            })}
          </div>
          <Eyebrow>Protein this week</Eyebrow>
          <div className="space-y-2">
            {rows.map((r) => {
              const myPct    = myProteinTarget > 0 ? Math.min(100, (r.mine.protein / myProteinTarget) * 100) : 0;
              const theirPct = theirProteinTarget > 0 ? Math.min(100, (r.theirs.protein / theirProteinTarget) * 100) : 0;
              return (
                <div key={r.d} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-[10px] uppercase text-muted-foreground">
                    {parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <div className="flex-1 space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${myPct}%` }} />
                    </div>
                    {partner && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-partner transition-all" style={{ width: `${theirPct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-primary" />You: {fmt(a1.p)}g avg{myProteinTarget > 0 ? ` · target ${fmt(myProteinTarget)}g` : ""}</span>
            {partner && <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-partner" />{partner.display_name}: {fmt(a2.p)}g avg{theirProteinTarget > 0 ? ` · target ${fmt(theirProteinTarget)}g` : ""}</span>}
          </div>
        </div>
      )}

      {/* ── TAB: 30-DAY HISTORY ── */}
      {tab === "history" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">30-Day History</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tap any day to see what you ate.</p>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {dayData.map(({ d, status }) => {
              const isSelected = selected === d;
              return (
                <button key={d} onClick={() => setSelected(isSelected ? null : d)}
                  className={cn("flex flex-col items-center gap-1 rounded-xl p-2 transition-colors",
                    isSelected ? "bg-secondary ring-1 ring-primary" : "hover:bg-secondary/60")}>
                  <span className="text-[11px] font-medium text-muted-foreground">{parseLocalDate(d).getDate()}</span>
                  <span className={cn("size-2 rounded-full",
                    status === "both" ? "bg-primary" : status === "one" ? "bg-partner" : "bg-border")} />
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-primary" />Both on track</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-partner" />One logged</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-border" />Nothing</span>
          </div>
          {selectedDay && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <Eyebrow>{parseLocalDate(selectedDay.d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Eyebrow>
              {selectedDay.mine.length === 0 && selectedDay.theirs.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nothing logged this day.</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {selectedDay.mine.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium text-primary">You · {fmt(selectedDay.myT.calories)} kcal · {fmt(selectedDay.myT.protein)}g protein</div>
                      <div className="space-y-1.5">{selectedDay.mine.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-sm">
                          <span className="truncate">{m.food_name}</span>
                          <span className="ml-4 shrink-0 num text-xs text-muted-foreground">{fmt(m.calories)} kcal</span>
                        </div>
                      ))}</div>
                    </div>
                  )}
                  {partner && selectedDay.theirs.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium text-partner">{partner.display_name} · {fmt(selectedDay.theirT.calories)} kcal</div>
                      <div className="space-y-1.5">{selectedDay.theirs.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-sm">
                          <span className="truncate">{m.food_name}</span>
                          <span className="ml-4 shrink-0 num text-xs text-muted-foreground">{fmt(m.calories)} kcal</span>
                        </div>
                      ))}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: STATS ── */}
      {tab === "stats" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Weekly Stats</h2>
            <Btn size="sm" onClick={() => setSuggestOpen(true)}>
              <Sparkles className="size-3.5 mr-1" /> Meal Ideas
            </Btn>
          </div>
          {statsLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}
          {!statsLoading && stats && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-card border border-border rounded-2xl">
                  <div className="text-xs text-muted-foreground mb-1">Avg Calories</div>
                  <div className="text-2xl font-bold num">{stats.avgCalories}</div>
                  <div className="text-xs text-muted-foreground mt-1">{stats.daysLogged} days logged</div>
                </div>
                <div className="p-4 bg-card border border-border rounded-2xl">
                  <div className="text-xs text-muted-foreground mb-1">Goal Hit</div>
                  <div className="text-2xl font-bold num">{stats.targetAdherence}%</div>
                  <div className="text-xs text-muted-foreground mt-1">Target: {dailyTarget} kcal</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[["Protein", `${stats.avgProtein}g`], ["Carbs", `${stats.avgCarbs}g`], ["Fat", `${stats.avgFat}g`]].map(([l, v]) => (
                  <div key={l} className="p-3 bg-secondary/60 rounded-xl text-center">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{l}</div>
                    <div className="text-lg font-bold num">{v}</div>
                  </div>
                ))}
              </div>
              {!stats.daysLogged && (
                <p className="text-sm text-muted-foreground text-center py-4">No meals logged this week yet — start adding meals to see your stats.</p>
              )}
            </>
          )}
        </div>
      )}

      <MacroSuggestions
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        remainingCalories={Math.max(100, (me.daily_calorie_target ?? 2000) - (stats?.avgCalories ?? 0))}
        targetProtein={Number(me.daily_protein_target) || 100}
        targetCarbs={Number(me.daily_carbs_target) || 200}
        targetFat={Number(me.daily_fat_target) || 60}
      />
    </Screen>
  );
}
