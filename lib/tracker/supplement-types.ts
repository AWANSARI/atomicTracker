/**
 * Schema for /AtomicTracker/config/tracker.supplements.json.
 * Plain JSON (not encrypted) — preference data, not secrets.
 *
 * The TimingRule shape is the contract between the catalog
 * (lib/tracker/supplement-catalog.ts), the wizard, and the
 * deterministic solver in lib/tracker/supplement-rules.ts.
 */

export type TimingHint =
  | "empty-stomach"
  | "before-food"
  | "with-food"
  | "after-food"
  | "with-fat"
  | "morning"
  | "bedtime"
  | "any-time";

export type AvoidTag =
  | "calcium"
  | "iron"
  | "thyroid"
  | "tea-coffee"
  | "magnesium"
  | "vitamin-c"
  | "fiber-meal";

export type TimingRule = {
  hints?: TimingHint[];
  avoidTags?: AvoidTag[];
  /** Minutes of separation required from any supplement carrying these tags. */
  gapMinutesFrom?: { tag: AvoidTag; minutes: number }[];
  /** Self-tag — used by other supplements' avoidTags to know what THIS one carries. */
  selfTags?: AvoidTag[];
};

export type Supplement = {
  id: string;
  name: string;
  dose?: string;
  /** Catalog entry ID this supplement was created from, if any. */
  catalogId?: string;
  timesPerDay: number;
  rule: TimingRule;
  notes?: string;
  reminderEventIds?: string[];
};

export type SupplementConfig = {
  v: 1;
  supplements: Supplement[];
  createdAt: string;
  updatedAt: string;
};

export function emptySupplementConfig(): SupplementConfig {
  const now = new Date().toISOString();
  return {
    v: 1,
    supplements: [],
    createdAt: now,
    updatedAt: now,
  };
}
