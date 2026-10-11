\
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useSpace } from "@/lib/space";
import { addDays, fmt, parseLocalDate, totals } from "@/lib/nutrition";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { MacroSuggestions } from "@/components/us/MacroSuggestions";
import { getWeeklySummary, type WeeklySummary } from "@/lib/meal-operations.functions";
import { getWeightAnalytics, logWeight, type WeightAnalytics } from "@/lib/weight.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_space/week")({
  head: () => ({ meta: [{ title: "Week — Us" }] }),
  component: WeekView,
});

export function WeekAndHistory() { return <WeekView />; }

type Tab = "week" | "history" | "stats" | "weight";

// ── tiny SVG weight chart ────────────────────────────────────────────────
function WeightChart({ analytics }: { analytics: WeightAnalytics }) {
  const { entries, rollingAvg, minWeight, maxWeight } = analytics;
  if (entries.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
        Log at least 2 weights to see your chart
      </div>
    );
  }

  const W = 300;
  const H = 100;
  const PAD = { t: 8, b: 20, l: 8, r: 8 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const lo = (minWeight ?? 0) - 0.5;
  const hi = (maxWeight ?? 100) + 0.5;
  const range = hi - lo || 1;

  const toX = (i: number) => PAD.l + (i / Math.max(entries.length - 1, 1)) * chartW;
  const toY = (kg: number) => PAD.t + chartH - ((kg - lo) / range) * chartH;

  const rawPts   = entries.map((e, i) => `${toX(i)},${toY(e.weight_kg)}`).join(" ");
  const avgPts   = rollingAvg.map((e, i) => `${toX(i)},${toY(e.avg)}`).join(" ");
  const lastX    = toX(entries.length - 1);
  const lastY    = toY(entries[entries.length - 1].weight_kg);

  // x-axis labels: first & last date
  const fmtD = (s: string) => new Date(s + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" preserveAspectRatio="none">
        {/* grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + chartH * (1 - f)} y2={PAD.t + chartH * (1 - f)}
            stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
        ))}
        {/* rolling avg — dashed, softer */}
        {rollingAvg.length >= 2 && (
          <polyline points={avgPts} fill="none"
            stroke="var(--color-primary, #7c3aed)" strokeOpacity="0.35"
            strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* raw line */}
        <polyline points={rawPts} fill="none"
          stroke="var(--color-primary, #7c3aed)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* latest dot */}
        <circle cx={lastX} cy={lastY} r="4" fill="var(--color-primary, #7c3aed)" />
        <circle cx={lastX} cy={lastY} r="7" fill="var(--color-primary, #7c3aed)" fillOpacity="0.18" />
        {/* x-axis labels */}
        <text x={PAD.l} y={H - 3} fontSize="8" fill="currentColor" fillOpacity="0.4">{fmtD(entries[0].logged_date)}</text>
        <text x={W - PAD.r} y={H - 3} fontSize="8" fill="currentColor" fillOpacity="0.4" textAnchor="end">{fmtD(entries[entries.length - 1].logged_date)}</text>
        {/* y-axis labels */}
        <text x={PAD.l} y={PAD.t + 6} fontSize="8" fill="currentColor" fillOpacity="0.4">{hi.toFixed(1)}</text>
        <text x={PAD.l} y={H - PAD.b + 2} fontSize="8" fill="currentColor" fillOpacity="0.4">{lo.toFixed(1)}</text>
      </svg>
      <div className="mt-1 flex gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-px w-4 bg-primary" />Raw</span>
        <span className="flex items-center gap-1"><span className="inline-block h-px w-4 border-t border-dashed border-primary/50" />7-day avg</span>
      </div>
    </div>
  );
}

// ── main view ───────────────────────────────────────────────────────────
function WeekView() {
  const { me, partner, meals, today } = useSpace();
  const [tab, setTab]           = useState<Tab>("week");
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats]       = useState<WeeklySummary | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [suggestOpen, setSuggestOpen]   = useState(false);
  const [wa, setWa]             = useState<WeightAnalytics | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  // quick-log from weight tab
  const [quickKg, setQuickKg]   = useState("");
  const [logging, setLogging]   = useState(false);

  useEffect(() => {
    if (tab === "stats" && !stats && !statsLoading) {
      setStatsLoading(true);
      getWeeklySummary().then(setStats).catch(() => {}).finally(() => setStatsLoading(false));
    }
    if (tab === "weight" && !wa && !waLoading) {
      setWaLoading(true);
      getWeightAnalytics().then(setWa).catch(() => {}).finally(() => setWaLoading(false));
    }
  }, [tab, stats, statsLoading, wa, waLoading]);

  async function quickLog() {
    const val = parseFloat(quickKg.replace(",", "."));
    if (isNaN(val) || val < 20 || val > 400) { toast.error("Enter a valid weight (20–400 kg)"); return; }
    setLogging(true);
    try {
      await logWeight({ data: { weightKg: val } });
      toast.success("Weight logged ✓");
      setQuickKg("");
      // refresh analytics
      setWa(null); setWaLoading(false);
    } catch { toast.error("Couldn't save. Please try again."); }
    finally { setLogging(false); }
  }

  // ── calorie chart data ──
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

  // ── 30-day history data ──
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

  const TABS: { key: Tab; label: string }[] = [
    { key: "week",    label: "Week" },
    { key: "history", label: "30 Days" },
    { key: "stats",   label: "Stats" },
    { key: "weight",  label: "Weight" },
  ];

  return (
    <Screen>
      {/* Tab bar — 4 cols */}
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1 mb-5">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("rounded-lg py-2 text-[13px] font-medium transition-colors",
              tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
            {label}
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
                  <span className={cn("size-2 rounded-full", status === "both" ? "bg-primary" : status === "one" ? "bg-partner" : "bg-border")} />
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
          {statsLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
          {!statsLoading && stats && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-1">Avg Calories</div>
                  <div className="num text-2xl font-bold">{stats.avgCalories}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{stats.daysLogged} days logged</div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-1">Goal Hit</div>
                  <div className="num text-2xl font-bold">{stats.targetAdherence}%</div>
                  <div className="mt-1 text-xs text-muted-foreground">Target: {dailyTarget} kcal</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[["Protein", `${stats.avgProtein}g`], ["Carbs", `${stats.avgCarbs}g`], ["Fat", `${stats.avgFat}g`]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-secondary/60 p-3 text-center">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</div>
                    <div className="num text-lg font-bold">{v}</div>
                  </div>
                ))}
              </div>
              {!stats.daysLogged && (
                <p className="py-4 text-center text-sm text-muted-foreground">No meals logged this week yet.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: WEIGHT ── */}
      {tab === "weight" && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Weight Tracker</h2>

          {/* quick log */}
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="20"
              max="400"
              placeholder="Log today's weight…"
              value={quickKg}
              onChange={(e) => setQuickKg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && quickLog()}
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            <span className="shrink-0 text-sm text-muted-foreground">kg</span>
            <Btn size="sm" onClick={quickLog} disabled={logging || !quickKg}>
              {logging ? "…" : "Log"}
            </Btn>
          </div>

          {waLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}

          {!waLoading && wa && wa.entries.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No weight data yet. Log your first weight above to start tracking.
            </div>
          )}

          {!waLoading && wa && wa.entries.length > 0 && (
            <>
              {/* Plateau alert */}
              {wa.plateauDetected && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Plateau detected</p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                      Your weight has changed less than 0.5 kg over {wa.plateauDays} days. Consider adjusting calories or activity.
                    </p>
                  </div>
                </div>
              )}

              {/* Chart */}
              <WeightChart analytics={wa} />

              {/* Key stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-1">Current</div>
                  <div className="num text-2xl font-bold">{wa.latestWeight} <span className="text-sm font-normal text-muted-foreground">kg</span></div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-1">Average (90 days)</div>
                  <div className="num text-2xl font-bold">{wa.avgWeight} <span className="text-sm font-normal text-muted-foreground">kg</span></div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-1">Change since start</div>
                  <div className={cn("num text-2xl font-bold flex items-center gap-1.5",
                    (wa.totalChange ?? 0) > 0 ? "text-green-600" : (wa.totalChange ?? 0) < 0 ? "text-red-500" : "")}>
                    {(wa.totalChange ?? 0) > 0 && <TrendingUp className="size-5" />}
                    {(wa.totalChange ?? 0) < 0 && <TrendingDown className="size-5" />}
                    {(wa.totalChange ?? 0) > 0 ? "+" : ""}{wa.totalChange} kg
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-1">Trend / week</div>
                  {wa.trendKgPerWeek !== null ? (
                    <div className={cn("num text-2xl font-bold flex items-center gap-1.5",
                      wa.trendKgPerWeek > 0.05 ? "text-green-600" : wa.trendKgPerWeek < -0.05 ? "text-red-500" : "text-muted-foreground")}>
                      {wa.trendKgPerWeek > 0 && <TrendingUp className="size-5" />}
                      {wa.trendKgPerWeek < 0 && <TrendingDown className="size-5" />}
                      {wa.trendKgPerWeek > 0 ? "+" : ""}{wa.trendKgPerWeek} kg
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Log more to see trend</div>
                  )}
                </div>
              </div>

              {/* Log history */}
              <Eyebrow>Recent entries</Eyebrow>
              <div className="space-y-1.5">
                {[...wa.entries].reverse().slice(0, 10).map((e) => {
                  const ravg = wa.rollingAvg.find((r) => r.logged_date === e.logged_date);
                  return (
                    <div key={e.logged_date} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        {new Date(e.logged_date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      <div className="flex items-center gap-3">
                        {ravg && ravg.avg !== e.weight_kg && (
                          <span className="text-xs text-muted-foreground">avg {ravg.avg} kg</span>
                        )}
                        <span className="num font-semibold">{e.weight_kg} kg</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
