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

  /** Mealtime defaults for Sunday prep flow (HH:MM in user's local tz). */
  mealtimes: {
    breakfast: string;
    lunch: string;
    dinner: string;
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
