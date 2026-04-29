/**
 * Plan-related types and ISO week helpers.
 * Plans are stored in /AtomicTracker/history/meals/{weekId}.json (accepted)
 * or {weekId}.draft.json (generated but not accepted yet).
 */

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type Macros = {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export type IngredientCategory =
  | "produce"
  | "protein"
  | "dairy"
  | "grain"
  | "pantry"
  | "spice"
  | "frozen"
  | "other";

export type Ingredient = {
  name: string;
  qty: string;
  unit: string;
  /** Aisle/category for grocery list grouping. Set by AI during generation. */
  category?: IngredientCategory;
};

export type RecipeVideo = {
  id: string;
  title: string;
  channel: string;
  url: string;
};

export type Meal = {
  day: Day;
  name: string;
  cuisine: string;
  calories: number;
  macros: Macros;
  health_notes: string;
  ingredients: Ingredient[];
  instructions: string;
  youtube_query: string;
  /** YouTube fallback search URL (always present). */
  recipe_url?: string;
  /** Specific top-result video, populated when a YouTube key is configured. */
  recipe_video?: RecipeVideo;
  /** Up to 4 alternative recipe videos for the same dish (when key configured). */
  recipe_alternatives?: RecipeVideo[];
  /** How to freeze/refrigerate the meal once cooked. AI-generated. */
  storage?: string;
  /** How to reheat and serve. AI-generated. */
  reheat?: string;
  /** Optional client-side state (carried in JSON for resilience). */
  locked?: boolean;
};

export type MealPlan = {
  v: 1;
  weekId: string;          // "2026-W19"
  weekStart: string;       // ISO date "2026-05-04"
  weekEnd: string;         // ISO date "2026-05-10"
  generatedAt: string;
  generatedBy: {
    provider: "anthropic" | "openai" | "gemini";
    model: string;
  };
  status: "draft" | "accepted";
  meals: Meal[];
  /** IDs of admin events (Friday/Sunday/Saturday) created at the last accept. */
  calendarEventIds?: string[];
  /** Per-day dinner event IDs from accept. Used for per-day re-accept. */
  eventIdByDay?: Partial<Record<Day, string>>;
  acceptedAt?: string;
  /** Per-day timestamp of last meal modification (after accept). */
  modifiedByDay?: Partial<Record<Day, string>>;
};

// ─── ISO week helpers ──────────────────────────────────────────────────────

/** Monday at UTC midnight of the week containing `now`. */
export function currentWeekStart(now: Date = new Date()): Date {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  // ISO weeks start on Monday. If today is Sun, current week's Mon was 6 days ago.
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/** Monday at UTC midnight of the week starting strictly AFTER today. */
export function nextWeekStart(now: Date = new Date()): Date {
  const monday = currentWeekStart(now);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday;
}

/** Parse a "YYYY-Wnn" weekId back into the Monday date for that week. */
export function weekStartFromId(weekId: string): Date | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!m) return null;
  const year = parseInt(m[1]!, 10);
  const week = parseInt(m[2]!, 10);
  // ISO 8601: week 1 is the one containing Jan 4.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
}

/** Sunday end of the same week. */
export function weekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

/** ISO 8601 week date — "YYYY-Www" (e.g. "2026-W19"). */
export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // ISO: Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thu of this week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const weekNum = Math.ceil((((d.getTime() - yearStart) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Build a YouTube search URL for a query string. */
export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
