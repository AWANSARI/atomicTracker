/**
 * BMI + daily energy/macro targets, computed from MealPlannerConfig body
 * metrics. Pure functions — safe to import in client and server code.
 *
 * Formulas:
 *  - BMI = weight(kg) / [height(m)]^2
 *  - BMR via Mifflin-St Jeor (1990, gold standard for sedentary populations)
 *  - TDEE = BMR × activity factor
 *  - Goal adjustment: lose -500 kcal, maintain 0, gain +300 kcal (lean bulk)
 *  - Macros: protein scaled by bodyweight (lean-mass-preserving), fat = 25-30%
 *    of kcal, carbs fill the remainder.
 */

export type BmiCategory =
  | "underweight"
  | "normal"
  | "overweight"
  | "obese-1"
  | "obese-2"
  | "obese-3";

export type BmiResult = {
  bmi: number;
  category: BmiCategory;
  /** Human-readable label, e.g. "Normal weight". */
  label: string;
};

export type DailyTargets = {
  bmrKcal: number;
  tdeeKcal: number;
  /** Final daily kcal target after goal adjustment. */
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
};

const ACTIVITY_FACTOR: Record<NonNullable<ActivityLevel>, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  "very-active": 1.9,
};

type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very-active";

type Sex = "male" | "female" | "other";
type Goal = "lose" | "maintain" | "gain";

const GOAL_KCAL_DELTA: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

export function computeBmi(heightCm: number, weightKg: number): BmiResult {
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  return { bmi, ...categorize(bmi) };
}

function categorize(bmi: number): { category: BmiCategory; label: string } {
  if (bmi < 18.5) return { category: "underweight", label: "Underweight" };
  if (bmi < 25) return { category: "normal", label: "Normal weight" };
  if (bmi < 30) return { category: "overweight", label: "Overweight" };
  if (bmi < 35) return { category: "obese-1", label: "Obese (Class I)" };
  if (bmi < 40) return { category: "obese-2", label: "Obese (Class II)" };
  return { category: "obese-3", label: "Obese (Class III)" };
}

/** Mifflin-St Jeor BMR. Sex "other" averages male and female formulas. */
function bmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  // "other" — neutral mean
  return base - 78;
}

export function computeDailyTargets(input: {
  heightCm: number;
  weightKg: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  goal: Goal;
}): DailyTargets {
  const bmrKcal = Math.round(
    bmr(input.weightKg, input.heightCm, input.age, input.sex),
  );
  const tdeeKcal = Math.round(bmrKcal * ACTIVITY_FACTOR[input.activityLevel]);
  const kcal = Math.max(1200, tdeeKcal + GOAL_KCAL_DELTA[input.goal]);

  // Protein: lose 1.8 g/kg (preserves lean mass during deficit), gain 1.6 g/kg
  // (supports synthesis), maintain 1.4 g/kg.
  const proteinGPerKg =
    input.goal === "lose" ? 1.8 : input.goal === "gain" ? 1.6 : 1.4;
  const protein_g = Math.round(input.weightKg * proteinGPerKg);

  // Fat: 25% of kcal at 9 kcal/g
  const fat_g = Math.round((kcal * 0.25) / 9);

  // Carbs: remainder of kcal at 4 kcal/g
  const proteinKcal = protein_g * 4;
  const fatKcal = fat_g * 9;
  const carbsKcal = Math.max(0, kcal - proteinKcal - fatKcal);
  const carbs_g = Math.round(carbsKcal / 4);

  // Fiber: 14 g per 1000 kcal (Institute of Medicine recommendation)
  const fiber_g = Math.round((kcal / 1000) * 14);

  return { bmrKcal, tdeeKcal, kcal, protein_g, fat_g, carbs_g, fiber_g };
}

/** True if the config has the minimum fields needed to compute targets. */
export function canComputeTargets(input: {
  heightCm?: number;
  weightKg?: number;
  age?: number;
  sex?: Sex;
  activityLevel?: ActivityLevel;
  goal?: Goal;
}): input is {
  heightCm: number;
  weightKg: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  goal: Goal;
} {
  return (
    typeof input.heightCm === "number" &&
    input.heightCm > 0 &&
    typeof input.weightKg === "number" &&
    input.weightKg > 0 &&
    typeof input.age === "number" &&
    input.age > 0 &&
    typeof input.sex === "string" &&
    typeof input.activityLevel === "string" &&
    typeof input.goal === "string"
  );
}

/** Goal label for UI display. */
export function goalLabel(goal: Goal): string {
  return goal === "lose"
    ? "Weight loss"
    : goal === "gain"
      ? "Bulking / gain"
      : "Maintain";
}

/** Activity level label for UI display. */
export function activityLabel(level: ActivityLevel): string {
  return {
    sedentary: "Sedentary (desk job, no exercise)",
    light: "Lightly active (1–3 sessions/week)",
    moderate: "Moderately active (3–5 sessions/week)",
    active: "Very active (6–7 sessions/week)",
    "very-active": "Athlete (twice-daily training)",
  }[level];
}
