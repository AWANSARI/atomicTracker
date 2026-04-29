import "server-only";

import {
  ALL_DIETS,
  COMMON_ALLERGIES,
  COOKING_FREQUENCIES,
  CUISINES,
  HEALTH_OPTIONS,
  SYMPTOM_OPTIONS,
} from "./meal-planner-defaults";
import type { MealPlannerConfig } from "./meal-planner-types";
import type { MealPlan } from "./meal-planner-plan";
import {
  canComputeTargets,
  computeBmi,
  computeDailyTargets,
  goalLabel,
} from "./nutrition";
import type { AnalyticsDayLog, CycleMarker } from "./analytics-types";

/**
 * Lightweight summary of the user's recent adherence and self-reported state.
 * Computed by the API route from history files and fed into the AI prompt
 * so the next plan can adjust to what the user actually does. All fields are
 * optional — when absent the prompt just doesn't reference them.
 */
export type AdherenceSummary = {
  /** How many of the last 7 plan-days had ≥1 logged "done" action (any tracker). */
  daysActiveLast7?: number;
  /** Average self-reported energy (1-5) over last 7 days, if any. */
  avgEnergyLast7?: number;
  /** Average self-reported sleep hours over last 7 days, if any. */
  avgSleepHoursLast7?: number;
  /** Habits the user has missed for ≥3 of the last 7 days. */
  recentlySkippedHabits?: string[];
  /** Supplement IDs the user has missed for ≥3 of the last 7 days. */
  recentlyMissedSupplements?: string[];
  /** Most recent cycle marker logged (drives cycle-based nutrition phrasing). */
  latestCycleMarker?: CycleMarker;
  /** Date of latestCycleMarker, ISO. */
  latestCycleMarkerDate?: string;
};

/**
 * Build an AdherenceSummary from raw log arrays. Defensive — empty inputs
 * yield an empty summary (no fields set). Pure; safe to call from server
 * routes before building the prompt.
 */
export function buildAdherenceSummary(input: {
  analytics: AnalyticsDayLog[];
  habitLogs: { date: string; done: string[] }[];
  habitNames: Record<string, string>;
  supplementLogs: { date: string; taken: Record<string, string> }[];
  supplementNames: Record<string, string>;
}): AdherenceSummary {
  const out: AdherenceSummary = {};
  // 7-day cutoff (UTC).
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const last7Iso = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    last7Iso.add(d.toISOString().slice(0, 10));
  }

  // Active-day count.
  const activeDays = new Set<string>();
  for (const h of input.habitLogs) {
    if (last7Iso.has(h.date) && h.done.length > 0) activeDays.add(h.date);
  }
  for (const s of input.supplementLogs) {
    if (last7Iso.has(s.date) && Object.keys(s.taken).length > 0) {
      activeDays.add(s.date);
    }
  }
  if (activeDays.size > 0) out.daysActiveLast7 = activeDays.size;

  // Energy + sleep averages.
  const recentAnalytics = input.analytics.filter((a) => last7Iso.has(a.date));
  const energyScores: number[] = [];
  for (const a of recentAnalytics) {
    if (typeof a.energy === "number") energyScores.push(a.energy);
  }
  if (energyScores.length >= 3) {
    out.avgEnergyLast7 =
      Math.round((energyScores.reduce((s, n) => s + n, 0) / energyScores.length) * 10) / 10;
  }
  const sleepHours: number[] = [];
  for (const a of recentAnalytics) {
    if (typeof a.sleepHours === "number") sleepHours.push(a.sleepHours);
  }
  if (sleepHours.length >= 3) {
    out.avgSleepHoursLast7 =
      Math.round((sleepHours.reduce((s, n) => s + n, 0) / sleepHours.length) * 10) / 10;
  }

  // Habit/supplement misses — naive: count days a habit/supp was NOT in the
  // done set. Caller should pass habitNames / supplementNames so we can
  // resolve IDs into human-readable strings for the prompt.
  const habitMissCounts: Record<string, number> = {};
  for (const id of Object.keys(input.habitNames)) habitMissCounts[id] = 0;
  for (const day of last7Iso) {
    const log = input.habitLogs.find((h) => h.date === day);
    const done = new Set(log?.done ?? []);
    for (const id of Object.keys(input.habitNames)) {
      if (!done.has(id)) habitMissCounts[id] = (habitMissCounts[id] ?? 0) + 1;
    }
  }
  const missedHabits: string[] = [];
  for (const [id, n] of Object.entries(habitMissCounts)) {
    if ((n ?? 0) >= 3) {
      const name = input.habitNames[id];
      if (name) missedHabits.push(name);
    }
  }
  if (missedHabits.length > 0) out.recentlySkippedHabits = missedHabits;

  const suppMissCounts: Record<string, number> = {};
  for (const id of Object.keys(input.supplementNames)) suppMissCounts[id] = 0;
  for (const day of last7Iso) {
    const log = input.supplementLogs.find((s) => s.date === day);
    const taken = new Set(Object.keys(log?.taken ?? {}));
    for (const id of Object.keys(input.supplementNames)) {
      if (!taken.has(id)) suppMissCounts[id] = (suppMissCounts[id] ?? 0) + 1;
    }
  }
  const missedSupps: string[] = [];
  for (const [id, n] of Object.entries(suppMissCounts)) {
    if ((n ?? 0) >= 3) {
      const name = input.supplementNames[id];
      if (name) missedSupps.push(name);
    }
  }
  if (missedSupps.length > 0) out.recentlyMissedSupplements = missedSupps;

  // Latest cycle marker — use most-recent (by date) analytics entry that has one.
  const cyclesByDateDesc = [...input.analytics]
    .filter((a) => a.cycleMarker)
    .sort((a, b) => (a.date > b.date ? -1 : 1));
  if (cyclesByDateDesc.length > 0 && cyclesByDateDesc[0]) {
    out.latestCycleMarker = cyclesByDateDesc[0].cycleMarker;
    out.latestCycleMarkerDate = cyclesByDateDesc[0].date;
  }

  return out;
}

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
  /** Optional adherence + self-report summary; biases the AI toward what
   * the user actually does. */
  adherence?: AdherenceSummary;
}): string {
  const baseConfig = args.config;
  const config = applyWeekOverride(baseConfig, args.override);
  const { recentHistory, weekStart, weekEnd, override, adherence } = args;

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
  const dayList = daysToPlan.join(", ");

  // Slots to plan: always B/L/D; snacks optional via config.snacksEnabled.
  const slotsToPlan: ("breakfast" | "lunch" | "dinner" | "snack")[] = config.snacksEnabled
    ? ["breakfast", "lunch", "dinner", "snack"]
    : ["breakfast", "lunch", "dinner"];
  const mealCount = daysToPlan.length * slotsToPlan.length;
  const slotList = slotsToPlan.join(", ");

  // Symptom labels — drive meal selection bias when set.
  const symptomLabels = (baseConfig.symptoms ?? [])
    .map((id) => SYMPTOM_OPTIONS.find((s) => s.id === id)?.label ?? id)
    .filter(Boolean);
  const symptomBlock = symptomLabels.length
    ? `\n  Symptoms to address: ${symptomLabels.join(", ")} — bias meals toward foods that support these (e.g. iron-rich for fatigue/hair-loss, anti-inflammatory for joint pain, fiber + probiotics for digestive issues, magnesium-rich for sleep).`
    : "";

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

  // Adherence: bias the AI toward what the user actually does. Emit only
  // when at least one signal is present; an empty summary stays silent.
  const adherenceLines: string[] = [];
  if (typeof adherence?.daysActiveLast7 === "number") {
    adherenceLines.push(
      `  Active days last 7: ${adherence.daysActiveLast7}/7 — ${adherence.daysActiveLast7 < 4 ? "low engagement; favor faster, simpler dishes that are realistic to actually finish" : "good engagement; can include occasional more involved batch-cook dishes"}`,
    );
  }
  if (typeof adherence?.avgEnergyLast7 === "number") {
    adherenceLines.push(
      `  Avg energy last 7: ${adherence.avgEnergyLast7}/5 — ${adherence.avgEnergyLast7 < 3 ? "lean into iron-rich foods (leafy greens, dates, dal) and B-vitamin sources" : "stable, no special bias needed"}`,
    );
  }
  if (typeof adherence?.avgSleepHoursLast7 === "number" && adherence.avgSleepHoursLast7 < 6.5) {
    adherenceLines.push(
      `  Avg sleep last 7: ${adherence.avgSleepHoursLast7}h — limit caffeine/spicy/heavy late meals; prefer magnesium-rich evening foods (pumpkin seeds, almonds, banana)`,
    );
  }
  if (adherence?.recentlySkippedHabits?.length) {
    adherenceLines.push(
      `  Habits frequently skipped: ${adherence.recentlySkippedHabits.join(", ")} — work the underlying foods directly into meals when possible (e.g. if "soaked nuts" is skipped, include nuts in breakfast)`,
    );
  }
  if (adherence?.recentlyMissedSupplements?.length) {
    adherenceLines.push(
      `  Supplements frequently missed: ${adherence.recentlyMissedSupplements.join(", ")} — emphasize food sources for the same nutrients (iron → spinach/dal/dates; B12 → eggs/dairy; magnesium → seeds/leafy greens)`,
    );
  }
  const adherenceBlock = adherenceLines.length
    ? `\n\nRECENT ADHERENCE & SELF-REPORT (use to bias choices; never call out by name in health_notes)\n${adherenceLines.join("\n")}`
    : "";

  // Cycle-based nutrition. Only meaningful if the user has cycle tracking
  // enabled (their latest log has a cycleMarker). Each phase has known
  // nutritional emphases — we feed those into the prompt.
  const cycleBlock = adherence?.latestCycleMarker
    ? `\n\nCYCLE PHASE (current — based on user's latest log ${adherence.latestCycleMarkerDate ?? ""})\n  Phase: ${adherence.latestCycleMarker}\n${cyclePhaseGuidance(adherence.latestCycleMarker)}`
    : "";

  return `You are a thoughtful meal-planning assistant. Generate a full daily-meal plan for the week of ${weekStart} through ${weekEnd}: exactly ${mealCount} entries — one per (day, slot) combination across these days [${dayList}] and these slots [${slotList}]. Snacks are ${config.snacksEnabled ? "INCLUDED" : "NOT INCLUDED"} this week.

${config.cheatDay ? `IMPORTANT: ${config.cheatDay} is the user's cheat day — do NOT generate ANY meals for ${config.cheatDay} (no breakfast, no lunch, no dinner, no snack). The output array should NOT include any entry with day = "${config.cheatDay}".\n` : ""}USER PROFILE
  Diet preferences: ${dietLabels.join(", ") || "(none)"}
  Health conditions: ${healthLabels.join(", ") || "(none)"} — adjust sodium, glycemic load, fiber, iodine, etc. as appropriate${symptomBlock}
  Allergies (avoid completely): ${allergyLabels.join(", ") || "(none)"}
  Preferred cuisines: ${cuisineLabels.join(", ") || "(any)"}
  Pantry — primary ingredients to use: ${ingredients.length ? ingredients.join(", ") : "(no specific pantry — use common ingredients)"}
  Max repeats per dish in this week: ${config.repeatsPerWeek}
  Cooking pattern: ${cookingNote || "Not specified"} — generate dishes that match this pace. Larger batch portions if cooking less frequently.
  Favorite meals (include if reasonable): ${config.favoriteMeals.length ? config.favoriteMeals.join(", ") : "(none yet)"}${bodyBlock}${nutritionBlock}${nutritionistBlock}${overrideBlock}${adherenceBlock}${cycleBlock}

RECENT HISTORY (avoid repeating identical dishes from the previous 4 weeks)
${historyLines}

GUIDELINES
- BREAKFAST should be light-to-moderate (≈25-30% of daily kcal), protein-forward, quick to prepare on a weekday. South-Asian users: rotate poha, oats, dalia, idli, dosa, paratha + curd, eggs + toast, smoothie bowls.
- LUNCH should be the largest meal of the day (≈35-40% of daily kcal). Often the cooking-day batch dish reheated. Include a grain + protein + vegetables.
- DINNER should be lighter (≈25-30% of daily kcal). Easier on digestion, lower-glycemic carbs. Include a protein + vegetables.
- SNACKS (when enabled, ≈10-15% of daily kcal): nuts/seeds, fruit + nut butter, yogurt, sprouts chaat, roasted chana, makhana, boiled eggs, smoothies. NEVER ultra-processed packaged snacks.
- If the diet preferences include both Vegetarian and Non-vegetarian, mix both — leaning toward whatever the user's other selections suggest (e.g. if Halal is also selected, treat non-veg meats as halal).
- If health conditions include thyroid, diabetes, hypertension, or PCOS, lean toward whole grains, leafy greens, low-glycemic carbs, and adequate protein. Mention this in health_notes. For HYPOTHYROID: avoid raw cruciferous in large amounts, include selenium (brazil nuts, eggs) + iodine (sea salt, fish), avoid soy with thyroid medication timing.
- Each meal should be realistically preparable in the time available for that slot — breakfast under 15 min, lunch up to 30 min if dedicated cooking day else <10 min reheat, dinner under 30 min, snacks 0-5 min.
- Use ingredients from the user's pantry preferentially; supplement with common pantry items only when needed.
- For youtube_query, write a concrete search query that would surface a credible recipe video. Include the cuisine and dish name. Avoid generic terms.
- For each ingredient, set "category" to one of: "produce", "protein", "dairy", "grain", "pantry", "spice", "frozen", "other". This is used to group items in the user's grocery list. Examples: tomato/onion/spinach -> produce; chicken/lamb/tofu/eggs/lentils -> protein; milk/yogurt/paneer/cheese/butter -> dairy; rice/pasta/bread/oats/poha/dalia -> grain; oil/sauce/flour/sugar -> pantry; cumin/turmeric/garlic powder -> spice; frozen peas/corn -> frozen.
- For "storage": one short sentence describing how to refrigerate AND/OR freeze the cooked meal to keep it fresh — include container hint and approximate shelf life. Example: "Cool, then refrigerate in airtight container 3-4 days, or freeze flat in zip bags up to 2 months." For breakfasts/snacks that are made fresh, write "Best made fresh; not for batch-storage."
- For "reheat": one short sentence describing the best way to reheat — note microwave vs stovetop vs oven, any added liquid, target temperature, and a serving tip. Example: "Reheat from frozen: thaw overnight, then warm gently on stovetop with a splash of water 5-7 min until steaming. Top with fresh herbs." For fresh items, write "Eat fresh; no reheat needed."

OUTPUT
Return ONLY valid JSON. No markdown fences, no prose before or after. Schema:

{
  "meals": [
    {
      "day": "${daysToPlan[0] ?? "Mon"}",
      "slot": "${slotsToPlan[0] ?? "breakfast"}",
      "name": "Specific dish name",
      "cuisine": "Indian | Mediterranean | etc.",
      "calories": 450,
      "macros": { "protein_g": 22, "carbs_g": 55, "fat_g": 14, "fiber_g": 8 },
      "health_notes": "1-2 sentences explaining how this meal fits the user's health/diet/symptom profile.",
      "ingredients": [
        { "name": "paneer", "qty": "200", "unit": "g", "category": "dairy" }
      ],
      "instructions": "2-3 sentences of cooking steps. Not a full recipe.",
      "youtube_query": "palak paneer authentic recipe restaurant style",
      "storage": "Refrigerate in airtight container 3-4 days, or freeze flat in zip bags up to 2 months.",
      "reheat": "Thaw overnight in fridge, then warm on stovetop with a splash of water 5-7 min. Garnish with fresh cilantro."
    }
    // ${mealCount} entries total. Days: ${dayList}. Slots per day: ${slotList}.
    // Order: iterate days, for each day emit each slot in [${slotList}].
  ]
}`;
}

/** Phase-specific nutritional emphases for cycle-based meal planning. */
function cyclePhaseGuidance(phase: CycleMarker): string {
  if (phase === "menstrual") {
    return "  Emphasis: warming foods, iron-rich (spinach, dal, dates, red meat if applicable), hydration, magnesium for cramps (dark chocolate, pumpkin seeds). Avoid heavy salt, alcohol, excess caffeine.";
  }
  if (phase === "follicular") {
    return "  Emphasis: lighter, fresh foods supporting estrogen build-up — sprouted lentils, fermented foods (idli, dosa, kimchi), probiotics, fresh fruits, leafy greens. Higher energy phase, can include slightly more carb-forward dishes.";
  }
  if (phase === "ovulatory") {
    return "  Emphasis: anti-inflammatory foods, B-vitamins (eggs, leafy greens, whole grains), zinc (pumpkin seeds, chickpeas), antioxidant-rich produce. Lighter cooking methods.";
  }
  if (phase === "luteal") {
    return "  Emphasis: complex carbs (oats, sweet potato, millets) for serotonin stability, magnesium (almonds, dark leafy greens), B6 (banana, chickpeas), iron prep for next menstrual phase. Reduce salt + caffeine to ease bloating + mood swings.";
  }
  // spotting / unknown
  return "  Emphasis: gentle, easy-to-digest foods. Hydration. Iron-rich if spotting indicates light flow.";
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
  /** Optional: which slot to swap. Defaults to "dinner" for back-compat. */
  slotToSwap?: "breakfast" | "lunch" | "dinner" | "snack";
  override?: WeekOverride;
  adherence?: AdherenceSummary;
}): string {
  const slot = args.slotToSwap ?? "dinner";
  const base = buildMealPlannerPrompt({
    config: args.config,
    recentHistory: args.recentHistory,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
    override: args.override,
    adherence: args.adherence,
  });
  const otherMeals = args.currentPlan.meals
    .filter((m) => !(m.day === args.dayToSwap && (m.slot ?? "dinner") === slot))
    .map((m) => `  ${m.day} ${m.slot ?? "dinner"}: ${m.name} (${m.cuisine})`)
    .join("\n");
  return `${base}

CURRENT WEEK CONTEXT
The user already has these meals planned for the same week. Don't repeat any of these names or near-duplicates:
${otherMeals}

REPLACE-ONE-MEAL INSTRUCTION
Generate ONE replacement ${slot} for ${args.dayToSwap} only. Different from the dishes above. Same constraints (diet, allergies, cuisines, symptoms, health notes). Honor the slot-specific guidelines from the GUIDELINES section.

OUTPUT — return ONLY this JSON shape (no array, no fences, no prose):
{
  "meal": {
    "day": "${args.dayToSwap}",
    "slot": "${slot}",
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
  adherence?: AdherenceSummary;
}): string {
  const base = buildMealPlannerPrompt({
    config: args.config,
    recentHistory: args.recentHistory,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
    override: args.override,
    adherence: args.adherence,
  });
  // Locked meals are matched by day (legacy locks) or by `${day}/${slot}` keys
  // — when slotToSwap is unspecified we treat all of that day's meals as locked.
  const lockedKeys = new Set(args.lockedDays);
  const isLocked = (m: { day: string; slot?: string }) =>
    lockedKeys.has(m.day) || lockedKeys.has(`${m.day}/${m.slot ?? "dinner"}`);
  const lockedMeals = args.currentPlan.meals
    .filter(isLocked)
    .map(
      (m) =>
        `  ${m.day} ${m.slot ?? "dinner"}: ${m.name} (${m.cuisine}) — KEEP THIS EXACTLY, copy through unchanged`,
    )
    .join("\n");
  const slotsToRegen = args.currentPlan.meals
    .filter((m) => !isLocked(m))
    .map((m) => `${m.day}/${m.slot ?? "dinner"}`)
    .join(", ");

  return `${base}

REGENERATE-WITH-LOCKS INSTRUCTION
The user has locked these meals — copy them THROUGH UNCHANGED in your output (same name, slot, and other fields):
${lockedMeals || "  (none)"}

Generate fresh replacements for these (day, slot) entries: ${slotsToRegen || "(none)"}.
Don't reuse the names of the locked meals or the previous unlocked meals.

Return ALL meals in the standard schema (locked entries copied verbatim, replacements freshly generated). Each entry MUST include both \`day\` and \`slot\`.`;
}

