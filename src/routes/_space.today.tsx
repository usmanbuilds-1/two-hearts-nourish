import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Camera, Plus } from "lucide-react";
import { useSpace } from "@/lib/space";
import { MEAL_TYPES, addDays, coupleStats, fmt, greeting, totals, usMessages, type Meal, type Member } from "@/lib/nutrition";
import { Btn, Eyebrow, Screen } from "@/components/us/primitives";
import { MealSheet } from "@/components/us/MealSheet";
import { ScanSheet } from "@/components/us/ScanSheet";
import { BudgetPlanSheet } from "@/components/us/BudgetPlanSheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PiggyBank } from "lucide-react";

export const Route = createFileRoute("/_space/today")({
  head: () => ({ meta: [{ title: "Today — Us" }, { name: "description", content: "Your shared day of meals." }, { property: "og:title", content: "Today — Us" }, { property: "og:description", content: "Your shared day of meals." }] }),
  component: Today,
});

function PersonCard({ label, member, meals, partner }: { label: string; member: Member | null; meals: Meal[]; partner?: boolean }) {
  const t = totals(meals);
  const kT = member?.daily_calorie_target ?? 0;
  const pT = Number(member?.daily_protein_target ?? 0);
  const bar = (v: number, max: number) => (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
      <div className={cn("h-full rounded-full transition-all", partner ? "bg-partner" : "bg-primary")} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Eyebrow className={partner ? "text-partner" : "text-primary"}>{label}</Eyebrow>
      <div className="num mt-2 text-2xl font-semibold">{fmt(t.calories)}{kT > 0 && <span className="text-sm font-normal text-muted-foreground"> / {fmt(kT)}</span>}<span className="text-sm font-normal text-muted-foreground"> kcal</span></div>
      {kT > 0 && bar(t.calories, kT)}
      <div className="num mt-3 text-sm">{fmt(t.protein)}{pT > 0 && <span className="text-muted-foreground"> / {fmt(pT)}</span>}g protein</div>
      {pT > 0 && bar(t.protein, pT)}
      <div className="num mt-2 text-xs text-muted-foreground">{fmt(t.carbs)}g carbs · {fmt(t.fat)}g fat</div>
    </div>
  );
}

function Today() {
  const { me, partner, meals, today, room, fresh } = useSpace();
  const [scan, setScan] = useState(false);
  const [plan, setPlan] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; meal: Meal | null }>({ open: false, meal: null });
  const todays = useMemo(() => meals.filter((m) => m.meal_date === today), [meals, today]);
  const mine = todays.filter((m) => m.member_id === me.id);
  const theirs = partner ? todays.filter((m) => m.member_id === partner.id) : [];
  const stats = useMemo(() => coupleStats(meals, me, partner, today), [meals, me, partner, today]);
  const y = addDays(today, -1);
  const msgs = usMessages({ me, partner, todayMine: mine, todayTheirs: theirs, yesterdayBoth: stats.bothDays.has(y), yesterdayBothProtein: stats.bothProteinDays.has(y), streak: stats.streak });

  return (
    <Screen>
      <h1 className="text-3xl leading-tight">{greeting()}, {me.display_name} ❤️</h1>
      <div className="mt-1 text-muted-foreground">You & {partner?.display_name ?? "your partner (invite pending)"}</div>
      <p className="mt-3 text-sm text-foreground/80">{msgs[0]}</p>
      {room.couple_message && <p className="mt-2 font-display text-sm italic text-muted-foreground md:hidden">“{room.couple_message}”</p>}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <PersonCard label="You" member={me} meals={mine} />
        <PersonCard label={partner?.display_name ?? "Partner"} member={partner} meals={theirs} partner />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Btn size="lg" onClick={() => setScan(true)}><Camera className="size-5" /> Scan Food 📷</Btn>
        <Btn size="lg" variant="outline" onClick={() => setSheet({ open: true, meal: null })}><Plus className="size-4" /> Add Meal</Btn>
        <Btn size="lg" variant="outline" className="col-span-2" onClick={() => (me.daily_calorie_target == null ? toast("Set your calorie target in Settings first.") : setPlan(true))}>
          <PiggyBank className="size-4" /> Plan meals 💰
        </Btn>
      </div>

      <section className="mt-8">
        <Eyebrow>Us today ❤️</Eyebrow>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{msgs.slice(1).map((m) => <li key={m}>{m}</li>)}</ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl">Today's little food story</h2>
        {todays.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center">
            <div className="font-display text-lg">Your food story starts here ❤️</div>
            <div className="mt-1 text-sm text-muted-foreground">Take a photo of your first meal together.</div>
          </div>
        ) : (
          MEAL_TYPES.map((t) => {
            const list = todays.filter((m) => m.meal_type === t.key);
            return (
              <div key={t.key} className="mt-5">
                <Eyebrow>{t.label} {t.icon}</Eyebrow>
                {list.length === 0 ? <div className="mt-2 text-sm text-muted-foreground/70">Not logged yet</div> : (
                  <div className="mt-2 space-y-2">
                    {list.map((m) => {
                      const isMe = m.member_id === me.id;
                      return (
                        <button key={m.id} onClick={() => setSheet({ open: true, meal: m })} className={cn("flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left", fresh.has(m.id) && "animate-arrive")}>
                          <span className={cn("size-2 shrink-0 rounded-full", isMe ? "bg-primary" : "bg-partner")} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{m.food_name}</div>
                            <div className="text-xs text-muted-foreground">{isMe ? "You" : partner?.display_name}</div>
                          </div>
                          <div className="num text-right text-sm"><div>{fmt(m.calories)} kcal</div><div className="text-xs text-muted-foreground">{fmt(Number(m.protein))}g protein</div></div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <ScanSheet open={scan} onOpenChange={setScan} onManual={() => setSheet({ open: true, meal: null })} />
      <BudgetPlanSheet open={plan} onOpenChange={setPlan} me={me} />
      <MealSheet open={sheet.open} meal={sheet.meal} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} />
    </Screen>
  );
}
