/**
 * Day-timeline fuser.
 *
 * Combines meals (from accepted weekly plan), supplements (computed schedule),
 * and habits (today's checklist) into a single chronologically-sorted list of
 * entries the Daily Timeline view renders. Pure — no Drive or AI calls.
 *
 * Lives in lib/tracker (not server-only) because the merge is also useful in
 * client-rendered print/PDF views.
 */

import type { Day, Meal, MealPlan, Slot } from "./meal-planner-plan";
import type { Habit } from "./habit-types";
import type { TimelineSlot as SupplementSlot } from "./supplement-rules";

export type TimelineKind = "meal" | "supplement" | "habit" | "cycle";

export type TimelineEntry = {
  /** Stable key for React. */
  key: string;
  /** "HH:MM" — render order. */
  time: string;
  kind: TimelineKind;
  title: string;
  /** Subtitle — shown below the title. */
  subtitle?: string;
  /** Severity / status — drives the chip color in the UI. */
  tone?: "default" | "warn";
  /** Free-form metadata for the detail sheet. */
  meta?: Record<string, string>;
  /** Source IDs for cross-linking back to the originating tracker. */
  sourceId?: string;
  /** True when this entry has unresolved warnings (e.g. supplement conflict). */
  hasWarning?: boolean;
};

// ─── Meal slot → time, using the user's mealtimes. ─────────────────────────

export type Mealtimes = {
  breakfast: string;
  lunch: string;
  dinner: string;
};

const SNACK_TIME = "16:30";

function timeForMealSlot(slot: Slot, mt: Mealtimes): string {
  if (slot === "breakfast") return mt.breakfast;
  if (slot === "lunch") return mt.lunch;
  if (slot === "dinner") return mt.dinner;
  return SNACK_TIME;
}

// ─── Habit "time" — habits don't have a time, so we slot them anchored to ─
// time-of-day buckets driven by cadence + heuristic.

function timeForHabit(_habit: Habit, mt: Mealtimes): string {
  // Most lifestyle habits anchor around morning routine — keep it simple and
  // attach all habits to a single anchor. The UI can group them visually.
  // We use one bucket just before breakfast so they sit at the very top of
  // the day; the user can override times once habit-specific time fields exist.
  return shiftHHMM(mt.breakfast, -30);
}

function shiftHHMM(hhmm: string, deltaMin: number): string {
  const parts = hhmm.split(":");
  const h = parts[0] ? parseInt(parts[0], 10) : 0;
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  const total =
    (Number.isFinite(h) ? h : 0) * 60 +
    (Number.isFinite(m) ? m : 0) +
    deltaMin;
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// ─── Habit cadence filter ──────────────────────────────────────────────────

const DAY_NAMES: Day[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** True if the habit is expected on the given calendar date. */
export function habitExpectedOn(habit: Habit, date: Date): boolean {
  if (habit.cadence === "daily") return true;
  const dayName = DAY_NAMES[date.getUTCDay()] as Day;
  if (habit.cadence === "weekdays") {
    return dayName !== "Sat" && dayName !== "Sun";
  }
  if (habit.cadence === "weekly") {
    return habit.weeklyDay === dayName;
  }
  if (habit.cadence === "custom") {
    return Array.isArray(habit.customDays) && habit.customDays.includes(dayName);
  }
  return false;
}

// ─── Plan day filter ───────────────────────────────────────────────────────

/** Pull the meals for a specific calendar date out of an accepted weekly plan. */
export function mealsForDate(plan: MealPlan | null, date: Date): Meal[] {
  if (!plan) return [];
  const weekStart = new Date(plan.weekStart + "T00:00:00Z");
  const dayDiff = Math.round(
    (date.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (dayDiff < 0 || dayDiff > 6) return [];
  const dayName = DAY_NAMES[(weekStart.getUTCDay() + dayDiff) % 7] as Day;
  return plan.meals.filter((m) => m.day === dayName);
}

// ─── Main fuser ────────────────────────────────────────────────────────────

const SLOT_LABEL: Record<Slot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export function fuseTimeline(args: {
  date: Date;
  meals: Meal[];
  mealtimes: Mealtimes;
  supplementSchedule: SupplementSlot[];
  habits: Habit[];
  /** Habits already marked done today — used to dim those entries. */
  habitsDone: string[];
}): TimelineEntry[] {
  const { date, meals, mealtimes, supplementSchedule, habits, habitsDone } = args;
  const entries: TimelineEntry[] = [];

  for (const m of meals) {
    const slot = m.slot ?? "dinner";
    entries.push({
      key: `meal/${m.day}/${slot}`,
      time: timeForMealSlot(slot, mealtimes),
      kind: "meal",
      title: m.name,
      subtitle: `${SLOT_LABEL[slot]} · ${m.cuisine} · ${m.calories} kcal`,
      meta: {
        protein: `${m.macros.protein_g}g`,
        carbs: `${m.macros.carbs_g}g`,
        fat: `${m.macros.fat_g}g`,
        fiber: `${m.macros.fiber_g}g`,
      },
      sourceId: `${m.day}/${slot}`,
    });
  }

  for (const s of supplementSchedule) {
    entries.push({
      key: `supp/${s.supplementId}/${s.time}`,
      time: s.time,
      kind: "supplement",
      title: s.supplementName,
      subtitle: hintLabel(s.hint),
      tone: s.warnings.length > 0 ? "warn" : "default",
      hasWarning: s.warnings.length > 0,
      meta: s.warnings.length
        ? { warnings: s.warnings.join("; ") }
        : undefined,
      sourceId: s.supplementId,
    });
  }

  for (const h of habits) {
    if (!habitExpectedOn(h, date)) continue;
    const done = habitsDone.includes(h.id);
    entries.push({
      key: `habit/${h.id}`,
      time: timeForHabit(h, mealtimes),
      kind: "habit",
      title: h.name,
      subtitle: done ? "Done today" : "Pending",
      tone: "default",
      meta: { cadence: h.cadence, done: done ? "yes" : "no" },
      sourceId: h.id,
    });
  }

  entries.sort((a, b) => {
    if (a.time < b.time) return -1;
    if (a.time > b.time) return 1;
    // Stable order within the same minute: meals first, then supplements,
    // then habits.
    const order = { meal: 0, supplement: 1, habit: 2, cycle: 3 } as const;
    return order[a.kind] - order[b.kind];
  });

  return entries;
}

function hintLabel(hint: string): string {
  return {
    "empty-stomach": "Empty stomach",
    "before-food": "Before food",
    "with-food": "With food",
    "after-food": "After food",
    "with-fat": "With fat",
    morning: "Morning",
    bedtime: "Bedtime",
    "any-time": "Any time",
  }[hint] ?? hint;
}

// ─── Date helpers ──────────────────────────────────────────────────────────

/** Convert "YYYY-MM-DD" to a UTC Date at midnight. */
export function dateFromIso(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

export function isoFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today in UTC. */
export function todayIso(): string {
  return isoFromDate(new Date());
}
