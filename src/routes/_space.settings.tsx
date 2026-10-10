import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSpace } from "@/lib/space";
import { clearSession, inviteUrl, readSession } from "@/lib/session";
import { createLinkCode, leaveRoom } from "@/lib/room.functions";
import { Btn, Eyebrow, Field, Screen, TextInput } from "@/components/us/primitives";
import { ACTIVITY, type Activity, type BodyGoal, type HealthInput, type Sex, bmi, bmiCategory, bmr, suggest, validate } from "@/lib/health";
import { logWeight, getWeightLog, type WeightEntry } from "@/lib/weight.functions";
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
    name: me.display_name,
    kcal: String(me.daily_calorie_target ?? ""),
    p: String(me.daily_protein_target ?? ""),
    c: String(me.daily_carbs_target ?? ""),
    fat: String(me.daily_fat_target ?? ""),
    goal: room.shared_goal ?? "",
    msg: room.couple_message ?? "",
    since: room.together_since ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(true);
  const [showKey, setShowKey] = useState(false);

  // Health calculator
  const [showCalc, setShowCalc] = useState(false);
  const [calc, setCalc] = useState({
    heightCm: String(me.height_cm ?? ""),
    weightKg: String(me.weight_kg ?? ""),
    age: String(me.age ?? ""),
    sex: (me.sex ?? "") as Sex | "",
    activity: (me.activity_level ?? "") as Activity | "",
    goal: (me.body_goal ?? "") as BodyGoal | "",
  });

  const liveBmi = useMemo(() => {
    const h = parseFloat(calc.heightCm), w = parseFloat(calc.weightKg);
    return h > 0 && w > 0 ? bmi(h, w) : null;
  }, [calc.heightCm, calc.weightKg]);

  const liveBmr = useMemo(() => {
    const h = parseFloat(calc.heightCm), w = parseFloat(calc.weightKg), a = parseInt(calc.age);
    return h > 0 && w > 0 && a > 0 && calc.sex ? bmr({ heightCm: h, weightKg: w, age: a, sex: calc.sex as Sex }) : null;
  }, [calc]);

  const calcInput: Partial<HealthInput> = {};
  const hN = parseFloat(calc.heightCm); if (hN) calcInput.heightCm = hN;
  const wN = parseFloat(calc.weightKg); if (wN) calcInput.weightKg = wN;
  const aN = parseInt(calc.age); if (aN) calcInput.age = aN;
  if (calc.sex) calcInput.sex = calc.sex;
  if (calc.activity) calcInput.activity = calc.activity;
  if (calc.goal) calcInput.goal = calc.goal;
  const calcError = validate(calcInput);

  function applyTargets() {
    const input = {
      heightCm: parseFloat(calc.heightCm),
      weightKg: parseFloat(calc.weightKg),
      age: parseInt(calc.age),
      sex: calc.sex as Sex,
      activity: calc.activity as Activity,
      goal: calc.goal as BodyGoal,
    };
    const s = suggest(input);
    setF((prev) => ({ ...prev, kcal: String(s.calories), p: String(s.protein), c: String(s.carbs), fat: String(s.fat) }));
    toast.success("Targets updated ✓ — hit Save to keep them.");
  }

  // Device link card
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [countdown, setCountdown] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown(expiresAt: string) {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      if (diff === 0) { setLinkCode(null); if (timerRef.current) clearInterval(timerRef.current); return; }
      const m = Math.floor(diff / 60), s = diff % 60;
      setCountdown(`${m}:${s.toString().padStart(2, "0")}`);
    }, 1000);
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function genLinkCode() {
    setLinkBusy(true);
    try {
      const res = await createLinkCode();
      setLinkCode(res);
      startCountdown(res.expiresAt);
    } catch { toast.error("Couldn't generate a code. Please try again."); }
    finally { setLinkBusy(false); }
  }

  // Weight log
  const [weightInput, setWeightInput] = useState("");
  const [weightLog, setWeightLog] = useState<WeightEntry[]>([]);
  const [weightBusy, setWeightBusy] = useState(false);

  useEffect(() => {
    getWeightLog().then((r) => setWeightLog(r.entries)).catch(() => {});
  }, []);

  async function saveWeight() {
    const kg = parseFloat(weightInput);
    if (!isFinite(kg) || kg < 20 || kg > 400) return void toast.error("Enter a valid weight in kg (20–400).");
    setWeightBusy(true);
    try {
      await logWeight({ data: { weightKg: kg } });
      setWeightInput("");
      const r = await getWeightLog();
      setWeightLog(r.entries);
      toast.success("Weight logged ✓");
    } catch { toast.error("Couldn't save. Try again."); }
    finally { setWeightBusy(false); }
  }

  const weightMax = weightLog.length ? Math.max(...weightLog.map((e) => e.weight_kg)) : 1;
  const weightMin = weightLog.length ? Math.min(...weightLog.map((e) => e.weight_kg)) : 0;
  const weightRange = Math.max(weightMax - weightMin, 1);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim()) return void toast.error("Your name can't be empty.");
    setBusy(true);
    const healthFields = {
      height_cm: parseFloat(calc.heightCm) || null,
      weight_kg: parseFloat(calc.weightKg) || null,
      age: parseInt(calc.age) || null,
      sex: (calc.sex || null) as "male" | "female" | null,
      activity_level: calc.activity || null,
      body_goal: (calc.goal || null) as "lose" | "maintain" | "gain" | null,
    };
    const [a, b] = await Promise.all([
      supabase.from("members").update({
        display_name: f.name.trim().slice(0, 40),
        daily_calorie_target: n(f.kcal), daily_protein_target: n(f.p),
        daily_carbs_target: n(f.c), daily_fat_target: n(f.fat),
        ...healthFields,
      }).eq("id", me.id).select("id, room_id, auth_user_id, seat, display_name, daily_calorie_target, daily_protein_target, daily_carbs_target, daily_fat_target, height_cm, weight_kg, age, sex, activity_level, body_goal, created_at").single(),
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

        {/* Health calculator collapsible */}
        <Btn variant="outline" className="w-full" onClick={() => setShowCalc((v) => !v)}>
          {showCalc ? "Hide" : "Calculate my targets"} 🧮
        </Btn>
        {showCalc && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Height (cm)">
                <TextInput inputMode="decimal" value={calc.heightCm} onChange={(e) => setCalc({ ...calc, heightCm: e.target.value })} placeholder="170" />
              </Field>
              <Field label="Weight (kg)">
                <TextInput inputMode="decimal" value={calc.weightKg} onChange={(e) => setCalc({ ...calc, weightKg: e.target.value })} placeholder="70" />
              </Field>
              <Field label="Age">
                <TextInput inputMode="numeric" value={calc.age} onChange={(e) => setCalc({ ...calc, age: e.target.value })} placeholder="25" />
              </Field>
            </div>

            <Field label="Sex">
              <div className="grid grid-cols-2 gap-2">
                {(["male", "female"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setCalc({ ...calc, sex: s })}
                    className={`rounded-xl border px-3 py-2 text-sm capitalize transition-colors ${calc.sex === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Goal">
              <div className="grid grid-cols-3 gap-2">
                {(["lose", "maintain", "gain"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setCalc({ ...calc, goal: g })}
                    className={`rounded-xl border px-2 py-2 text-sm capitalize transition-colors ${calc.goal === g ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                    {g}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Activity level">
              <select
                value={calc.activity}
                onChange={(e) => setCalc({ ...calc, activity: e.target.value as Activity })}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select…</option>
                {(Object.entries(ACTIVITY) as [Activity, { label: string }][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>

            {liveBmi !== null && liveBmr !== null && (
              <p className="text-sm text-muted-foreground">
                BMI: <span className="font-medium text-foreground">{liveBmi} ({bmiCategory(liveBmi)})</span>
                {" · "}BMR: <span className="font-medium text-foreground">{Math.round(liveBmr)} kcal</span>
              </p>
            )}

            {calcError && <p className="text-sm text-destructive">{calcError}</p>}

            <Btn className="w-full" disabled={!!calcError} onClick={applyTargets}>
              Apply to daily targets ↑
            </Btn>
          </div>
        )}

        {/* Weight log */}
        <Eyebrow className="pt-2">Weight log</Eyebrow>
        <div className="flex gap-2">
          <TextInput
            inputMode="decimal"
            className="flex-1"
            placeholder={me.weight_kg ? String(me.weight_kg) : "kg"}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
          />
          <Btn variant="outline" disabled={weightBusy || !weightInput.trim()} onClick={saveWeight}>
            {weightBusy ? "…" : "Log"}
          </Btn>
        </div>
        {weightLog.length >= 2 && (
          <div className="flex h-12 items-end gap-0.5 px-1">
            {weightLog.slice().reverse().map((e) => {
              const pct = ((e.weight_kg - weightMin) / weightRange) * 70 + 30;
              return (
                <div key={e.logged_date} title={`${e.logged_date}: ${e.weight_kg} kg`}
                  className="flex-1 rounded-t bg-primary/60 transition-all"
                  style={{ height: `${pct}%` }}
                />
              );
            })}
          </div>
        )}
        {weightLog.length > 0 && weightLog[0] && (
          <p className="text-xs text-muted-foreground">
            Latest: {weightLog[0].weight_kg} kg ({new Date(weightLog[0].logged_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })})
          </p>
        )}

        <Eyebrow className="pt-2">Us</Eyebrow>
        <Field label="Shared goal"><TextInput value={f.goal} onChange={set("goal")} placeholder="Eat better together" maxLength={120} /></Field>
        <Field label="Custom couple message"><TextInput value={f.msg} onChange={set("msg")} placeholder="Getting healthier together, one meal at a time ❤️" maxLength={160} /></Field>
        <Field label="Together since (optional)"><TextInput type="date" value={f.since} onChange={set("since")} /></Field>
        <Btn size="lg" className="w-full" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
      </div>

      <div className="mt-10 space-y-3">
        <Eyebrow>Space</Eyebrow>
        <Btn variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText(inviteUrl(room.room_code)).then(() => toast.success("Invite link copied"), () => toast.error("Couldn't copy"))}>
          Copy invite link · {room.room_code}
        </Btn>

        {/* Device link card */}
        <Btn variant="outline" className="w-full" disabled={linkBusy} onClick={genLinkCode}>
          {linkBusy ? "Generating…" : "Link another device 📱"}
        </Btn>
        {linkCode && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">6-digit device code</div>
              <div className="font-mono text-4xl tracking-[0.25em] text-foreground">{linkCode.code}</div>
              <div className="mt-1 text-xs text-muted-foreground">Expires in {countdown}</div>
            </div>
            <div className="border-t border-border pt-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground text-sm">How to add the new device:</p>
              <p>1. Open the app on your other phone</p>
              <p>2. Tap <span className="font-medium text-foreground">"Have a room code?"</span></p>
              <p>3. Enter your room code: <span className="font-mono font-medium text-foreground">{room.room_code}</span></p>
              <p>4. On the next screen, tap <span className="font-medium text-foreground">"Add this device"</span> and enter this 6-digit code</p>
            </div>
          </div>
        )}

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

