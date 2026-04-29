/**
 * Deterministic supplement scheduler. Pure functions only — no I/O. Used by
 * both the server (calendar reminder placement) and the client (schedule view).
 *
 * Solver strategy: greedy. For each supplement × times-per-day, place an
 * anchor based on hints, then check gap constraints against already-placed
 * supplements. If a conflict is found, slide later (max 4 hours) and surface
 * a warning if it can't be fully resolved.
 */

import type {
  AvoidTag,
  Supplement,
  TimingHint,
  TimingRule,
} from "./supplement-types";

export type Mealtimes = {
  breakfast: string;
  lunch: string;
  dinner: string;
  bedtime?: string;
};

export type TimelineSlot = {
  time: string; // "HH:MM"
  supplementId: string;
  supplementName: string;
  hint: TimingHint;
  warnings: string[];
};

// ─── Time helpers ───────────────────────────────────────────────────────────

/** Parse HH:MM to total minutes since midnight. Tolerant of bad input. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const hh = Number.isFinite(h) ? (h as number) : 0;
  const mm = Number.isFinite(m) ? (m as number) : 0;
  return hh * 60 + mm;
}

function fromMinutes(total: number): string {
  let t = total;
  if (t < 0) t = 0;
  if (t > 23 * 60 + 59) t = 23 * 60 + 59;
  const hh = Math.floor(t / 60);
  const mm = t % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ─── Anchor selection ───────────────────────────────────────────────────────

/**
 * Pick the dominant hint for a single dose. Order matters — earlier hints
 * "win" because they're more specific (empty-stomach beats morning).
 */
const HINT_PRIORITY: TimingHint[] = [
  "empty-stomach",
  "before-food",
  "with-fat",
  "with-food",
  "after-food",
  "bedtime",
  "morning",
  "any-time",
];

function pickHint(rule: TimingRule): TimingHint {
  const hints = rule.hints ?? [];
  for (const h of HINT_PRIORITY) {
    if (hints.includes(h)) return h;
  }
  return "any-time";
}

/**
 * Compute the minute-of-day anchor for a given hint + dose index.
 * doseIndex 0 = first dose of the day, 1 = second, etc. We spread doses
 * evenly across the wake window when timesPerDay > 1.
 */
function anchorFor(
  hint: TimingHint,
  doseIndex: number,
  timesPerDay: number,
  m: Mealtimes,
): number {
  const breakfast = toMinutes(m.breakfast);
  const lunch = toMinutes(m.lunch);
  const dinner = toMinutes(m.dinner);
  const bedtime = m.bedtime ? toMinutes(m.bedtime) : 22 * 60 + 30;
  const morning = 7 * 60;

  // For multi-dose supplements, distribute extras at the next major mealtime.
  const mealsByDose = [breakfast, lunch, dinner];

  switch (hint) {
    case "empty-stomach":
    case "before-food": {
      // 30-60 min before the relevant meal. Use 45 min before breakfast for
      // the first dose; subsequent doses sit 45 min before lunch / dinner.
      const meal = mealsByDose[doseIndex] ?? mealsByDose[mealsByDose.length - 1] ?? breakfast;
      return meal - 45;
    }
    case "morning":
      // First dose 07:00; later doses spread over the day.
      if (doseIndex === 0) return Math.min(morning, breakfast - 45);
      return mealsByDose[doseIndex] ?? lunch;
    case "with-food":
    case "after-food":
    case "with-fat": {
      // At the relevant mealtime (assumed to contain food + fat). For
      // with-fat, prefer breakfast first; for >1 dose, spread across meals.
      const meal = mealsByDose[doseIndex] ?? mealsByDose[mealsByDose.length - 1] ?? breakfast;
      // "after-food" sits 15 min after the meal so the gap from empty-stomach
      // doses can be detected as a true conflict.
      return hint === "after-food" ? meal + 15 : meal;
    }
    case "bedtime":
      return bedtime - 30;
    case "any-time":
    default: {
      // Spread evenly across wake hours for multi-dose; otherwise mid-morning.
      if (timesPerDay <= 1) return Math.max(breakfast + 30, 9 * 60);
      const start = breakfast;
      const end = bedtime - 30;
      const span = end - start;
      const step = span / Math.max(timesPerDay - 1, 1);
      return start + Math.round(step * doseIndex);
    }
  }
}

// ─── Conflict resolution ────────────────────────────────────────────────────

type Placement = {
  minutes: number;
  supplementId: string;
  supplementName: string;
  hint: TimingHint;
  selfTags: AvoidTag[];
  warnings: string[];
};

/**
 * Try to slide a placement later (or earlier as a fallback) until all gap
 * constraints are met. Returns the chosen minute-of-day plus any unresolved
 * warnings.
 */
function resolveConflicts(
  desired: number,
  rule: TimingRule,
  hint: TimingHint,
  placed: Placement[],
  selfName: string,
): { minutes: number; warnings: string[] } {
  const warnings: string[] = [];
  const gaps = rule.gapMinutesFrom ?? [];
  if (gaps.length === 0) return { minutes: clamp(desired, 0, 23 * 60 + 59), warnings };

  // Anchor-time supplements (empty-stomach, before-food, bedtime) are not
  // supposed to slide more than a few minutes. with-food / after-food can
  // shift to the next meal. any-time can move freely. Encode max-shift here.
  const HARD_HINTS: TimingHint[] = [
    "empty-stomach",
    "before-food",
    "bedtime",
    "morning",
  ];
  const maxShift = HARD_HINTS.includes(hint) ? 30 : 240;

  let chosen = clamp(desired, 0, 23 * 60 + 59);
  const STEP = 5;

  for (let shift = 0; shift <= maxShift; shift += STEP) {
    for (const sign of shift === 0 ? [0] : [1, -1]) {
      const candidate = clamp(desired + sign * shift, 0, 23 * 60 + 59);
      const conflicts = findConflicts(candidate, gaps, placed);
      if (conflicts.length === 0) {
        return { minutes: candidate, warnings };
      }
      if (shift === maxShift && sign === 1) {
        // Final attempt — record warnings.
        for (const c of conflicts) {
          const minutesApart = Math.abs(candidate - c.placed.minutes);
          warnings.push(
            `${selfName} should be ≥${c.required / 60 >= 1 ? `${c.required / 60}h` : `${c.required}min`} from ${c.placed.supplementName} (currently ${formatGap(minutesApart)} apart)`,
          );
        }
        chosen = candidate;
      }
    }
  }
  return { minutes: chosen, warnings };
}

function findConflicts(
  candidate: number,
  gaps: NonNullable<TimingRule["gapMinutesFrom"]>,
  placed: Placement[],
): { placed: Placement; required: number }[] {
  const out: { placed: Placement; required: number }[] = [];
  for (const gap of gaps) {
    for (const p of placed) {
      if (!p.selfTags.includes(gap.tag)) continue;
      const apart = Math.abs(candidate - p.minutes);
      if (apart < gap.minutes) {
        out.push({ placed: p, required: gap.minutes });
      }
    }
  }
  return out;
}

function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute a single day's supplement timeline. Returns slots sorted by time.
 * Pure — call as often as needed.
 */
export function computeDailySchedule(
  supplements: Supplement[],
  mealtimes: Mealtimes,
): TimelineSlot[] {
  // Order matters: place "hard" anchors (thyroid, bedtime, etc.) before the
  // flexible ones so the latter can move out of the way.
  const ordered = [...supplements].sort((a, b) => {
    const ha = pickHint(a.rule);
    const hb = pickHint(b.rule);
    return HINT_PRIORITY.indexOf(ha) - HINT_PRIORITY.indexOf(hb);
  });

  const placed: Placement[] = [];

  for (const supp of ordered) {
    const hint = pickHint(supp.rule);
    const times = Math.max(1, supp.timesPerDay | 0);
    for (let dose = 0; dose < times; dose++) {
      const desired = anchorFor(hint, dose, times, mealtimes);
      const { minutes, warnings } = resolveConflicts(
        desired,
        supp.rule,
        hint,
        placed,
        supp.name,
      );
      placed.push({
        minutes,
        supplementId: supp.id,
        supplementName: supp.name,
        hint,
        selfTags: supp.rule.selfTags ?? [],
        warnings,
      });
    }
  }

  return placed
    .sort((a, b) => a.minutes - b.minutes)
    .map<TimelineSlot>((p) => ({
      time: fromMinutes(p.minutes),
      supplementId: p.supplementId,
      supplementName: p.supplementName,
      hint: p.hint,
      warnings: p.warnings,
    }));
}

/**
 * Human-friendly label for a timing hint — used in the schedule view chips.
 */
export function hintLabel(hint: TimingHint): string {
  switch (hint) {
    case "empty-stomach":
      return "Empty stomach";
    case "before-food":
      return "Before food";
    case "with-food":
      return "With food";
    case "after-food":
      return "After food";
    case "with-fat":
      return "With fat";
    case "morning":
      return "Morning";
    case "bedtime":
      return "Bedtime";
    case "any-time":
    default:
      return "Any time";
  }
}
