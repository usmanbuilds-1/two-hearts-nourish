import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSpace } from "@/lib/space";
import { addDays, fmt, parseLocalDate, totals } from "@/lib/nutrition";
import { Eyebrow, Screen } from "@/components/us/primitives";

export const Route = createFileRoute("/_space/week")({
  head: () => ({ meta: [{ title: "Our Week — Us" }, { name: "description", content: "The last seven days, together." }, { property: "og:title", content: "Our Week — Us" }, { property: "og:description", content: "The last seven days, together." }] }),
  component: Week,
});

function Week() {
  const { me, partner, meals, today } = useSpace();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today]);
  const rows = days.map((d) => {
    const mine = meals.filter((m) => m.meal_date === d && m.member_id === me.id);
    const theirs = partner ? meals.filter((m) => m.meal_date === d && m.member_id === partner.id) : [];
    return { d, mine: totals(mine), theirs: totals(theirs) };
  });
  const avg = (sel: (r: (typeof rows)[number]) => { calories: number; protein: number; count: number }) => {
    const logged = rows.map(sel).filter((t) => t.count > 0);
    return logged.length ? { kcal: logged.reduce((a, t) => a + t.calories, 0) / logged.length, p: logged.reduce((a, t) => a + t.protein, 0) / logged.length, n: logged.reduce((a, t) => a + t.count, 0) } : { kcal: 0, p: 0, n: 0 };
  };
  const a1 = avg((r) => r.mine), a2 = avg((r) => r.theirs);
  const both = rows.filter((r) => r.mine.count && r.theirs.count).length;
  const max = Math.max(1, ...rows.flatMap((r) => [r.mine.calories, r.theirs.calories]));

  const targetPct = me.daily_calorie_target && max > 0
    ? Math.min(100, Math.max(0, (me.daily_calorie_target / max) * 100))
    : null;

  const myProteinTarget = Number(me.daily_protein_target ?? 0);
  const theirProteinTarget = Number(partner?.daily_protein_target ?? 0);

  return (
    <Screen>
      <h1 className="text-3xl">Our Week ❤️</h1>
      <p className="mt-1 text-muted-foreground">{both} of 7 days you both logged meals.</p>

      {/* Calorie chart with target line */}
      <div className="relative mt-6 flex h-40 items-end gap-2 rounded-2xl border border-border bg-card p-4">
        {rows.map((r) => (
          <div key={r.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <div className="w-1/2 max-w-3 rounded-t bg-primary" style={{ height: `${(r.mine.calories / max) * 100}%` }} />
              <div className="w-1/2 max-w-3 rounded-t bg-partner" style={{ height: `${(r.theirs.calories / max) * 100}%` }} />
            </div>
            <div className="text-[10px] uppercase text-muted-foreground">{parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "short" })}</div>
          </div>
        ))}
        {targetPct !== null && (
          <div
            className="pointer-events-none absolute inset-x-4 border-t border-dashed border-primary/50"
            style={{ bottom: `calc(${targetPct}% + 1rem)` }}
          >
            <span className="absolute -top-4 right-0 text-[10px] text-primary/60">target</span>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {([["You", a1, "text-primary"], [partner?.display_name ?? "Partner", a2, "text-partner"]] as const).map(([l, a, c]) => {
          const v = a as typeof a1;
          return (
            <div key={l as string} className="rounded-2xl border border-border bg-card p-4">
              <Eyebrow className={c as string}>{l as string}</Eyebrow>
              <div className="num mt-2 text-xl font-semibold">{fmt(v.kcal)} <span className="text-sm font-normal text-muted-foreground">avg kcal</span></div>
              <div className="num text-sm">{fmt(v.p)}g avg protein</div>
              <div className="num text-xs text-muted-foreground">{v.n} meals logged</div>
            </div>
          );
        })}
      </div>

      {/* Protein progress strip */}
      <Eyebrow className="mt-6">Protein this week</Eyebrow>
      <div className="mt-2 space-y-2">
        {rows.map((r) => {
          const myPct = myProteinTarget > 0 ? Math.min(100, (r.mine.protein / myProteinTarget) * 100) : 0;
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
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-primary" />
          You: {fmt(a1.p)}g avg{myProteinTarget > 0 ? ` · target ${fmt(myProteinTarget)}g` : ""}
        </span>
        {partner && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-partner" />
            {partner.display_name}: {fmt(a2.p)}g avg{theirProteinTarget > 0 ? ` · target ${fmt(theirProteinTarget)}g` : ""}
          </span>
        )}
      </div>

      <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.slice().reverse().map((r) => (
          <div key={r.d} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="w-12 font-semibold uppercase text-muted-foreground">{parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "short" })}</span>
            <span className="flex-1">You {r.mine.count ? "✓" : "—"}</span>
            <span className="flex-1">{partner?.display_name ?? "Partner"} {r.theirs.count ? "✓" : "—"}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}
