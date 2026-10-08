import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSpace } from "@/lib/space";
import { clearSession, inviteUrl, readSession } from "@/lib/session";
import { leaveRoom } from "@/lib/room.functions";
import { Btn, Eyebrow, Field, Screen, TextInput } from "@/components/us/primitives";
import { ACTIVITY, bmi, bmiCategory, bmr, suggest, validate, type Activity, type BodyGoal, type HealthInput, type Sex } from "@/lib/health";
import type { Member, Room } from "@/lib/nutrition";

export const Route = createFileRoute("/_space/settings")({
  head: () => ({ meta: [{ title: "Settings — Us" }, { name: "description", content: "Names, targets and your shared message." }, { property: "og:title", content: "Settings — Us" }, { property: "og:description", content: "Names, targets and your shared message." }] }),
  component: SettingsPage,
});

const n = (s: string) => (s.trim() === "" ? null : Math.max(0, Number(s)) || null);

function SettingsPage() {
  const { me, partner, room, setMember, setRoom } = useSpace();
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: me.display_name, kcal: String(me.daily_calorie_target ?? ""), p: String(me.daily_protein_target ?? ""), c: String(me.daily_carbs_target ?? ""), fat: String(me.daily_fat_target ?? ""),
    goal: room.shared_goal ?? "", msg: room.couple_message ?? "", since: room.together_since ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [h, setH] = useState({
    heightCm: "", weightKg: "", age: "", sex: "" as Sex | "", activity: "" as Activity | "", goal: "" as BodyGoal | "",
  });
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  // Local, evidence-based target calculator (src/lib/health.ts) — no server calls, no AI.
  const num = (s: string) => {
    const v = Number(s);
    return s.trim() === "" || !Number.isFinite(v) ? null : v;
  };
  const heightCm = num(h.heightCm);
  const weightKg = num(h.weightKg);
  const age = num(h.age);
  const sex = h.sex;
  const activity = h.activity;
  const goal = h.goal;
  const partial: Partial<HealthInput> = {
    heightCm: heightCm ?? undefined,
    weightKg: weightKg ?? undefined,
    age: age ?? undefined,
    sex: sex || undefined,
    activity: activity || undefined,
    goal: goal || undefined,
  };
  const calcError = validate(partial);
  const anyFilled = h.heightCm + h.weightKg + h.age + h.sex + h.activity + h.goal !== "";
  const shownError = anyFilled && calcError ? calcError : null;
  const bmiVal =
    heightCm !== null && weightKg !== null && heightCm >= 100 && heightCm <= 250 && weightKg >= 20 && weightKg <= 400
      ? bmi(heightCm, weightKg)
      : null;
  const bmrVal =
    bmiVal !== null && heightCm !== null && weightKg !== null && age !== null && age >= 10 && age <= 110 && sex !== ""
      ? Math.round(bmr({ heightCm, weightKg, age, sex }))
      : null;

  function applyTargets() {
    if (validate(partial)) return;
    const s = suggest(partial as HealthInput);
    setF((p) => ({ ...p, kcal: String(s.calories), p: String(s.protein), c: String(s.carbs), fat: String(s.fat) }));
  }

  async function save() {
    if (!f.name.trim()) return void toast.error("Your name can't be empty.");
    setBusy(true);
    const [a, b] = await Promise.all([
      supabase.from("members").update({ display_name: f.name.trim().slice(0, 40), daily_calorie_target: n(f.kcal), daily_protein_target: n(f.p), daily_carbs_target: n(f.c), daily_fat_target: n(f.fat) }).eq("id", me.id).select("id, room_id, auth_user_id, seat, display_name, daily_calorie_target, daily_protein_target, daily_carbs_target, daily_fat_target, created_at").single(),
      supabase.from("rooms").update({ shared_goal: f.goal.trim().slice(0, 120) || null, couple_message: f.msg.trim().slice(0, 160) || null, together_since: f.since || null }).eq("id", room.id).select().single(),
    ]);
    setBusy(false);
    if (a.error || b.error) return void toast.error("Couldn't save your settings. Please try again.");
    setMember(a.data as Member);
    setRoom(b.data as Room);
    toast.success("Saved ❤️");
  }

  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("us.theme", next ? "dark" : "light");
    setDark(next);
  }

  async function leave() {
    if (!confirm("Leave this space? Your meals will be deleted and this can't be undone.")) return;
    try { await leaveRoom(); await clearSession(); navigate({ to: "/" }); } catch { toast.error("Couldn't leave right now. Please try again."); }
  }
  async function reset() {
    if (!confirm("Forget this phone? You can rejoin with your invite link and personal key.")) return;
    await clearSession(); navigate({ to: "/" });
  }

  const key = readSession()?.key ?? "";
  return (
    <Screen>
      <h1 className="text-3xl">Settings</h1>
      <div className="mt-6 space-y-4">
        <Field label="My name"><TextInput value={f.name} onChange={set("name")} maxLength={40} /></Field>
        <Field label="Partner name" hint="Your partner sets their own name."><TextInput value={partner?.display_name ?? "Not joined yet"} disabled /></Field>
        <Eyebrow className="pt-2">My daily targets</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories"><TextInput inputMode="numeric" value={f.kcal} onChange={set("kcal")} placeholder="—" /></Field>
          <Field label="Protein (g)"><TextInput inputMode="decimal" value={f.p} onChange={set("p")} placeholder="—" /></Field>
          <Field label="Carbs (g)"><TextInput inputMode="decimal" value={f.c} onChange={set("c")} placeholder="—" /></Field>
          <Field label="Fat (g)"><TextInput inputMode="decimal" value={f.fat} onChange={set("fat")} placeholder="—" /></Field>
        </div>
        <Btn variant="outline" className="w-full" aria-expanded={showCalc} onClick={() => setShowCalc((v) => !v)}>
          Calculate my targets 🧮
        </Btn>
        {showCalc && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <Eyebrow>Your details</Eyebrow>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Height (cm)">
                <TextInput inputMode="numeric" value={h.heightCm} onChange={(e) => setH((p) => ({ ...p, heightCm: e.target.value }))} placeholder="170" />
              </Field>
              <Field label="Weight (kg)">
                <TextInput inputMode="decimal" value={h.weightKg} onChange={(e) => setH((p) => ({ ...p, weightKg: e.target.value }))} placeholder="70" />
              </Field>
              <Field label="Age">
                <TextInput inputMode="numeric" value={h.age} onChange={(e) => setH((p) => ({ ...p, age: e.target.value }))} placeholder="28" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <fieldset>
                <legend className="mb-1.5 block text-sm text-muted-foreground">Sex</legend>
                <div className="flex gap-2">
                  {(["male", "female"] as Sex[]).map((s) => (
                    <label key={s} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-input text-sm capitalize has-[:checked]:border-primary">
                      <input type="radio" name="calc-sex" value={s} checked={h.sex === s} onChange={() => setH((p) => ({ ...p, sex: s }))} className="accent-primary" />
                      {s}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 block text-sm text-muted-foreground">Goal</legend>
                <div className="flex gap-2">
                  {(["lose", "maintain", "gain"] as BodyGoal[]).map((g) => (
                    <label key={g} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-input text-xs capitalize has-[:checked]:border-primary">
                      <input type="radio" name="calc-goal" value={g} checked={h.goal === g} onChange={() => setH((p) => ({ ...p, goal: g }))} className="accent-primary" />
                      {g}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <Field label="Activity level">
              <select
                value={h.activity}
                onChange={(e) => setH((p) => ({ ...p, activity: e.target.value as Activity }))}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Choose…</option>
                {Object.entries(ACTIVITY).map(([key, v]) => (
                  <option key={key} value={key}>{v.label}</option>
                ))}
              </select>
            </Field>
            {bmiVal !== null && (
              <p className="num text-sm text-muted-foreground">
                BMI: {bmiVal} ({bmiCategory(bmiVal)})
                {bmrVal !== null ? ` · BMR: ${bmrVal} kcal` : ""}
              </p>
            )}
            {shownError && <p className="text-sm text-destructive">{shownError}</p>}
            <Btn className="w-full" onClick={applyTargets} disabled={calcError !== null}>Apply to daily targets</Btn>
          </div>
        )}
        <Eyebrow className="pt-2">Us</Eyebrow>
        <Field label="Shared goal"><TextInput value={f.goal} onChange={set("goal")} placeholder="Eat better together" maxLength={120} /></Field>
        <Field label="Custom couple message"><TextInput value={f.msg} onChange={set("msg")} placeholder="Getting healthier together, one meal at a time ❤️" maxLength={160} /></Field>
        <Field label="Together since (optional)"><TextInput type="date" value={f.since} onChange={set("since")} /></Field>
        <Btn size="lg" className="w-full" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
      </div>

      <div className="mt-10 space-y-3">
        <Eyebrow>Space</Eyebrow>
        <Btn variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText(inviteUrl(room.room_code)).then(() => toast.success("Invite link copied"), () => toast.error("Couldn't copy"))}>Copy invite link · {room.room_code}</Btn>
        <Btn variant="outline" className="w-full" onClick={toggleTheme}>Theme: {dark ? "Dark" : "Light"}</Btn>
        <div className="rounded-xl border border-border p-4 text-sm">
          <div className="text-muted-foreground">Your personal key lets you rejoin from a new phone. Keep it private.</div>
          {showKey ? <div className="mt-2 break-all font-mono text-xs">{key}</div> : <button className="mt-2 text-primary" onClick={() => setShowKey(true)}>Show my key</button>}
        </div>
        <Btn variant="outline" className="w-full" onClick={reset}>Reset this phone</Btn>
        <Btn variant="danger" className="w-full" onClick={leave}>Leave space</Btn>
      </div>
    </Screen>
  );
}
