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

  return (
    <Screen>
      <h1 className="text-3xl">Our Week ❤️</h1>
      <p className="mt-1 text-muted-foreground">{both} of 7 days you both logged meals.</p>

      <div className="mt-6 flex h-40 items-end gap-2 rounded-2xl border border-border bg-card p-4">
        {rows.map((r) => (
          <div key={r.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <div className="w-1/2 max-w-3 rounded-t bg-primary" style={{ height: `${(r.mine.calories / max) * 100}%` }} />
              <div className="w-1/2 max-w-3 rounded-t bg-partner" style={{ height: `${(r.theirs.calories / max) * 100}%` }} />
            </div>
            <div className="text-[10px] uppercase text-muted-foreground">{parseLocalDate(r.d).toLocaleDateString(undefined, { weekday: "short" })}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[["You", a1, "text-primary"], [partner?.display_name ?? "Partner", a2, "text-partner"]].map(([l, a, c]) => {
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
