import "server-only";

import {
  ALL_DIETS,
  COMMON_ALLERGIES,
  COOKING_FREQUENCIES,
  CUISINES,
  HEALTH_OPTIONS,
} from "./meal-planner-defaults";
import type { MealPlannerConfig } from "./meal-planner-types";
import type { MealPlan } from "./meal-planner-plan";
import {
  canComputeTargets,
  computeBmi,
  computeDailyTargets,
  goalLabel,
} from "./nutrition";

/**
 * Per-week customization that overrides the saved config for THIS generation
 * only. The user can swap cuisines, ingredients, diets, or add free-text
 * direction without modifying their saved profile.
 */
export type WeekOverride = {
  diets?: string[];
  cuisines?: string[];
  customCuisines?: string[];
  ingredients?: string[];
  customIngredients?: string[];
  /** Override the AI's daily kcal target for THIS week only. */
  caloriesPerDay?: number;
  /** Free-text direction: "make this week vegetarian", "lighter dinners", etc. */
  notes?: string;
};

/** Apply a week override to a config, returning a new config object. */
export function applyWeekOverride(
  config: MealPlannerConfig,
  override?: WeekOverride,
): MealPlannerConfig {
  if (!override) return config;
  return {
    ...config,
    diets: override.diets ?? config.diets,
    cuisines: override.cuisines ?? config.cuisines,
    customCuisines: override.customCuisines ?? config.customCuisines,
    ingredients: override.ingredients ?? config.ingredients,
    customIngredients: override.customIngredients ?? config.customIngredients,
  };
}

/**
 * Build a meal-planner system prompt from the user's config + recent history.
 * Returns a string that asks the AI for a JSON-only response with 7 meals.
 */
export function buildMealPlannerPrompt(args: {
  config: MealPlannerConfig;
  recentHistory: MealPlan[];
  weekStart: string;
  weekEnd: string;
  /** Optional per-week override (cuisines, ingredients, notes, kcal). */
  override?: WeekOverride;
}): string {
  const baseConfig = args.config;
  const config = applyWeekOverride(baseConfig, args.override);
  const { recentHistory, weekStart, weekEnd, override } = args;

  const dietLabels = [
    ...config.diets.map((id) => labelOf(ALL_DIETS, id)),
    config.customDiet,
  ].filter(Boolean);

  const healthLabels = [
    ...config.healthConditions.map((id) => labelOf(HEALTH_OPTIONS, id)),
    config.customHealth,
  ].filter(Boolean);

  const allergyLabels = [
    ...config.allergies.map((id) => labelOf(COMMON_ALLERGIES, id)),
    ...config.customAllergies,
  ];

  const cuisineLabels = [
    ...config.cuisines.map((id) => labelOf(CUISINES, id)),
    ...config.customCuisines,
  ];

  const ingredients = [...config.ingredients, ...config.customIngredients];

  const historyLines = recentHistory.length
    ? recentHistory
        .slice(0, 4)
        .map(
          (p) =>
            `  ${p.weekId}: ${p.meals.map((m) => m.name).join(", ")}`,
        )
        .join("\n")
    : "  (no prior history)";

  // Days to plan for — exclude cheat day if set
  const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const daysToPlan = config.cheatDay
    ? allDays.filter((d) => d !== config.cheatDay)
    : allDays;
  const mealCount = daysToPlan.length;
  const dayList = daysToPlan.join(", ");

  // Cooking frequency note for the AI
  const freqInfo = COOKING_FREQUENCIES.find((f) => f.id === config.cookingFrequency);
  const cookingNote =
    config.cookingFrequency === "custom" && config.customCookingFrequency
      ? config.customCookingFrequency
      : freqInfo?.hint ?? "";

  // Body metrics + computed nutrition targets. We use the BASE config here
  // (not the override-merged one) so a per-week override of cuisines doesn't
  // accidentally drop the user's persistent body profile.
  let bodyBlock = "";
  let nutritionBlock = "";
  if (canComputeTargets(baseConfig)) {
    const bmi = computeBmi(baseConfig.heightCm, baseConfig.weightKg);
    const t = computeDailyTargets({
      heightCm: baseConfig.heightCm,
      weightKg: baseConfig.weightKg,
      age: baseConfig.age,
      sex: baseConfig.sex,
      activityLevel: baseConfig.activityLevel,
      goal: baseConfig.goal,
    });
    const kcalTarget = override?.caloriesPerDay ?? t.kcal;
    bodyBlock = `\n\nBODY & GOAL
  Height: ${baseConfig.heightCm} cm · Weight: ${baseConfig.weightKg} kg · Age: ${baseConfig.age} · Sex: ${baseConfig.sex}
  Activity level: ${baseConfig.activityLevel}
  BMI: ${bmi.bmi.toFixed(1)} (${bmi.label})
  Goal: ${goalLabel(baseConfig.goal)}`;
    nutritionBlock = `\n\nDAILY NUTRITION TARGETS (each day's meal should fit alongside any default breakfast/lunch into roughly these totals — be realistic about a single dinner contributing ~35-45% of daily kcal)
  Daily kcal: ${kcalTarget} (BMR ${t.bmrKcal} · TDEE ${t.tdeeKcal})
  Protein: ${t.protein_g} g · Carbs: ${t.carbs_g} g · Fat: ${t.fat_g} g · Fiber: ${t.fiber_g} g`;
  } else if (override?.caloriesPerDay) {
    nutritionBlock = `\n\nDAILY NUTRITION TARGET\n  Daily kcal: ${override.caloriesPerDay}`;
  }

  const nutritionistBlock =
    baseConfig.nutritionistNotes && baseConfig.nutritionistNotes.trim()
      ? `\n\nNUTRITIONIST NOTES (verbatim — apply these as hard constraints where reasonable)
  ${baseConfig.nutritionistNotes.trim().split("\n").join("\n  ")}`
      : "";

  const overrideBlock =
    override && (override.notes || override.caloriesPerDay || override.cuisines || override.diets || override.ingredients)
      ? `\n\nWEEK-SPECIFIC OVERRIDE (this week only — do NOT treat as the user's persistent profile)
${override.notes ? `  Notes: ${override.notes}` : ""}${override.caloriesPerDay ? `\n  Per-day kcal target: ${override.caloriesPerDay}` : ""}${override.diets ? `\n  Diets (override): ${override.diets.join(", ") || "(any)"}` : ""}${override.cuisines ? `\n  Cuisines (override): ${[...override.cuisines, ...(override.customCuisines ?? [])].join(", ") || "(any)"}` : ""}${override.ingredients ? `\n  Pantry (override): ${[...override.ingredients, ...(override.customIngredients ?? [])].join(", ") || "(use common ingredients)"}` : ""}`
      : "";

  return `You are a thoughtful meal-planning assistant. Generate exactly ${mealCount} dinner meals for the week of ${weekStart} through ${weekEnd}, one per day on these days only: ${dayList}.

${config.cheatDay ? `IMPORTANT: ${config.cheatDay} is the user's cheat day — do NOT generate a meal for ${config.cheatDay}. The output array should NOT include any entry with day = "${config.cheatDay}".\n` : ""}USER PROFILE
  Diet preferences: ${dietLabels.join(", ") || "(none)"}
  Health conditions: ${healthLabels.join(", ") || "(none)"} — adjust sodium, glycemic load, fiber, iodine, etc. as appropriate
  Allergies (avoid completely): ${allergyLabels.join(", ") || "(none)"}
  Preferred cuisines: ${cuisineLabels.join(", ") || "(any)"}
  Pantry — primary ingredients to use: ${ingredients.length ? ingredients.join(", ") : "(no specific pantry — use common ingredients)"}
  Max repeats per dish in this week: ${config.repeatsPerWeek}
  Cooking pattern: ${cookingNote || "Not specified"} — generate dishes that match this pace. Larger batch portions if cooking less frequently.
  Favorite meals (include if reasonable): ${config.favoriteMeals.length ? config.favoriteMeals.join(", ") : "(none yet)"}${bodyBlock}${nutritionBlock}${nutritionistBlock}${overrideBlock}

RECENT HISTORY (avoid repeating identical dishes from the previous 4 weeks)
${historyLines}

GUIDELINES
- If the diet preferences include both Vegetarian and Non-vegetarian, mix both — leaning toward whatever the user's other selections suggest (e.g. if Halal is also selected, treat non-veg meats as halal).
- If health conditions include thyroid, diabetes, hypertension, or PCOS, lean toward whole grains, leafy greens, low-glycemic carbs, and adequate protein. Mention this in health_notes.
- Each meal should be realistically preparable in a home kitchen in under an hour.
- Use ingredients from the user's pantry preferentially; supplement with common pantry items only when needed.
- For youtube_query, write a concrete search query that would surface a credible recipe video. Include the cuisine and dish name. Avoid generic terms.
- For each ingredient, set "category" to one of: "produce", "protein", "dairy", "grain", "pantry", "spice", "frozen", "other". This is used to group items in the user's grocery list. Examples: tomato/onion/spinach -> produce; chicken/lamb/tofu/eggs/lentils -> protein; milk/yogurt/paneer/cheese/butter -> dairy; rice/pasta/bread/oats -> grain; oil/sauce/flour/sugar -> pantry; cumin/turmeric/garlic powder -> spice; frozen peas/corn -> frozen.
- For "storage": one short sentence describing how to refrigerate AND/OR freeze the cooked meal to keep it fresh — include container hint and approximate shelf life. Example: "Cool, then refrigerate in airtight container 3-4 days, or freeze flat in zip bags up to 2 months."
- For "reheat": one short sentence describing the best way to reheat — note microwave vs stovetop vs oven, any added liquid, target temperature, and a serving tip. Example: "Reheat from frozen: thaw overnight, then warm gently on stovetop with a splash of water 5-7 min until steaming. Top with fresh herbs."

OUTPUT
Return ONLY valid JSON. No markdown fences, no prose before or after. Schema:

{
  "meals": [
    {
      "day": "${daysToPlan[0] ?? "Mon"}",
      "name": "Specific dish name",
      "cuisine": "Indian | Mediterranean | etc.",
      "calories": 600,
      "macros": { "protein_g": 30, "carbs_g": 60, "fat_g": 22, "fiber_g": 8 },
      "health_notes": "1-2 sentences explaining how this meal fits the user's health/diet profile.",
      "ingredients": [
        { "name": "paneer", "qty": "200", "unit": "g", "category": "dairy" }
      ],
      "instructions": "2-3 sentences of cooking steps. Not a full recipe.",
      "youtube_query": "palak paneer authentic recipe restaurant style",
      "storage": "Refrigerate in airtight container 3-4 days, or freeze flat in zip bags up to 2 months.",
      "reheat": "Thaw overnight in fridge, then warm on stovetop with a splash of water 5-7 min. Garnish with fresh cilantro."
    }
    // ${mealCount} entries total, day fields in order: ${dayList}
  ]
}`;
}

function labelOf(options: { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

// ─── Swap (replace one day's meal) ─────────────────────────────────────────

export function buildSwapPrompt(args: {
  config: MealPlannerConfig;
  recentHistory: MealPlan[];
  weekStart: string;
  weekEnd: string;
  currentPlan: MealPlan;
  dayToSwap: string;
  override?: WeekOverride;
}): string {
  const base = buildMealPlannerPrompt({
    config: args.config,
    recentHistory: args.recentHistory,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
    override: args.override,
  });
  const otherMeals = args.currentPlan.meals
    .filter((m) => m.day !== args.dayToSwap)
    .map((m) => `  ${m.day}: ${m.name} (${m.cuisine})`)
    .join("\n");
  return `${base}

CURRENT WEEK CONTEXT
The user already has these meals planned for the same week. Don't repeat any of these names or near-duplicates:
${otherMeals}

REPLACE-ONE-DAY INSTRUCTION
Generate ONE replacement meal for ${args.dayToSwap} only. Different from the dishes above. Same constraints (diet, allergies, cuisines, health notes).

OUTPUT — return ONLY this JSON shape (no array, no fences, no prose):
{
  "meal": {
    "day": "${args.dayToSwap}",
    "name": "...",
    "cuisine": "...",
    "calories": 0,
    "macros": { "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 },
    "health_notes": "...",
    "ingredients": [ { "name": "...", "qty": "...", "unit": "..." } ],
    "instructions": "...",
    "youtube_query": "...",
    "storage": "...",
    "reheat": "..."
  }
}`;
}

// ─── Chat (free-form Q&A about the current plan) ───────────────────────────

export function buildChatSystemPrompt(args: {
  config: MealPlannerConfig;
  currentPlan: MealPlan | null;
}): string {
  const { config, currentPlan } = args;
  const dietLabels = [
    ...config.diets.map((id) => labelOf(ALL_DIETS, id)),
    config.customDiet,
  ]
    .filter(Boolean)
    .join(", ");
  const healthLabels = [
    ...config.healthConditions.map((id) => labelOf(HEALTH_OPTIONS, id)),
    config.customHealth,
  ]
    .filter(Boolean)
    .join(", ");

  const planSummary = currentPlan
    ? currentPlan.meals
        .map(
          (m) =>
            `  ${m.day}: ${m.name} (${m.cuisine}) — ${m.calories} kcal, P/C/F/Fib ${m.macros.protein_g}/${m.macros.carbs_g}/${m.macros.fat_g}/${m.macros.fiber_g}g`,
        )
        .join("\n")
    : "  (no plan yet)";

  return `You are AtomicTracker's meal-planning assistant in a chat panel. Be concise. The user is reviewing the plan below.

USER PROFILE
  Diet: ${dietLabels || "(none)"}
  Health: ${healthLabels || "(none)"}
  Allergies: ${config.allergies.join(", ") || "(none)"}
  Cuisines: ${config.cuisines.join(", ") || "(any)"}

CURRENT PLAN${currentPlan ? ` (${currentPlan.weekId})` : ""}
${planSummary}

CHAT GUIDELINES
- Answer in 1-3 short sentences unless the user asks for detail.
- If the user asks to *change* a meal, suggest exactly what to swap — but tell them to use the Swap button next to that day's card to apply it. Don't claim you've changed anything.
- If the user asks for nutrition advice, be helpful but include a brief reminder this isn't medical advice.
- Refer to the user's saved diet/health/allergies when relevant.`;
}

// ─── Regenerate (preserve locked, replace the rest) ────────────────────────

export function buildRegeneratePrompt(args: {
  config: MealPlannerConfig;
  recentHistory: MealPlan[];
  weekStart: string;
  weekEnd: string;
  currentPlan: MealPlan;
  lockedDays: string[];
  override?: WeekOverride;
}): string {
  const base = buildMealPlannerPrompt({
    config: args.config,
    recentHistory: args.recentHistory,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
    override: args.override,
  });
  const lockedMeals = args.currentPlan.meals
    .filter((m) => args.lockedDays.includes(m.day))
    .map(
      (m) =>
        `  ${m.day}: ${m.name} (${m.cuisine}) — KEEP THIS EXACTLY, copy through unchanged`,
    )
    .join("\n");
  const daysToRegenerate = args.currentPlan.meals
    .filter((m) => !args.lockedDays.includes(m.day))
    .map((m) => m.day)
    .join(", ");

  return `${base}

REGENERATE-WITH-LOCKS INSTRUCTION
The user has locked these meals — copy them THROUGH UNCHANGED in your output (same name, same fields):
${lockedMeals || "  (none)"}

Generate fresh replacements for these days: ${daysToRegenerate || "(none)"}.
Don't reuse the names of the locked meals or the previous unlocked meals.

Return all 7 meals in the standard schema (with locked meals copied verbatim).`;
}

