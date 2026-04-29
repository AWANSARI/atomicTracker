/**
 * Schema for /AtomicTracker/config/tracker.habits.json (config) and
 * /AtomicTracker/history/habits/{YYYY-MM-DD}.json (per-day log).
 *
 * Stored as plain JSON — preferences + daily ticks, no secrets.
 */

export type HabitWeekday =
  | "Mon"
  | "Tue"
  | "Wed"
  | "Thu"
  | "Fri"
  | "Sat"
  | "Sun";

export type HabitCadence = "daily" | "weekdays" | "weekly" | "custom";

export type Habit = {
  id: string;
  name: string;
  cadence: HabitCadence;
  /** For "weekly": which day of week to count toward. */
  weeklyDay?: HabitWeekday;
  /** For "custom": specific weekdays (e.g. Mon/Wed/Fri). */
  customDays?: HabitWeekday[];
  tags?: string[];
  reminderEventIds?: string[];
  /** Catalog ID this habit was created from, if any. */
  catalogId?: string;
};

export type HabitConfig = {
  v: 1;
  habits: Habit[];
  /** Whether to auto-create daily Calendar reminder events. Default false. */
  remindersEnabled: boolean;
  /** HH:MM time used by the reminder route for daily-cadence habits. */
  reminderTime?: string;
  /** HH:MM time used by the reminder route for weekly check-ins. */
  weeklyReminderTime?: string;
  createdAt: string;
  updatedAt: string;
};

export type HabitDayLog = {
  v: 1;
  date: string; // "YYYY-MM-DD"
  /** Habit IDs the user marked done today. */
  done: string[];
  loggedAt: string;
};

export function emptyHabitConfig(): HabitConfig {
  const now = new Date().toISOString();
  return {
    v: 1,
    habits: [],
    remindersEnabled: false,
    reminderTime: "09:00",
    weeklyReminderTime: "19:00",
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyHabitDayLog(date: string): HabitDayLog {
  return {
    v: 1,
    date,
    done: [],
    loggedAt: new Date().toISOString(),
  };
}

/** Generate a stable ID for a custom habit. Not crypto-strength; we just need
 *  uniqueness within a small list. */
export function newHabitId(): string {
  return `h_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export const HABIT_WEEKDAYS: HabitWeekday[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];
