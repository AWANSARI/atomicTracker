/**
 * Hand-coded insight rules over the last 4 weeks of analytics + adherence
 * data. Pure functions — no Drive, no AI, deterministic.
 *
 * Each rule:
 *  - returns null when input data is insufficient (≥3 days for trend rules);
 *  - cites the dates / week ids it computed from;
 *  - errs on the side of conservative phrasing (correlation, not causation).
 */

import type { AnalyticsDayLog } from "./analytics-types";
import type { Habit, HabitDayLog } from "./habit-types";
import { isExpectedOn } from "./habit-stats";
import type { MealPlan, Day } from "./meal-planner-plan";
import type { MealPlannerConfig } from "./meal-planner-types";
import type { Supplement } from "./supplement-types";
import { canComputeTargets, computeDailyTargets } from "./nutrition";

export type InsightSeverity = "info" | "warn" | "success";

export type InsightCard = {
  /** Stable id for keying / dedup. */
  id: string;
  severity: InsightSeverity;
  title: string;
  /** 1-2 sentence body. Plain text; rendered as paragraph. */
  body: string;
  /** Window the rule looked at, e.g. "last 7 days" / "2025-W18 vs W17". */
  dataWindow: string;
  /** Specific dates / weekIds the conclusion was drawn from. */
  citations?: string[];
  suggestedAction?: { label: string; href?: string };
};

export type SupplementLogEntry = {
  date: string;
  taken: Record<string, string>;
};

export type InsightInputs = {
  /** Last ~28 days. May be sparse — we filter by presence of fields. */
  analytics: AnalyticsDayLog[];
  supplementLogs: SupplementLogEntry[];
  habitLogs: HabitDayLog[];
  /** Last ~4 accepted plans. */
  recentPlans: MealPlan[];
  config: MealPlannerConfig;
  habits?: Habit[];
  supplements?: Supplement[];
};

// ─── Date helpers ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Build the trailing N-day inclusive date list, oldest → newest. */
function lastNDates(n: number): string[] {
  const today = todayUtc();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    out.push(isoDate(d));
  }
  return out;
}

const DAY_FROM_INT: Record<number, Day> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function dayFromIso(iso: string): Day {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return DAY_FROM_INT[date.getUTCDay()] ?? "Mon";
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ─── Rule implementations ──────────────────────────────────────────────────

/**
 * Protein under target on N days this week. Walks the most recent 7 days,
 * looks up each day's total protein in the latest accepted plan covering
 * that day, and counts how many days fall below 85% of the personalized
 * daily protein target from `computeDailyTargets`.
 */
function proteinDeficit(input: InsightInputs): InsightCard | null {
  if (!canComputeTargets(input.config)) return null;
  const targets = computeDailyTargets({
    heightCm: input.config.heightCm!,
    weightKg: input.config.weightKg!,
    age: input.config.age!,
    sex: input.config.sex!,
    activityLevel: input.config.activityLevel!,
    goal: input.config.goal!,
  });
  const proteinTarget = targets.protein_g;
  const threshold = proteinTarget * 0.85;

  const dates = lastNDates(7);
  const lowDays: string[] = [];
  let countedDays = 0;
  for (const iso of dates) {
    const day = dayFromIso(iso);
    // Find the most recent plan that includes this day. We iterate in reverse
    // so newer plans win when multiple cover the same date.
    let dayProtein: number | null = null;
    for (const plan of [...input.recentPlans].reverse()) {
      if (iso < plan.weekStart || iso > plan.weekEnd) continue;
      const total = plan.meals
        .filter((m) => m.day === day)
        .reduce((sum, m) => sum + (m.macros?.protein_g ?? 0), 0);
      if (total > 0) {
        dayProtein = total;
        break;
      }
    }
    if (dayProtein == null) continue;
    countedDays++;
    if (dayProtein < threshold) lowDays.push(iso);
  }

  if (countedDays < 3) return null;
  if (lowDays.length < 3) return null;

  return {
    id: "low-protein-week",
    severity: "warn",
    title: `Protein under target on ${lowDays.length} of last ${countedDays} days`,
    body: `Daily protein target is ${proteinTarget} g — ${lowDays.length} days were below 85% of that. Consider a higher-protein swap or an extra protein snack on those days.`,
    dataWindow: `last ${countedDays} days with planned meals`,
    citations: lowDays,
    suggestedAction: { label: "Open this week's plan", href: "/trackers/meal-planner" },
  };
}

/**
 * Iron-tea conflict placeholder: if the user has an iron supplement
 * configured AND their water-habit completion the last 7 days is below 50%,
 * surface a tip about iron absorption (placeholder for proper caffeine
 * logging). We disclaim it as a tip, not a measured violation.
 */
function ironAbsorptionTip(input: InsightInputs): InsightCard | null {
  const supps = input.supplements ?? [];
  const ironSupp = supps.find((s) =>
    (s.rule.selfTags ?? []).includes("iron"),
  );
  if (!ironSupp) return null;

  const habits = input.habits ?? [];
  // Find a "water" habit by name (loose match — habit catalog uses "8 glasses water").
  const waterHabit = habits.find((h) =>
    /water/i.test(h.name) || (h.tags ?? []).some((t) => /hydrat|water/i.test(t)),
  );
  if (!waterHabit) return null;

  // Last 7 days of habit logs — fraction with the water habit ticked.
  const dates = lastNDates(7);
  const map = new Map<string, Set<string>>();
  for (const log of input.habitLogs) map.set(log.date, new Set(log.done));
  let expected = 0;
  let done = 0;
  const missDates: string[] = [];
  for (const iso of dates) {
    const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
    const dateObj = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
    if (!isExpectedOn(waterHabit, dateObj)) continue;
    expected++;
    if (map.get(iso)?.has(waterHabit.id)) done++;
    else missDates.push(iso);
  }
  if (expected < 3) return null;
  const pct = (done / expected) * 100;
  if (pct >= 50) return null;

  return {
    id: "iron-absorption-tip",
    severity: "info",
    title: "Iron absorption: keep tea & coffee away from your iron dose",
    body: "Iron is best taken on an empty stomach, away from tea, coffee, calcium and dairy by 2 hours. Hydration is also low this week — pairing iron with citrus + water improves uptake.",
    dataWindow: "last 7 days",
    citations: missDates,
    suggestedAction: {
      label: "Open supplement schedule",
      href: "/trackers/supplements",
    },
  };
}

/**
 * Energy ↑ trend: avg(energy) last 7 days vs previous 7 days, ≥0.5 point
 * improvement. Needs at least 3 logs in each window.
 */
function energyTrend(input: InsightInputs): InsightCard | null {
  const dates = lastNDates(14);
  const recent: { date: string; v: number }[] = [];
  const prior: { date: string; v: number }[] = [];
  const byDate = new Map<string, AnalyticsDayLog>();
  for (const log of input.analytics) byDate.set(log.date, log);
  for (let i = 0; i < dates.length; i++) {
    const iso = dates[i]!;
    const log = byDate.get(iso);
    if (!log || log.energy == null) continue;
    if (i < 7) prior.push({ date: iso, v: log.energy });
    else recent.push({ date: iso, v: log.energy });
  }
  if (recent.length < 3 || prior.length < 3) return null;
  const recentAvg = avg(recent.map((r) => r.v));
  const priorAvg = avg(prior.map((r) => r.v));
  const delta = recentAvg - priorAvg;
  if (delta < 0.5) return null;

  return {
    id: "energy-up-trend",
    severity: "success",
    title: `Energy averages up ${delta.toFixed(1)} points this week`,
    body: `Self-reported energy averaged ${recentAvg.toFixed(1)}/5 over the last 7 days vs ${priorAvg.toFixed(1)} the week before. Whatever you changed — meal consistency, sleep, supplements — keep it. Correlation, not causation.`,
    dataWindow: "last 7 days vs previous 7 days",
    citations: [...recent.map((r) => r.date), ...prior.map((r) => r.date)],
  };
}

/** Sleep deficit: avg sleepHours last 7 days < 6.5. */
function sleepDeficit(input: InsightInputs): InsightCard | null {
  const dates = new Set(lastNDates(7));
  const samples = input.analytics
    .filter((l) => dates.has(l.date) && typeof l.sleepHours === "number")
    .map((l) => ({ date: l.date, v: l.sleepHours as number }));
  if (samples.length < 3) return null;
  const a = avg(samples.map((s) => s.v));
  if (a >= 6.5) return null;
  return {
    id: "sleep-deficit",
    severity: "warn",
    title: `Sleep averaging ${a.toFixed(1)} h — below the 6.5 h floor`,
    body: "Short sleep blunts hormone balance, training recovery, and willpower for routine. A 30-minute earlier wind-down compounds quickly.",
    dataWindow: "last 7 days",
    citations: samples.map((s) => s.date),
  };
}

/**
 * Habit consistency improvement: this week's overall completion vs last
 * week's, ≥20-point swing. Reuses last 14 days of habit logs.
 */
function habitConsistencyShift(input: InsightInputs): InsightCard | null {
  const habits = input.habits ?? [];
  if (habits.length === 0) return null;
  const dates = lastNDates(14);
  const map = new Map<string, Set<string>>();
  for (const log of input.habitLogs) map.set(log.date, new Set(log.done));

  function pct(window: string[]): { pct: number; have: number } {
    let expected = 0;
    let done = 0;
    let have = 0;
    for (const iso of window) {
      const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
      const dateObj = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
      const log = map.get(iso);
      if (log) have++;
      for (const h of habits) {
        if (!isExpectedOn(h, dateObj)) continue;
        expected++;
        if (log?.has(h.id)) done++;
      }
    }
    return { pct: expected === 0 ? 0 : (done / expected) * 100, have };
  }

  const prior = pct(dates.slice(0, 7));
  const recent = pct(dates.slice(7));
  if (prior.have < 3 || recent.have < 3) return null;
  const delta = recent.pct - prior.pct;
  if (delta >= 20) {
    return {
      id: "habit-consistency-up",
      severity: "success",
      title: `Habit completion up ${Math.round(delta)} points week-over-week`,
      body: `This week ${Math.round(recent.pct)}% of expected habits checked off vs ${Math.round(prior.pct)}% last week. Streak momentum compounds — keep showing up.`,
      dataWindow: "last 7 days vs previous 7 days",
      citations: dates,
    };
  }
  if (delta <= -20) {
    return {
      id: "habit-consistency-down",
      severity: "warn",
      title: `Habit completion down ${Math.round(-delta)} points this week`,
      body: `Down to ${Math.round(recent.pct)}% from ${Math.round(prior.pct)}% the prior week. A small reset — pick one habit, one day at a time — beats trying to fix all at once.`,
      dataWindow: "last 7 days vs previous 7 days",
      citations: dates,
    };
  }
  return null;
}

/**
 * Hair-fall trend: counts the most recent 4 weekly markers; fires the
 * success card when "heavy" frequency declines across them.
 */
function hairFallTrend(input: InsightInputs): InsightCard | null {
  const samples = input.analytics
    .filter((l) => l.hairFall)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (samples.length < 4) return null;
  // Take last 4 in chrono order.
  const last4 = samples.slice(-4);
  // Count "heavy" in first half vs second half — declining if second half
  // has fewer heavy entries.
  const firstHalf = last4.slice(0, 2);
  const secondHalf = last4.slice(2);
  const firstHeavy = firstHalf.filter((s) => s.hairFall === "heavy").length;
  const secondHeavy = secondHalf.filter((s) => s.hairFall === "heavy").length;
  if (secondHeavy >= firstHeavy) return null;

  return {
    id: "hair-fall-improving",
    severity: "success",
    title: "Hair-fall markers improving over the last 4 weeks",
    body: "Heavy-shed reports declined across the most recent four logs. Keep iron, vitamin D, and protein consistent — and remember correlation isn't causation.",
    dataWindow: "last 4 hair-fall logs",
    citations: last4.map((s) => s.date),
  };
}

/**
 * Cycle nutrition reminder. Fires if any of the last 3 cycle markers is
 * "luteal" (or if the most recent is). Iron + magnesium tip.
 */
function cycleNutritionTip(input: InsightInputs): InsightCard | null {
  const samples = input.analytics
    .filter((l) => l.cycleMarker)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (samples.length === 0) return null;
  const recent = samples.slice(-3);
  const inLuteal = recent.some((s) => s.cycleMarker === "luteal");
  if (!inLuteal) return null;

  return {
    id: "cycle-luteal-tip",
    severity: "info",
    title: "Luteal phase: lean into iron + magnesium foods",
    body: "Pumpkin seeds, dark leafy greens, lentils, dark chocolate, and salmon support iron + magnesium needs that rise in the luteal phase. Pair iron-rich plant foods with citrus to boost absorption.",
    dataWindow: "last 3 cycle logs",
    citations: recent.map((s) => s.date),
  };
}

// ─── Aggregator ────────────────────────────────────────────────────────────

/**
 * Compute all insight cards from the supplied inputs. Order is
 * stable so the UI doesn't shuffle between renders. Any rule may
 * return null; nulls are dropped.
 */
export function computeInsights(input: InsightInputs): InsightCard[] {
  const cards: (InsightCard | null)[] = [
    proteinDeficit(input),
    sleepDeficit(input),
    energyTrend(input),
    habitConsistencyShift(input),
    hairFallTrend(input),
    cycleNutritionTip(input),
    ironAbsorptionTip(input),
  ];
  return cards.filter((c): c is InsightCard => c !== null);
}
