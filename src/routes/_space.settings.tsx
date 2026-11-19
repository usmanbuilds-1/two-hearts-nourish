import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSpace } from "@/lib/space";
import { clearSession, readSession } from "@/lib/session";
import { createPartnerInvite, leaveRoom } from "@/lib/room.functions";
import { buildInviteUrl } from "@/lib/rejoin-links";
import { RecoveryLinks } from "@/components/us/RecoveryLinks";
import { DeviceCenter } from "@/components/us/DeviceCenter";
import { exportMyMealsCsv } from "@/lib/export-meals.functions";
import { Btn, Eyebrow, Field, Screen, TextInput } from "@/components/us/primitives";
import { ACTIVITY, type Activity, type BodyGoal, type HealthInput, type Sex, bmi, bmiCategory, bmr, suggest, validate } from "@/lib/health";
import { evidenceRateBounds, isEvidenceSupportedRate } from "@/lib/adaptive-target";
import { logWeight, getWeightLog, type WeightEntry } from "@/lib/weight.functions";
import type { Member, Room } from "@/lib/nutrition";
import { localDate } from "@/lib/nutrition";
import { validateTargets } from "@/lib/settings-validation";

export const Route = createFileRoute("/_space/settings")({
  head: () => ({ meta: [{ title: "Settings — Us" }, { name: "description", content: "Names, targets and your shared message." }, { property: "og:title", content: "Settings — Us" }, { property: "og:description", content: "Names, targets and your shared message." }] }),
  component: SettingsPage,
});

const n = (s: string): number | null => s.trim() === "" ? null : Number(s);

const PAL_OPTIONS = [
  { value: "1.4", label: "Mostly seated", description: "Little walking or exercise most days" },
  { value: "1.6", label: "Some activity", description: "Mostly seated, with walking or exercise during the week" },
  { value: "1.75", label: "Active", description: "Regular movement, on your feet often or frequent training" },
  { value: "2.05", label: "Very active", description: "Physical work or considerable daily activity" },
] as const;

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
  const [personalKey, setPersonalKey] = useState(() => readSession()?.key ?? "");

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
  // New/unconfigured profiles show the feature checked by default, but no
  // adaptive changes run until the member has chosen a goal and pace.
  // An explicit prior opt-out has configured_at set and is preserved.
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(
    Boolean(me.adaptive_targets_enabled || !me.adaptive_target_configured_at),
  );
  const [adaptivePal, setAdaptivePal] = useState(String(me.physical_activity_level ?? "1.6"));
  const [adaptiveRate, setAdaptiveRate] = useState(String(
    me.target_rate_pct_per_week ?? (me.body_goal === "maintain" ? 0 : ""),
  ));

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
  const adaptivePalNumber = Number(adaptivePal);
  const adaptiveGoal = calc.goal as BodyGoal | "";
  const adaptiveRateNumber = adaptiveGoal === "maintain" ? 0 :
    adaptiveRate.trim() === "" ? NaN : Number(adaptiveRate);
  const adaptiveRateBounds = adaptiveGoal
    ? evidenceRateBounds(adaptiveGoal)
    : null;
  const adaptiveConfigError = adaptiveEnabled
    ? !adaptiveGoal
      ? "Choose your goal to finish adaptive setup."
      : !Number.isFinite(adaptivePalNumber) || adaptivePalNumber < 1.4 || adaptivePalNumber > 2.5
        ? "Choose an activity level."
        : !Number.isFinite(adaptiveRateNumber) || !isEvidenceSupportedRate(adaptiveGoal, adaptiveRateNumber)
          ? "Choose a gain/loss pace to finish setup."
          : null
    : null;
  const adaptiveReadyToSave = adaptiveEnabled && adaptiveConfigError === null;

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
      await logWeight({ data: { weightKg: kg, clientDate: localDate() } });
      setWeightInput("");
      const r = await getWeightLog();
      setWeightLog(r.entries);
      setCalc((previous) => ({ ...previous, weightKg: String(kg) }));
      setMember({ ...me, weight_kg: kg });
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
    if (busy) return;
    if (!f.name.trim()) return void toast.error("Your name can't be empty.");
    const targetError = validateTargets(f);
    if (targetError) return void toast.error(targetError);
    setBusy(true);
    // Incomplete optional adaptive setup must never block editing other
    // profile fields. No model adjustment is allowed until setup is complete.
    const nextGoal = (calc.goal || null) as "lose" | "maintain" | "gain" | null;
    const nextPal = adaptiveReadyToSave ? adaptivePalNumber : me.physical_activity_level;
    const nextRate = adaptiveReadyToSave
      ? (nextGoal === "maintain" ? 0 : adaptiveRateNumber)
      : me.target_rate_pct_per_week;
    const adaptiveConfigChanged =
      adaptiveEnabled !== Boolean(me.adaptive_targets_enabled) ||
      nextPal !== me.physical_activity_level ||
      nextRate !== me.target_rate_pct_per_week ||
      nextGoal !== me.body_goal;

    const healthFields = {
      height_cm: parseFloat(calc.heightCm) || null,
      weight_kg: parseFloat(calc.weightKg) || null,
      age: parseInt(calc.age) || null,
      sex: (calc.sex || null) as "male" | "female" | null,
      activity_level: calc.activity || null,
      body_goal: nextGoal,
      adaptive_targets_enabled: adaptiveEnabled,
      physical_activity_level: nextPal,
      target_rate_pct_per_week: nextRate,
      // Enabling the feature is not consent to an unconfigured calorie change.
      // Also record explicit opt-outs so future defaults never override them.
      adaptive_target_configured_at: !adaptiveEnabled
        ? (adaptiveConfigChanged ? new Date().toISOString() : me.adaptive_target_configured_at)
        : adaptiveReadyToSave
          ? (adaptiveConfigChanged || !me.adaptive_target_configured_at
            ? new Date().toISOString()
            : me.adaptive_target_configured_at)
          : null,
    };
    try {
      // These are separate PostgREST writes until the atomic settings RPC is
      // deployed. Inspect both outcomes rather than hiding partial success.
      const [aResult, bResult] = await Promise.allSettled([
        supabase.from("members").update({
          display_name: f.name.trim().slice(0, 40),
          daily_calorie_target: n(f.kcal), daily_protein_target: n(f.p),
          daily_carbs_target: n(f.c), daily_fat_target: n(f.fat),
          ...healthFields,
        }).eq("id", me.id).select("id, room_id, auth_user_id, seat, display_name, daily_calorie_target, daily_protein_target, daily_carbs_target, daily_fat_target, height_cm, weight_kg, age, sex, activity_level, adaptive_targets_enabled, adaptive_target_configured_at, physical_activity_level, target_rate_pct_per_week, body_goal, daily_food_budget, currency, locality, created_at").single(),
        supabase.from("rooms").update({
          shared_goal: f.goal.trim().slice(0, 120) || null,
          couple_message: f.msg.trim().slice(0, 160) || null,
          together_since: f.since || null,
        }).eq("id", room.id).select().single(),
      ]);
      const personal = aResult.status === "fulfilled" ? aResult.value : null;
      const shared = bResult.status === "fulfilled" ? bResult.value : null;
      const personalSaved = Boolean(personal && !personal.error && personal.data);
      const sharedSaved = Boolean(shared && !shared.error && shared.data);
      if (personalSaved && personal?.data) setMember(personal.data as Member);
      if (sharedSaved && shared?.data) setRoom(shared.data as Room);

      if (personalSaved && sharedSaved) toast.success("Saved ❤️");
      else if (personalSaved) toast.error("Personal targets saved, but the shared space settings didn't. Try saving again.");
      else if (sharedSaved) toast.error("Shared space settings saved, but personal targets didn't. Try saving again.");
      else toast.error("Nothing was confirmed saved. Check your connection and retry.");
    } catch {
      toast.error("Couldn't confirm the save. Reopen Settings to check your latest values.");
    } finally {
      setBusy(false);
    }
  }

  async function exportMeals() {
    try {
      const csv=await exportMyMealsCsv();
      const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download="my-meals.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      toast.success("Your meals are ready");
    }catch(error){
      toast.error(String(error).includes("EXPORT_TOO_LARGE")?
        "Export exceeds the current limit. Contact the app owner.":"Couldn't export your meals.");
    }
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

  const key = personalKey;

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

        <Eyebrow className="pt-2">Adaptive calorie target</Eyebrow>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={adaptiveEnabled}
            onChange={(e) => setAdaptiveEnabled(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Adapt from my real data</span>
            <span className="block text-xs text-muted-foreground">
              Uses fully logged days, weight measurements and the Hall/NIDDK body-weight model. AI does not set the number.
            </span>
          </span>
        </label>
        {adaptiveEnabled && (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              First choose your goal, activity and preferred pace. These are estimates, not measurements.
              Your calorie target stays the same until enough reliable food and weight history is available.
            </p>
            <Field label="Your goal">
              <div className="grid grid-cols-3 gap-2">
                {(["lose", "maintain", "gain"] as const).map((goal) => (
                  <button key={goal} type="button" onClick={() => {
                    setCalc((prev) => ({ ...prev, goal }));
                    setAdaptiveRate("");
                  }}
                    className={`min-h-11 rounded-xl border px-2 py-2 text-sm capitalize ${
                      adaptiveGoal === goal ? "border-primary bg-primary/10 text-primary" : "border-border"
                    }`}>{goal}</button>
                ))}
              </div>
            </Field>
            <Field label="How active is a typical week?" hint="Choose the closest description, not just how often you exercise. The PAL multiplier is an estimate.">
              <div className="space-y-2">
                {PAL_OPTIONS.map((option) => (
                  <button key={option.value} type="button" onClick={() => setAdaptivePal(option.value)}
                    aria-pressed={adaptivePal === option.value}
                    className={`w-full min-h-12 rounded-xl border p-3 text-left ${
                      adaptivePal === option.value ? "border-primary bg-primary/10" : "border-border"
                    }`}>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                  </button>
                ))}
                {!PAL_OPTIONS.some((item) => item.value === adaptivePal) && (
                  <div className="text-xs text-muted-foreground">
                    Saved custom PAL: {adaptivePal}. Choose a description to change it.
                  </div>
                )}
              </div>
            </Field>
            <p className="text-xs text-muted-foreground">
              PAL currently {adaptivePal}. NIDDK's 1.6 default describes mostly seated work with
              some weekly walking or exercise; it's a starting estimate, not a measured expenditure.
            </p>
            {adaptiveGoal && adaptiveGoal !== "maintain" ? (
              <Field label={adaptiveGoal === "gain" ? "How quickly would you like to gain?" : "How quickly would you like to lose?"}
                hint="Choose a preference; the rate is a planning target, not a guarantee.">
                <div className="grid grid-cols-2 gap-2">
                  {(adaptiveGoal === "gain"
                    ? [{ value: "0.25", label: "Gradual", rate: "+0.25%" },
                       { value: "0.5", label: "Faster", rate: "+0.50%" }]
                    : [{ value: "-0.5", label: "Gradual", rate: "−0.50%" },
                       { value: "-1", label: "Faster", rate: "−1.00%" }]
                  ).map((option) => (
                    <button key={option.value} type="button" onClick={() => setAdaptiveRate(option.value)}
                      aria-pressed={adaptiveRate === option.value}
                      className={`min-h-16 rounded-xl border p-3 text-left ${
                        adaptiveRate === option.value ? "border-primary bg-primary/10" : "border-border"
                      }`}>
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.rate} body weight / week</span>
                      {Number(calc.weightKg) > 0 && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          ~{(Number(calc.weightKg) * Math.abs(Number(option.value)) / 100).toFixed(2)} kg/week
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </Field>
            ) : adaptiveGoal === "maintain" ? (
              <p className="text-sm text-muted-foreground">Maintain weight: no intended weekly weight change.</p>
            ) : null}
            {adaptiveRateBounds && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                The displayed rates come from published natural-bodybuilding reviews and
                are not individual prescriptions. Activity comes from NIDDK/NASEM estimates.
              </p>
            )}
            {adaptiveConfigError ? (
              <p className="text-sm text-muted-foreground">{adaptiveConfigError} You can still save your other settings.</p>
            ) : (
              <p className="text-sm text-primary">Ready. Save settings to start collecting evidence.</p>
            )}
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
        {!partner && <Btn variant="outline" className="w-full" onClick={() => void createPartnerInvite()
          .then((invite) => navigator.clipboard.writeText(
            buildInviteUrl(window.location.origin, invite.roomCode, invite.token),
          ))
          .then(() => toast.success("Private invitation copied"), () => toast.error("Couldn't create the invitation."))}>
          Invite your partner to join · {room.room_code}
        </Btn>}

        <RecoveryLinks partnerName={partner?.display_name ?? null} />
        <DeviceCenter key={me.id} onKeyRotated={setPersonalKey} />

        <Btn variant="outline" className="w-full" onClick={toggleTheme}>Theme: {dark ? "Dark" : "Light"}</Btn>
        <div className="rounded-xl border border-border p-4 text-sm">
          <div className="text-muted-foreground">Your personal key can restore this profile. Store it somewhere private, away from shared chats.</div>
          {showKey ? <div className="mt-2 break-all font-mono text-xs">{key}</div> : <button className="mt-2 text-primary" onClick={() => setShowKey(true)}>Show my key</button>}
        </div>
        <Btn variant="outline" className="w-full" onClick={()=>void exportMeals()}>Export my meals (CSV)</Btn>
        <Btn variant="outline" className="w-full" onClick={reset}>Reset this phone</Btn>
        <Btn variant="danger" className="w-full" onClick={leave}>Leave space</Btn>
      </div>
    </Screen>
  );
}

