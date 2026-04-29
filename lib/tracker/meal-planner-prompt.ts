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

/**
 * Build a meal-planner system prompt from the user's config + recent history.
 * Returns a string that asks the AI for a JSON-only response with 7 meals.
 */
export function buildMealPlannerPrompt(args: {
  config: MealPlannerConfig;
  recentHistory: MealPlan[];
  weekStart: string;
  weekEnd: string;
}): string {
  const { config, recentHistory, weekStart, weekEnd } = args;

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

  return `You are a thoughtful meal-planning assistant. Generate exactly ${mealCount} dinner meals for the week of ${weekStart} through ${weekEnd}, one per day on these days only: ${dayList}.

${config.cheatDay ? `IMPORTANT: ${config.cheatDay} is the user's cheat day — do NOT generate a meal for ${config.cheatDay}. The output array should NOT include any entry with day = "${config.cheatDay}".\n` : ""}USER PROFILE
  Diet preferences: ${dietLabels.join(", ") || "(none)"}
  Health conditions: ${healthLabels.join(", ") || "(none)"} — adjust sodium, glycemic load, fiber, iodine, etc. as appropriate
  Allergies (avoid completely): ${allergyLabels.join(", ") || "(none)"}
  Preferred cuisines: ${cuisineLabels.join(", ") || "(any)"}
  Pantry — primary ingredients to use: ${ingredients.length ? ingredients.join(", ") : "(no specific pantry — use common ingredients)"}
  Max repeats per dish in this week: ${config.repeatsPerWeek}
  Cooking pattern: ${cookingNote || "Not specified"} — generate dishes that match this pace. Larger batch portions if cooking less frequently.
  Favorite meals (include if reasonable): ${config.favoriteMeals.length ? config.favoriteMeals.join(", ") : "(none yet)"}

RECENT HISTORY (avoid repeating identical dishes from the previous 4 weeks)
${historyLines}

GUIDELINES
- If the diet preferences include both Vegetarian and Non-vegetarian, mix both — leaning toward whatever the user's other selections suggest (e.g. if Halal is also selected, treat non-veg meats as halal).
- If health conditions include thyroid, diabetes, hypertension, or PCOS, lean toward whole grains, leafy greens, low-glycemic carbs, and adequate protein. Mention this in health_notes.
- Each meal should be realistically preparable in a home kitchen in under an hour.
- Use ingredients from the user's pantry preferentially; supplement with common pantry items only when needed.
- For youtube_query, write a concrete search query that would surface a credible recipe video. Include the cuisine and dish name. Avoid generic terms.

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
        { "name": "paneer", "qty": "200", "unit": "g" }
      ],
      "instructions": "2-3 sentences of cooking steps. Not a full recipe.",
      "youtube_query": "palak paneer authentic recipe restaurant style"
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
}): string {
  const base = buildMealPlannerPrompt({
    config: args.config,
    recentHistory: args.recentHistory,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
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
    "youtube_query": "..."
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
}): string {
  const base = buildMealPlannerPrompt({
    config: args.config,
    recentHistory: args.recentHistory,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
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

