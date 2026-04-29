import type { Habit, HabitDayLog, HabitWeekday } from "./habit-types";

export type HabitStats = {
  habitId: string;
  /** Consecutive completed expected-days ending today. */
  currentStreak: number;
  /** Best historical streak. */
  longestStreak: number;
  /** Percentage (0-100) of expected days met in last 7 days. */
  weeklyCompletion: number;
};

const WEEKDAY_LABELS: HabitWeekday[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function dateFromIso(iso: string): Date {
  // Parse YYYY-MM-DD as a UTC date so streak math doesn't slide across DST.
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function weekdayOf(d: Date): HabitWeekday {
  return WEEKDAY_LABELS[d.getUTCDay()] ?? "Mon";
}

/**
 * Should this habit be expected on the given date, based on cadence?
 *
 * - daily    → every day
 * - weekdays → Mon-Fri only
 * - weekly   → only the configured weeklyDay (default Sun)
 * - custom   → only the listed customDays
 */
export function isExpectedOn(habit: Habit, date: Date): boolean {
  const wd = weekdayOf(date);
  switch (habit.cadence) {
    case "daily":
      return true;
    case "weekdays":
      return wd !== "Sat" && wd !== "Sun";
    case "weekly":
      return wd === (habit.weeklyDay ?? "Sun");
    case "custom":
      return (habit.customDays ?? []).includes(wd);
    default:
      return true;
  }
}

/** Build a map { date → done-set } for fast lookup. */
function indexLogs(history: HabitDayLog[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const log of history) {
    map.set(log.date, new Set(log.done));
  }
  return map;
}

/**
 * Compute streak + 7-day completion for a single habit.
 * `today` defaults to the current UTC date — pass an override in tests.
 */
export function computeHabitStats(
  habit: Habit,
  history: HabitDayLog[],
  today: Date = new Date(),
): HabitStats {
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const idx = indexLogs(history);

  // Current streak — walk back day-by-day from today. Skip days the habit
  // isn't expected (they don't break the streak). Stop at the first expected
  // day where the habit was NOT done.
  let currentStreak = 0;
  {
    const cursor = new Date(todayUtc);
    // Look back at most 366 days as a safety bound.
    for (let i = 0; i < 366; i++) {
      if (isExpectedOn(habit, cursor)) {
        const log = idx.get(isoDate(cursor));
        if (log && log.has(habit.id)) {
          currentStreak += 1;
        } else {
          break;
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  // Longest streak — scan all logged dates plus iterate backward across history.
  // We gather all dates touched by logs, sort ascending, then sweep, treating
  // unexpected days as "skip" (continue streak), expected+done as "+1", and
  // expected+missed as "reset".
  let longestStreak = 0;
  if (history.length > 0) {
    const sorted = [...history].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    const firstDate = dateFromIso(sorted[0]!.date);
    const lastDate = todayUtc;
    let run = 0;
    const cursor = new Date(firstDate);
    while (cursor.getTime() <= lastDate.getTime()) {
      if (isExpectedOn(habit, cursor)) {
        const log = idx.get(isoDate(cursor));
        if (log && log.has(habit.id)) {
          run += 1;
          if (run > longestStreak) longestStreak = run;
        } else {
          run = 0;
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  if (currentStreak > longestStreak) longestStreak = currentStreak;

  // Weekly completion — last 7 days.
  let expected = 0;
  let done = 0;
  {
    const cursor = new Date(todayUtc);
    for (let i = 0; i < 7; i++) {
      if (isExpectedOn(habit, cursor)) {
        expected += 1;
        const log = idx.get(isoDate(cursor));
        if (log && log.has(habit.id)) done += 1;
      }
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }
  const weeklyCompletion = expected === 0 ? 0 : Math.round((done / expected) * 100);

  return {
    habitId: habit.id,
    currentStreak,
    longestStreak,
    weeklyCompletion,
  };
}

/** Average weekly completion across all habits, weighted equally. */
export function computeOverallWeeklyCompletion(
  habits: Habit[],
  history: HabitDayLog[],
  today: Date = new Date(),
): number {
  if (habits.length === 0) return 0;
  const sum = habits.reduce(
    (acc, h) => acc + computeHabitStats(h, history, today).weeklyCompletion,
    0,
  );
  return Math.round(sum / habits.length);
}

/** Best current streak across all habits. */
export function maxCurrentStreak(
  habits: Habit[],
  history: HabitDayLog[],
  today: Date = new Date(),
): number {
  if (habits.length === 0) return 0;
  return habits.reduce(
    (acc, h) => Math.max(acc, computeHabitStats(h, history, today).currentStreak),
    0,
  );
}
