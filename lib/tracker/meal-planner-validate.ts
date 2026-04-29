import type { Day, Meal, Slot } from "./meal-planner-plan";

const VALID_DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VALID_SLOTS: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

/** Parse one meal object from unknown JSON, or null if it doesn't match. */
export function parseSingleMeal(item: unknown): Meal | null {
  if (!item || typeof item !== "object") return null;
  const m = item as Record<string, unknown>;
  if (!VALID_DAYS.includes(m.day as Day)) return null;
  if (typeof m.name !== "string") return null;
  if (typeof m.cuisine !== "string") return null;
  if (typeof m.calories !== "number") return null;
  if (!m.macros || typeof m.macros !== "object") return null;
  const macros = m.macros as Record<string, unknown>;
  if (
    typeof macros.protein_g !== "number" ||
    typeof macros.carbs_g !== "number" ||
    typeof macros.fat_g !== "number" ||
    typeof macros.fiber_g !== "number"
  )
    return null;
  if (typeof m.health_notes !== "string") return null;
  if (!Array.isArray(m.ingredients)) return null;
  const validCategories = [
    "produce",
    "protein",
    "dairy",
    "grain",
    "pantry",
    "spice",
    "frozen",
    "other",
  ] as const;
  const ingredients = m.ingredients.map((i) => {
    const ing = i as Record<string, unknown>;
    const cat = String(ing.category ?? "other") as (typeof validCategories)[number];
    return {
      name: String(ing.name ?? ""),
      qty: String(ing.qty ?? ""),
      unit: String(ing.unit ?? ""),
      category: validCategories.includes(cat) ? cat : ("other" as const),
    };
  });
  if (typeof m.instructions !== "string") return null;
  if (typeof m.youtube_query !== "string") return null;
  // Slot is optional — defaults to "dinner" for legacy (single-slot) plans.
  const slot: Slot = VALID_SLOTS.includes(m.slot as Slot)
    ? (m.slot as Slot)
    : "dinner";
  return {
    day: m.day as Day,
    slot,
    name: m.name,
    cuisine: m.cuisine,
    calories: m.calories,
    macros: {
      protein_g: macros.protein_g,
      carbs_g: macros.carbs_g,
      fat_g: macros.fat_g,
      fiber_g: macros.fiber_g,
    },
    health_notes: m.health_notes,
    ingredients,
    instructions: m.instructions,
    youtube_query: m.youtube_query,
    storage: typeof m.storage === "string" ? m.storage : undefined,
    reheat: typeof m.reheat === "string" ? m.reheat : undefined,
  };
}

/**
 * Parse `{ meals: [...] }` shape. Returns null if any meal is malformed.
 * Allows 1-28 meals (single-slot dinner-only weeks up through full
 * 4-slot × 7-day plans).
 */
export function parseMeals(json: unknown): Meal[] | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (!Array.isArray(j.meals)) return null;
  const out: Meal[] = [];
  for (const item of j.meals) {
    const m = parseSingleMeal(item);
    if (!m) return null;
    out.push(m);
  }
  if (out.length < 1 || out.length > 28) return null;
  return out;
}

/** Parse `{ meal: {...} }` shape — used by /api/swap. */
export function parseMealEnvelope(json: unknown): Meal | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  // Accept either { meal: {...} } or {...} directly
  if (j.meal) return parseSingleMeal(j.meal);
  return parseSingleMeal(j);
}
