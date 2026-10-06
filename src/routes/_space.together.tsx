import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSpace } from "@/lib/space";
import { addDays, coupleStats, daysBetween, milestones } from "@/lib/nutrition";
import { Eyebrow, Screen } from "@/components/us/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space/together")({
  head: () => ({ meta: [{ title: "Together — Us" }, { name: "description", content: "Your shared milestones." }, { property: "og:title", content: "Together — Us" }, { property: "og:description", content: "Your shared milestones." }] }),
  component: Together,
});

function Together() {
  const { me, partner, meals, today, room } = useSpace();
  const s = useMemo(() => coupleStats(meals, me, partner, today), [meals, me, partner, today]);
  const since = room.together_since ? daysBetween(room.together_since, today) : daysBetween(room.created_at.slice(0, 10), today) + 1;
  const timeline = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).flatMap((d, i) => {
    const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : `${i} days ago`;
    if (s.bothProteinDays.has(d)) return [{ label, text: "Both hit protein goals 💪" }];
    if (s.bothDays.has(d)) return [{ label, text: "You both logged meals ❤️" }];
    return [];
  });

  return (
    <Screen>
      <h1 className="text-3xl">Together ❤️</h1>
      <div className="mt-1 text-muted-foreground">{me.display_name} + {partner?.display_name ?? "…"}</div>
      {room.shared_goal && <p className="mt-3 font-display italic">{room.shared_goal}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          [`${since}`, room.together_since ? "days together" : "days in this space"],
          [`${s.totalMeals}`, "meals logged"],
          [`${s.daysBoth}`, "days both logged"],
          [`${s.daysBothProtein}`, "days hitting our protein goals"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-2xl border border-border bg-card p-4">
            <div className="num font-display text-3xl">{n}</div>
            <div className="text-sm text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <Eyebrow>Milestones</Eyebrow>
        <div className="mt-3 space-y-2">
          {milestones(s).map((m) => (
            <div key={m.title} className={cn("flex items-center gap-3 rounded-xl border border-border p-3", m.achieved ? "bg-card" : "opacity-45")}>
              <span className={cn("text-xl", m.achieved && "animate-pop")}>{m.icon}</span>
              <span className="text-sm">{m.title}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <Eyebrow>Lately</Eyebrow>
        {timeline.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Your shared moments will show up here.</p> : (
          <ol className="mt-3 space-y-3 border-l border-border pl-4">
            {timeline.map((t) => (
              <li key={t.label}><div className="text-xs text-muted-foreground">{t.label}</div><div className="text-sm">{t.text}</div></li>
            ))}
          </ol>
        )}
      </section>
    </Screen>
  );
}
