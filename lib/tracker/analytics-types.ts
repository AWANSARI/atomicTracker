/**
 * Schema for /AtomicTracker/history/analytics/{YYYY-MM-DD}.json — one log
 * per day capturing lightweight self-reports (energy, mood, sleep) plus
 * optional health markers (hair fall, cycle phase) gated on the user's
 * configured symptoms.
 *
 * Stored as plain JSON. No secrets — just preference / observational data.
 * Last write wins; the API route upserts the file on each submit.
 */

export type EnergyScore = 1 | 2 | 3 | 4 | 5;
export type MoodScore = 1 | 2 | 3 | 4 | 5;

export type HairFallLevel = "low" | "moderate" | "heavy";

export type CycleMarker =
  | "menstrual"
  | "follicular"
  | "ovulatory"
  | "luteal"
  | "spotting";

export type AnalyticsDayLog = {
  v: 1;
  /** ISO date "YYYY-MM-DD". */
  date: string;
  energy?: EnergyScore;
  mood?: MoodScore;
  /** Hours slept the previous night, 0-14, half-hour granularity. */
  sleepHours?: number;
  /** Weekly cadence — log on any day, last write wins for that ISO week. */
  hairFall?: HairFallLevel;
  cycleMarker?: CycleMarker;
  notes?: string;
  /** When this log was last written. */
  loggedAt: string;
};

export function emptyAnalyticsDayLog(date: string): AnalyticsDayLog {
  return {
    v: 1,
    date,
    loggedAt: new Date().toISOString(),
  };
}

/** Score → human-friendly label for chips and citation strings. */
export const ENERGY_LABEL: Record<EnergyScore, string> = {
  1: "Drained",
  2: "Low",
  3: "Steady",
  4: "Good",
  5: "Peak",
};

export const MOOD_LABEL: Record<MoodScore, string> = {
  1: "Down",
  2: "Off",
  3: "Neutral",
  4: "Good",
  5: "Great",
};

export const HAIR_FALL_LABEL: Record<HairFallLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  heavy: "Heavy",
};

export const CYCLE_LABEL: Record<CycleMarker, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulatory: "Ovulatory",
  luteal: "Luteal",
  spotting: "Spotting",
};

export const ENERGY_SCORES: EnergyScore[] = [1, 2, 3, 4, 5];
export const MOOD_SCORES: MoodScore[] = [1, 2, 3, 4, 5];
export const HAIR_FALL_LEVELS: HairFallLevel[] = ["low", "moderate", "heavy"];
export const CYCLE_MARKERS: CycleMarker[] = [
  "menstrual",
  "follicular",
  "ovulatory",
  "luteal",
  "spotting",
];
