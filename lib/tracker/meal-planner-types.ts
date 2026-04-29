/**
 * Schema for /AtomicTracker/config/tracker.meal-planner.json.
 * Stored as plain JSON (not encrypted) — this is preference data, not secrets.
 */

export type MealPlannerConfig = {
  v: 1;

  /** Diet styles, multi-select. Identifiers from DIET_OPTIONS. */
  diets: string[];
  customDiet?: string;

  /** Health conditions, multi-select. Identifiers from HEALTH_OPTIONS. */
  healthConditions: string[];
  customHealth?: string;

  /** Allergies — known + free text. */
  allergies: string[];
  customAllergies: string[];

  /** Cuisines — known + free text. */
  cuisines: string[];
  customCuisines: string[];

  /** Ingredients the AI may use. Suggested-by-cuisine + user additions. */
  ingredients: string[];
  customIngredients: string[];

  /** How many times per week the same dish may repeat. 1-7. */
  repeatsPerWeek: number;

  /**
   * How often the user actually cooks. Affects the AI plan:
   *  - "daily": 7 unique dinners
   *  - "alternate": 4 dinners (Mon/Wed/Fri/Sun) eaten over leftover days
   *  - "twice-weekly": 2 batch cook sessions, larger portions
   *  - "weekly": 1 big batch cook for the week
   *  - "custom": (free text in customCookingFrequency)
   */
  cookingFrequency: "daily" | "alternate" | "twice-weekly" | "weekly" | "custom";
  customCookingFrequency?: string;

  /** Day of week with no planned meal — eat what you want. null = no cheat day. */
  cheatDay: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun" | null;

  /**
   * Body metrics — drives BMI and recommended daily kcal/macro targets via
   * Mifflin-St Jeor. All optional; if any are missing we skip the targets.
   */
  heightCm?: number;
  weightKg?: number;
  age?: number;
  sex?: "male" | "female" | "other";

  /** Activity level for kcal target (Mifflin-St Jeor multiplier). */
  activityLevel?: "sedentary" | "light" | "moderate" | "active" | "very-active";

  /** Targeted journey for the meal plan. */
  goal?: "lose" | "maintain" | "gain";

  /** Free-text from a nutritionist (or self) — fed verbatim into the AI prompt. */
  nutritionistNotes?: string;

  /**
   * Lifestyle / wellness symptoms the user is trying to address. Identifiers
   * from SYMPTOM_OPTIONS (hair-loss, fatigue, brain-fog, irregular-cycle…).
   * Distinct from healthConditions — symptoms are observed, not diagnosed.
   * Fed into the AI prompt so meals bias toward addressing them.
   */
  symptoms?: string[];

  /**
   * If true, AI generates a 4-slot week (breakfast + lunch + dinner + snack).
   * If false (default), only dinner — preserves the legacy single-slot flow.
   */
  snacksEnabled?: boolean;

  /** Mealtime defaults for Sunday prep flow (HH:MM in user's local tz). */
  mealtimes: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };

  /** Default breakfast/lunch dish — pre-fills prep check-in fields. */
  defaultBreakfast?: string;
  defaultLunch?: string;

  /** Days of the week the user actually cooks (drives optional cooking events). */
  cookingDays: ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun")[];

  /** Single day for the recurring grocery-shopping reminder. */
  shoppingDay: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

  /** Time for the shopping reminder (HH:MM, user's local tz). */
  shoppingTime: string;

  /**
   * Recurring Calendar event IDs created once at config setup, so we don't
   * duplicate them on every plan accept.
   */
  reminderEventIds?: {
    fridayPlan?: string;
    sundayPrep?: string;
    weeklyShopping?: string;
  };

  /** Populated as user marks favorites; empty on first save. */
  favoriteMeals: string[];
  favoriteIngredients: string[];

  createdAt: string;
  updatedAt: string;
};

export function emptyMealPlannerConfig(): MealPlannerConfig {
  const now = new Date().toISOString();
  return {
    v: 1,
    diets: [],
    healthConditions: [],
    allergies: [],
    customAllergies: [],
    cuisines: [],
    customCuisines: [],
    ingredients: [],
    customIngredients: [],
    repeatsPerWeek: 2,
    cookingFrequency: "daily",
    cheatDay: null,
    cookingDays: ["Sun"],
    shoppingDay: "Sat",
    shoppingTime: "10:00",
    mealtimes: {
      breakfast: "08:00",
      lunch: "12:30",
      dinner: "19:00",
    },
    favoriteMeals: [],
    favoriteIngredients: [],
    createdAt: now,
    updatedAt: now,
  };
}
