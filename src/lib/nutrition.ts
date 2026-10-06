export type MealType = "breakfast" | "lunch" | "snack" | "dinner";

export type Meal = {
  id: string;
  room_id: string;
  member_id: string;
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_description: string | null;
  ai_confidence: string | null;
  meal_type: MealType;
  meal_date: string;
  created_at: string;
  updated_at: string;
};

export type Member = {
  id: string;
  room_id: string;
  auth_user_id: string | null;
  seat: number;
  display_name: string;
  daily_calorie_target: number | null;
  daily_protein_target: number | null;
  daily_carbs_target: number | null;
  daily_fat_target: number | null;
  created_at: string;
};

export type Room = {
  id: string;
  room_code: string;
  shared_goal: string | null;
  couple_message: string | null;
  together_since: string | null;
  created_at: string;
};

export const MEAL_TYPES: { key: MealType; label: string; icon: string }[] = [
  { key: "breakfast", label: "Breakfast", icon: "☀️" },
  { key: "lunch", label: "Lunch", icon: "🍗" },
  { key: "snack", label: "Snack", icon: "🍌" },
  { key: "dinner", label: "Dinner", icon: "🌙" },
];

/** YYYY-MM-DD in the user's local timezone (never UTC). */
export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(s: string) {
  const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number) {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86400000);
}

export function defaultMealType(d = new Date()): MealType {
  const h = d.getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

export type Totals = { calories: number; protein: number; carbs: number; fat: number; count: number };
const empty = (): Totals => ({ calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 });

export function totals(meals: Meal[]): Totals {
  const t = empty();
  for (const m of meals) {
    t.calories += m.calories;
    t.protein += Number(m.protein);
    t.carbs += Number(m.carbs);
    t.fat += Number(m.fat);
    t.count++;
  }
  return t;
}

export const fmt = (n: number) => Math.round(n).toLocaleString();

/** date -> memberId -> meals */
export function indexByDay(meals: Meal[]) {
  const map = new Map<string, Map<string, Meal[]>>();
  for (const m of meals) {
    let day = map.get(m.meal_date);
    if (!day) map.set(m.meal_date, (day = new Map()));
    const list = day.get(m.member_id) ?? [];
    list.push(m);
    day.set(m.member_id, list);
  }
  return map;
}

function hitProtein(member: Member, meals: Meal[] | undefined) {
  const target = member.daily_protein_target ? Number(member.daily_protein_target) : 0;
  return target > 0 && totals(meals ?? []).protein >= target;
}

export type CoupleStats = {
  totalMeals: number;
  daysActive: number;
  daysBoth: number;
  daysBothProtein: number;
  streak: number;
  sharedDinners: number;
  firstBothDay: string | null;
  bothProteinDays: Set<string>;
  bothDays: Set<string>;
};

export function coupleStats(meals: Meal[], me: Member, partner: Member | null, today: string): CoupleStats {
  const byDay = indexByDay(meals);
  const bothDays = new Set<string>();
  const bothProteinDays = new Set<string>();
  let sharedDinners = 0;
  for (const [day, members] of byDay) {
    if (partner && members.get(me.id)?.length && members.get(partner.id)?.length) {
      bothDays.add(day);
      if (hitProtein(me, members.get(me.id)) && hitProtein(partner, members.get(partner.id)))
        bothProteinDays.add(day);
      const d1 = members.get(me.id)!.some((m) => m.meal_type === "dinner");
      const d2 = members.get(partner.id)!.some((m) => m.meal_type === "dinner");
      if (d1 && d2) sharedDinners++;
    }
  }
  let streak = 0;
  let cursor = bothDays.has(today) ? today : addDays(today, -1);
  while (bothDays.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...bothDays].sort();
  return {
    totalMeals: meals.length,
    daysActive: byDay.size,
    daysBoth: bothDays.size,
    daysBothProtein: bothProteinDays.size,
    streak,
    sharedDinners,
    firstBothDay: sorted[0] ?? null,
    bothProteinDays,
    bothDays,
  };
}

export type Milestone = { icon: string; title: string; achieved: boolean };

export function milestones(s: CoupleStats): Milestone[] {
  return [
    { icon: "❤️", title: "First meal together", achieved: s.daysBoth >= 1 },
    { icon: "🔥", title: "7 days logging together", achieved: s.streak >= 7 || s.daysBoth >= 7 },
    { icon: "💪", title: "Both hit protein goals", achieved: s.daysBothProtein >= 1 },
    { icon: "🍽️", title: "50 meals logged", achieved: s.totalMeals >= 50 },
    { icon: "🌱", title: "30 days taking care of yourselves", achieved: s.daysActive >= 30 },
  ];
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Small, never-judgmental messages derived from real data. */
export function usMessages(opts: {
  me: Member;
  partner: Member | null;
  todayMine: Meal[];
  todayTheirs: Meal[];
  yesterdayBothProtein: boolean;
  yesterdayBoth: boolean;
  streak: number;
}): string[] {
  const { me, partner, todayMine, todayTheirs } = opts;
  const out: string[] = [];
  const pName = partner?.display_name ?? "Your partner";
  if (!todayMine.length && !todayTheirs.length) {
    out.push("Nobody has fed the app today 😂");
    if (opts.yesterdayBoth) out.push("Yesterday was a good one. Let's keep it going.");
    return out;
  }
  const bothBreakfast =
    todayMine.some((m) => m.meal_type === "breakfast") && todayTheirs.some((m) => m.meal_type === "breakfast");
  if (bothBreakfast) out.push("You both logged breakfast ☀️");
  if (todayMine.length && todayTheirs.length) out.push("You're both off to a good start.");
  else if (todayTheirs.length && partner) out.push(`${pName} has started today 👀`);
  else if (partner) out.push(`${pName} hasn't logged anything yet.`);

  const pt = partner?.daily_protein_target ? Number(partner.daily_protein_target) : 0;
  const theirP = totals(todayTheirs).protein;
  if (pt > 0 && theirP > 0 && theirP < pt && pt - theirP <= 30)
    out.push(`${pName} is ${Math.round(pt - theirP)}g away from their protein goal.`);
  const mt = me.daily_protein_target ? Number(me.daily_protein_target) : 0;
  const myP = totals(todayMine).protein;
  if (mt > 0 && myP >= mt) out.push("Protein is looking strong today 💪");
  if (opts.streak >= 3) out.push(`${opts.streak} days logging together 🔥`);
  if (opts.yesterdayBothProtein) out.push("Yesterday you both hit your protein goals.");
  if (out.length < 2) out.push("One more meal in the books.");
  return out;
}
