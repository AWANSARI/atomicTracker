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

export type Ingredient = {
  name: string;
  qty: string;
  unit: string;
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
  recipe_url?: string;
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
  /** IDs of Calendar events created at the last accept. Used to delete on re-accept. */
  calendarEventIds?: string[];
  acceptedAt?: string;
};

// ─── ISO week helpers ──────────────────────────────────────────────────────

/** Monday at UTC midnight of the week starting strictly AFTER today. */
export function nextWeekStart(now: Date = new Date()): Date {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  // Days until next Monday (1..7). If today is Mon, we want next Mon (7).
  const daysUntilMonday = ((1 - day + 7) % 7) || 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
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
