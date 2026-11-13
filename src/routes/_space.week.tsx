
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useSpace } from "@/lib/space";
import { addDays, fmt, parseLocalDate, totals } from "@/lib/nutrition";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { MacroSuggestions } from "@/components/us/MacroSuggestions";
import { Lightbox } from "@/components/us/Lightbox";
import { PrivateMealPhoto } from "@/components/us/PrivateMealPhoto";
import { signedMealPhotoUrl } from "@/lib/private-photo";
import { getWeeklySummary, type WeeklySummary } from "@/lib/meal-operations.functions";
import { localDate } from "@/lib/nutrition";
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
  const lastY    = toY(entries[entries.length - 1]!.weight_kg);

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
        <text x={PAD.l} y={H - 3} fontSize="8" fill="currentColor" fillOpacity="0.4">{fmtD(entries[0]!.logged_date)}</text>
        <text x={W - PAD.r} y={H - 3} fontSize="8" fill="currentColor" fillOpacity="0.4" textAnchor="end">{fmtD(entries[entries.length - 1]!.logged_date)}</text>
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
  const { me, partner, meals, today, room } = useSpace();
  const [tab, setTab]           = useState<Tab>("week");
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats]       = useState<WeeklySummary | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [suggestOpen, setSuggestOpen]   = useState(false);
  const [weekOffset, setWeekOffset]     = useState(0);
  const [wa, setWa]             = useState<WeightAnalytics | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  // quick-log from weight tab
  const [quickKg, setQuickKg]   = useState("");
  const [logging, setLogging]   = useState(false);
  const [tappedDay, setTappedDay]           = useState<string | null>(null);
  const [lightbox, setLightbox]             = useState<{ src: string; caption: string } | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState(() => me.id);

  useEffect(() => {
    if (tab === "stats") {
      setStatsLoading(true);
      setStatsError(false);
      setStats(null);
      getWeeklySummary({ data: { clientDate: localDate(), weekOffset, memberId: selectedMemberId } })
        .then(setStats)
        .catch((err) => { console.error('Failed to load weekly summary:', err); setStatsError(true); })
        .finally(() => setStatsLoading(false));
    }
    if (tab === "weight" && !wa) {
      setWaLoading(true);
      getWeightAnalytics({ data: { clientDate: localDate() } }).then(setWa).catch(() => setWa({ entries: [], rollingAvg: [], latestWeight: null, startWeight: null, avgWeight: null, minWeight: null, maxWeight: null, totalChange: null, trendKgPerWeek: null, plateauDetected: false, plateauDays: 0 })).finally(() => setWaLoading(false));
    }
  }, [tab, wa, waLoading, weekOffset, selectedMemberId]);

  async function quickLog() {
    const val = parseFloat(quickKg.replace(",", "."));
    if (isNaN(val) || val < 20 || val > 400) { toast.error("Enter a valid weight (20–400 kg)"); return; }
    setLogging(true);
    try {
      await logWeight({ data: { weightKg: val, clientDate: localDate() } });
      toast.success("Weight logged ✓");
      setQuickKg("");
      // refresh: clear wa first, waLoading will be set true by the effect
      setWa(null);
    } catch { toast.error("Couldn't save. Please try again."); }
    finally { setLogging(false); }
  }

  // ── calorie chart data ──
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today]);
  const rows = useMemo(() => days.map((d) => {
    const mineMeals  = meals.filter((m) => m.meal_date === d && m.member_id === me.id);
    const theirMeals = partner ? meals.filter((m) => m.meal_date === d && m.member_id === partner.id) : [];
    return { d, mine: totals(mineMeals), theirs: totals(theirMeals), mineMeals, theirMeals };
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
  const targetPct        = me.daily_calorie_target && max > 0 ? Math.min(100, (me.daily_calorie_target / max) * 100) : null;
  const partnerTargetPct = partner?.daily_calorie_target && max > 0 ? Math.min(100, (partner.daily_calorie_target / max) * 100) : null;
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
      <div role="group" aria-label="Progress views" className="mb-6 grid grid-cols-4 gap-1 border-b border-border">
        {TABS.map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={tab===key} onClick={() => setTab(key)}
            className={cn("min-h-11 border-b-2 border-transparent px-1 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              tab === key ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: THIS WEEK ── */}
      {tab === "week" && (
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-[2rem] font-normal">Our week</h1>
            <p className="mt-1 text-muted-foreground">
              {both} of 7 days with meals logged by both of you.
            </p>
          </div>

          {/* ── Calorie chart: date numbers + partner target line ── */}
          <div>
            <div
              className="relative flex h-40 items-end gap-2 rounded-2xl border border-border bg-card p-4 overflow-visible"
              onClick={() => setTappedDay(null)}
            >
              {rows.map((r) => {
                const myPct    = max > 0 ? (r.mine.calories / max) * 100 : 0;
                const theirPct = max > 0 ? (r.theirs.calories / max) * 100 : 0;
                const dayNum   = parseLocalDate(r.d).getDate();
                const dayLabel = parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "short" });
                return (
                  <button
                    key={r.d}
                    className="relative flex h-full flex-1 flex-col items-center justify-end gap-0 focus:outline-none"
                    onClick={(e) => { e.stopPropagation(); setTappedDay(tappedDay === r.d ? null : r.d); }}
                    aria-label={`${dayLabel} ${dayNum}: You ${r.mine.calories} kcal`}
                  >
                    <div className="flex h-full w-full items-end justify-center gap-0.5">
                      <div
                        className={cn("w-1/2 max-w-3 rounded-t bg-primary transition-opacity duration-150",
                          tappedDay && tappedDay !== r.d ? "opacity-25" : "")}
                        style={{ height: `${myPct}%` }}
                      />
                      <div
                        className={cn("w-1/2 max-w-3 rounded-t bg-partner transition-opacity duration-150",
                          tappedDay && tappedDay !== r.d ? "opacity-25" : "")}
                        style={{ height: `${theirPct}%` }}
                      />
                    </div>
                    <div className={cn("text-[10px] uppercase leading-none mt-0.5 transition-colors",
                      tappedDay === r.d ? "font-bold text-foreground" : "text-muted-foreground")}>
                      {dayLabel}
                    </div>
                    <div className="text-[9px] text-muted-foreground/50 leading-none">{dayNum}</div>
                  </button>
                );
              })}
              {/* My target line */}
              {targetPct !== null && (
                <div className="pointer-events-none absolute inset-x-4 border-t border-dashed border-primary/50"
                  style={{ bottom: `calc(${targetPct}% + 1rem)` }}>
                  <span className="absolute -top-3.5 right-0 text-[9px] text-primary/70">Your target</span>
                </div>
              )}
              {/* Partner target line */}
              {partnerTargetPct !== null && (
                <div className="pointer-events-none absolute inset-x-4 border-t border-dashed border-partner/40"
                  style={{ bottom: `calc(${partnerTargetPct}% + 1rem)` }}>
                  <span className="absolute top-0.5 right-0 text-[9px] text-partner/70">
                    {(partner?.display_name ?? "Partner").split(" ")[0]}&apos;s target
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-4 mt-2 px-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-primary" /> You</span>
              {partner && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-partner" />
                  {partner.display_name?.split(" ")[0] ?? "Partner"}
                </span>
              )}
            </div>
          </div>

          {/* ── Day Focus Card — replaces clipped tooltip ── */}
          {tappedDay && (() => {
            const r = rows.find((row) => row.d === tappedDay);
            if (!r) return null;
            const myTarget    = me.daily_calorie_target ?? 0;
            const theirTarget = partner?.daily_calorie_target ?? 0;
            return (
              <div className="rounded-2xl border border-primary/20 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Eyebrow className="text-primary">
                    {parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                  </Eyebrow>
                  <button onClick={() => setTappedDay(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-primary">You</div>
                    {r.mine.count === 0 ? <p className="text-xs text-muted-foreground">Not logged</p> : (
                      <>
                        <div className="num text-lg font-bold leading-tight">{fmt(r.mine.calories)} kcal</div>
                        {myTarget > 0 && <div className="text-xs text-muted-foreground">{Math.round((r.mine.calories / myTarget) * 100)}% of {fmt(myTarget)} target</div>}
                        <div className="text-xs text-muted-foreground">P {fmt(r.mine.protein)}g · C {fmt(r.mine.carbs)}g · F {fmt(r.mine.fat)}g</div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {r.mineMeals.slice(0, 4).map((m) => (
                            <span key={m.id} className="rounded-lg bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                              {m.food_name.length > 15 ? m.food_name.slice(0, 14) + "…" : m.food_name} {fmt(m.calories)}
                            </span>
                          ))}
                          {r.mineMeals.length > 4 && <span className="rounded-lg bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">+{r.mineMeals.length - 4} more</span>}
                        </div>
                      </>
                    )}
                  </div>
                  {partner && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-partner">{partner.display_name}</div>
                      {r.theirs.count === 0 ? <p className="text-xs text-muted-foreground">Not logged</p> : (
                        <>
                          <div className="num text-lg font-bold leading-tight">{fmt(r.theirs.calories)} kcal</div>
                          {theirTarget > 0 && <div className="text-xs text-muted-foreground">{Math.round((r.theirs.calories / theirTarget) * 100)}% of {fmt(theirTarget)} target</div>}
                          <div className="text-xs text-muted-foreground">P {fmt(r.theirs.protein)}g · C {fmt(r.theirs.carbs)}g · F {fmt(r.theirs.fat)}g</div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {r.theirMeals.slice(0, 4).map((m) => (
                              <span key={m.id} className="rounded-lg bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                                {m.food_name.length > 15 ? m.food_name.slice(0, 14) + "…" : m.food_name} {fmt(m.calories)}
                              </span>
                            ))}
                            {r.theirMeals.length > 4 && <span className="rounded-lg bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">+{r.theirMeals.length - 4} more</span>}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Weekly Synergy Card ── */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h2 className="font-display text-xl">A little more context</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Days logged together</span>
                <span className="num font-semibold">{both} / 7{both >= 5 ? "" : ""}</span>
              </div>
              {partner && a1.kcal > 0 && a2.kcal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Calorie gap (daily avg)</span>
                  <span className="num font-semibold">
                    {fmt(Math.abs(Math.round(a1.kcal - a2.kcal)))} kcal
                    {" "}<span className="text-muted-foreground text-xs">{a1.kcal > a2.kcal ? `(you eat more)` : `(${partner.display_name?.split(" ")[0]} eats more)`}</span>
                  </span>
                </div>
              )}
              {me.daily_calorie_target && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Your on-target days</span>
                  <span className="num font-semibold">
                    {rows.filter((r) => {
                      const t = me.daily_calorie_target!;
                      return r.mine.count > 0 && Math.abs(r.mine.calories - t) <= Math.max(t * 0.1, 150);
                    }).length} / 7
                  </span>
                </div>
              )}
              {partner?.daily_calorie_target && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{partner.display_name?.split(" ")[0]}&apos;s on-target days</span>
                  <span className="num font-semibold">
                    {rows.filter((r) => {
                      const t = partner!.daily_calorie_target!;
                      return r.theirs.count > 0 && Math.abs(r.theirs.calories - t) <= Math.max(t * 0.1, 150);
                    }).length} / 7
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Macro Meters — You ── */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <Eyebrow className="text-primary">You — Avg Macros</Eyebrow>
            <div className="space-y-3">
              {(() => {
                const loggedRows = rows.filter((r) => r.mine.count > 0);
                const n = Math.max(loggedRows.length, 1);
                return [
                  { label: "Protein", val: a1.p, target: myProteinTarget },
                  { label: "Carbs",   val: Math.round(loggedRows.reduce((a, r) => a + r.mine.carbs, 0) / n), target: Number(me.daily_carbs_target ?? 0) },
                  { label: "Fat",     val: Math.round(loggedRows.reduce((a, r) => a + r.mine.fat,   0) / n), target: Number(me.daily_fat_target   ?? 0) },
                ].map(({ label, val, target }) => {
                  const pct = target > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0;
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="num font-medium">
                          {fmt(val)}g{target > 0 ? ` / ${fmt(target)}g (${pct}%)` : ""}
                        </span>
                      </div>
                      {target > 0 && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* ── Macro Meters — Partner ── */}
          {partner && a2.kcal > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <Eyebrow className="text-partner">{partner.display_name} — Avg Macros</Eyebrow>
              <div className="space-y-3">
                {(() => {
                  const loggedRows = rows.filter((r) => r.theirs.count > 0);
                  const n = Math.max(loggedRows.length, 1);
                  return [
                    { label: "Protein", val: a2.p, target: theirProteinTarget },
                    { label: "Carbs",   val: Math.round(loggedRows.reduce((a, r) => a + r.theirs.carbs, 0) / n), target: Number(partner.daily_carbs_target ?? 0) },
                    { label: "Fat",     val: Math.round(loggedRows.reduce((a, r) => a + r.theirs.fat,   0) / n), target: Number(partner.daily_fat_target   ?? 0) },
                  ].map(({ label, val, target }) => {
                    const pct = target > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0;
                    return (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="num font-medium">
                            {fmt(val)}g{target > 0 ? ` / ${fmt(target)}g (${pct}%)` : ""}
                          </span>
                        </div>
                        {target > 0 && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-partner transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: 30-DAY HISTORY ── */}
      {tab === "history" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-[1.375rem] font-normal">Days we both logged</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tap any day to revisit what you shared.</p>
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
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-partner" />One of you</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-border" />Rest day 🌙</span>
          </div>
          {selectedDay && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <Eyebrow>{parseLocalDate(selectedDay.d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Eyebrow>
              {selectedDay.mine.length === 0 && selectedDay.theirs.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">A quiet day together 🌙</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {selectedDay.mine.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium text-primary">You · {fmt(selectedDay.myT.calories)} kcal · {fmt(selectedDay.myT.protein)}g protein</div>
                      <div className="space-y-1.5">{selectedDay.mine.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 text-sm">
                          {m.photo_url && (
                            <button
                              className="shrink-0"
                              onClick={() => void signedMealPhotoUrl(m.photo_url!, room.id).then(url => {
                                 if (url) setLightbox({ src: url, caption: `${m.food_name} · ${fmt(m.calories)} kcal` });
                                 else toast.error("This photo is not available.");
                               })}
                            >
                              <PrivateMealPhoto stored={m.photo_url} roomId={room.id} className="size-9 rounded-lg object-cover border border-border" />
                            </button>
                          )}
                          <span className="flex-1 truncate">{m.food_name}</span>
                          <span className="shrink-0 num text-xs text-muted-foreground">{fmt(m.calories)} kcal</span>
                        </div>
                      ))}</div>
                    </div>
                  )}
                  {partner && selectedDay.theirs.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium text-partner">{partner.display_name} · {fmt(selectedDay.theirT.calories)} kcal</div>
                      <div className="space-y-1.5">{selectedDay.theirs.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 text-sm">
                          {m.photo_url && (
                            <button
                              className="shrink-0"
                              onClick={() => void signedMealPhotoUrl(m.photo_url!, room.id).then(url => {
                                 if (url) setLightbox({ src: url, caption: `${m.food_name} · ${fmt(m.calories)} kcal` });
                                 else toast.error("This photo is not available.");
                               })}
                            >
                              <PrivateMealPhoto stored={m.photo_url} roomId={room.id} className="size-9 rounded-lg object-cover border border-border" />
                            </button>
                          )}
                          <span className="flex-1 truncate">{m.food_name}</span>
                          <span className="shrink-0 num text-xs text-muted-foreground">{fmt(m.calories)} kcal</span>
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

          {/* Partner toggle */}
          {partner && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1 mb-2">
              <button type="button" onClick={() => setSelectedMemberId(me.id)}
                className={cn("rounded-lg py-1.5 text-xs font-medium transition-colors",
                  selectedMemberId === me.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                You
              </button>
              <button type="button" onClick={() => setSelectedMemberId(partner.id)}
                className={cn("rounded-lg py-1.5 text-xs font-medium transition-colors",
                  selectedMemberId === partner.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {partner.display_name}
              </button>
            </div>
          )}

          {/* Week carousel */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="rounded-xl border border-border p-2 hover:bg-secondary transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="flex-1 text-center">
              <div className="text-sm font-semibold">
                {statsLoading ? "Loading…" : (stats?.weekLabel ?? "—")}
              </div>
              <div className="text-xs text-muted-foreground">
                {weekOffset === 0 ? "This week" : weekOffset === -1 ? "Last week" : `${Math.abs(weekOffset)} weeks ago`}
              </div>
            </div>
            <button
              onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
              disabled={weekOffset >= 0}
              className="rounded-xl border border-border p-2 hover:bg-secondary transition-colors disabled:opacity-30"
              aria-label="Next week"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {statsLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
          {!statsLoading && statsError && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Couldn't load stats — tap a week to retry.
            </p>
          )}

          {!statsLoading && stats && (
            <>
              {stats.daysLogged === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No meals logged this week yet.
                </div>
              ) : (
                <>
                  {/* Card 1: 7-day totals */}
                  <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Eyebrow>7-Day Totals</Eyebrow>
                      <span className="text-xs text-muted-foreground">{stats.daysLogged}/7 days logged</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        ["kcal",    stats.weeklyTotal.calories],
                        ["protein", `${stats.weeklyTotal.protein}g`],
                        ["carbs",   `${stats.weeklyTotal.carbs}g`],
                        ["fat",     `${stats.weeklyTotal.fat}g`],
                      ].map(([label, val]) => (
                        <div key={label as string}>
                          <div className="num text-xl font-bold">{val}</div>
                          <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                        </div>
                      ))}
                    </div>
                    {stats.previousWeekDelta && (
                      <p className={cn(
                        "text-xs text-center",
                        stats.previousWeekDelta.calories > 0 ? "text-amber-600" : "text-green-600",
                      )}>
                        {stats.previousWeekDelta.calories > 0 ? "↑" : "↓"}{" "}
                        {Math.abs(stats.previousWeekDelta.calories)} kcal/day vs previous week
                      </p>
                    )}
                  </div>

                  {/* Card 2: daily averages */}
                  <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Eyebrow>Daily Averages</Eyebrow>
                      <details className="group relative ml-auto">
                        <summary className="list-none cursor-pointer text-muted-foreground hover:text-foreground">
                          <Info className="size-3.5" />
                        </summary>
                        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground shadow-lg">
                          <p><strong className="text-foreground">On logged days</strong> divides the weekly total by {stats.daysLogged} (days you actually logged).</p>
                          <p className="mt-1"><strong className="text-foreground">Full-week average</strong> divides by 7, treating unlogged days as 0 — a stricter measure of consistency.</p>
                        </div>
                      </details>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">On logged days ({stats.daysLogged})</span>
                        <span className="num font-semibold">{stats.dailyAverageLogged.calories} kcal</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Full-week average (7 days)</span>
                        <span className="num font-semibold">{stats.dailyAverageFullWeek.calories} kcal</span>
                      </div>
                      {stats.calorieTarget > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Daily target</span>
                          <span className="num font-semibold text-primary">{stats.calorieTarget} kcal</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                      {[
                        ["Protein", `${stats.dailyAverageLogged.protein}g`],
                        ["Carbs",   `${stats.dailyAverageLogged.carbs}g`],
                        ["Fat",     `${stats.dailyAverageLogged.fat}g`],
                      ].map(([l, v]) => (
                        <div key={l as string} className="text-center">
                          <div className="num text-sm font-semibold">{v}</div>
                          <div className="text-[10px] text-muted-foreground">{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card 3: adherence */}
                  {stats.calorieTarget > 0 && (
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Eyebrow>Consistency</Eyebrow>
                        <span className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          stats.adherenceLabel === "Consistent"    ? "bg-green-500/10 text-green-600"  :
                          stats.adherenceLabel === "Under target"  ? "bg-blue-500/10  text-blue-600"   :
                          stats.adherenceLabel === "Over target"   ? "bg-amber-500/10 text-amber-600"  :
                          "bg-secondary text-muted-foreground",
                        )}>
                          {stats.adherenceLabel}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Days on target (±10%)</span>
                          <span className="num font-bold">{stats.targetAdherence}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500",
                              stats.targetAdherence >= 70 ? "bg-green-500" :
                              stats.targetAdherence >= 40 ? "bg-amber-500" : "bg-red-500",
                            )}
                            style={{ width: `${stats.targetAdherence}%` }}
                          />
                        </div>
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">How this is calculated</summary>
                          <p className="mt-1">
                            Counts completed logged days where your calorie total was within ±10% (minimum ±150 kcal) of your {stats.calorieTarget} kcal target.
                            Today is excluded if still in progress.
                            Overeating does not count as on-target.
                          </p>
                        </details>
                      </div>
                    </div>
                  )}

                  {/* Card 4: day-by-day sparkline */}
                  <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <Eyebrow>Day by Day</Eyebrow>
                    {(() => {
                      const maxCal = Math.max(
                        ...stats.dailyBreakdown.map((d) => d.calories),
                        stats.calorieTarget,
                        1,
                      );
                      const targetPct = stats.calorieTarget > 0
                        ? Math.min(100, (stats.calorieTarget / maxCal) * 100)
                        : null;
                      return (
                        <div className="relative flex h-24 items-end gap-1.5 overflow-visible">
                          {targetPct !== null && (
                            <div
                              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-primary/40"
                              style={{ bottom: `${targetPct}%` }}
                            />
                          )}
                          {stats.dailyBreakdown.map((day) => {
                            const pct     = Math.min(100, maxCal > 0 ? (day.calories / maxCal) * 100 : 0);
                            const isToday = day.date === localDate();
                            return (
                              <div key={day.date} className="relative flex flex-1 flex-col items-center justify-end gap-1">
                                <div
                                  title={`${day.shortDay}: ${day.calories} kcal`}
                                  className={cn(
                                    "w-full rounded-t transition-all",
                                    !day.logged   ? "bg-border/40" :
                                    isToday       ? "bg-primary" : "bg-primary/70",
                                  )}
                                  style={{ height: `${pct}%`, minHeight: day.logged ? "3px" : "0" }}
                                />
                                <div className={cn(
                                  "text-[9px] uppercase",
                                  isToday ? "font-bold text-foreground" : "text-muted-foreground",
                                )}>
                                  {day.shortDay}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {stats.calorieTarget > 0 && (
                      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="inline-block h-px w-4 border-t border-dashed border-primary/50" />
                        Target: {stats.calorieTarget} kcal/day
                      </p>
                    )}
                  </div>

                  {/* Observation */}
                  {stats.observation && (
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">💡</span>
                        <span className="text-sm font-semibold">{stats.observation.headline}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{stats.observation.detail}</p>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">How this was calculated</summary>
                        <p className="mt-1">{stats.observation.calculation}</p>
                      </details>
                    </div>
                  )}
                </>
              )}

              {/* Meal Ideas */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm text-muted-foreground">Need inspiration?</span>
                <Btn size="md" onClick={() => setSuggestOpen(true)}>
                  <Sparkles className="size-3.5 mr-1" /> Meal Ideas
                </Btn>
              </div>
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
            <Btn size="md" onClick={quickLog} disabled={logging || !quickKg}>
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

      {lightbox && <Lightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />}
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
