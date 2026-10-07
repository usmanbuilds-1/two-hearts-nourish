/**
 * Evidence-based estimates: BMI (WHO), BMR (Mifflin–St Jeor, the most accurate
 * general-population equation per ADA review), TDEE = BMR × activity factor.
 * Safety: adults only, no aggressive deficits, never below sex-specific floors
 * or BMR, no weight-loss suggestion when underweight.
 */
export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type BodyGoal = "lose" | "maintain" | "gain";

export const ACTIVITY: Record<Activity, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: "Mostly sitting, little exercise" },
  light: { factor: 1.375, label: "Light exercise 1–3 days/week" },
  moderate: { factor: 1.55, label: "Moderate exercise 3–5 days/week" },
  active: { factor: 1.725, label: "Hard exercise 6–7 days/week" },
  very_active: { factor: 1.9, label: "Physical job or twice-daily training" },
};

export type HealthInput = { heightCm: number; weightKg: number; age: number; sex: Sex; activity: Activity; goal: BodyGoal };

export function bmi(heightCm: number, weightKg: number) {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(b: number) {
  if (b < 18.5) return "Underweight";
  if (b < 25) return "Healthy range";
  if (b < 30) return "Overweight";
  return "Obesity range";
}

export function bmr({ heightCm, weightKg, age, sex }: Pick<HealthInput, "heightCm" | "weightKg" | "age" | "sex">) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export function validate(i: Partial<HealthInput>): string | null {
  if (!i.heightCm || i.heightCm < 120 || i.heightCm > 230) return "Height should be between 120 and 230 cm.";
  if (!i.weightKg || i.weightKg < 30 || i.weightKg > 300) return "Weight should be between 30 and 300 kg.";
  if (!i.age || !Number.isInteger(i.age)) return "Please enter your age in whole years.";
  if (i.age < 18) return "These formulas are for adults. Under 18, please ask a doctor or dietitian for targets.";
  if (i.age > 100) return "Please check your age.";
  if (!i.sex) return "Please choose the sex used for the formula.";
  if (!i.activity) return "Please choose an activity level.";
  if (!i.goal) return "Please choose a goal.";
  return null;
}

export type Suggestion = {
  bmi: number;
  category: string;
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes: string[];
};

const r10 = (n: number) => Math.round(n / 10) * 10;

export function suggest(i: HealthInput): Suggestion {
  const b = bmi(i.heightCm, i.weightKg);
  const base = bmr(i);
  const tdee = base * ACTIVITY[i.activity].factor;
  const notes: string[] = [];
  let goal = i.goal;
  if (goal === "lose" && b < 18.5) {
    goal = "maintain";
    notes.push("Your BMI is under 18.5, so we won't suggest eating less. Please talk to a doctor before trying to lose weight.");
  }
  let kcal = tdee;
  if (goal === "lose") kcal = tdee - Math.min(500, tdee * 0.2); // ~0.5 kg/week max
  if (goal === "gain") kcal = tdee + 250; // lean, gradual gain
  const floor = Math.max(i.sex === "male" ? 1500 : 1200, base);
  if (kcal < floor) {
    kcal = floor;
    notes.push("We kept this at a safe minimum. Going lower should only happen with medical supervision.");
  }
  kcal = r10(kcal);
  // Protein from a reference weight (BMI 25) when BMI ≥ 30 so it isn't inflated.
  const refW = b >= 30 ? 25 * (i.heightCm / 100) ** 2 : i.weightKg;
  const protein = Math.round(refW * (goal === "lose" ? 1.8 : 1.6));
  const fat = Math.round(Math.max((kcal * 0.28) / 9, refW * 0.6));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  if (i.age >= 65) notes.push("Over 65, protein needs can be higher — a dietitian can fine-tune this.");
  notes.push("These are estimates (±10%). If you're pregnant, breastfeeding or have a medical condition, check with a doctor.");
  return { bmi: b, category: bmiCategory(b), bmr: Math.round(base), tdee: r10(tdee), calories: kcal, protein, carbs, fat, notes };
}
