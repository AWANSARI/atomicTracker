import type { LucideIcon } from "lucide-react";

/**
 * Lightweight tracker registry.
 *
 * After three concrete trackers shipped (meal planner, supplements, habits),
 * the shared shape they all expose to the dashboard is small: id, label,
 * icon, primary route, setup route, and an `isConfigured()` server check.
 *
 * The Trackers picker renders from this list instead of hard-coded cards,
 * which makes adding the next tracker (e.g. Workout, Cycle) a one-file edit.
 *
 * NOTE: this registry is *only* the discovery surface. Each tracker's
 * domain logic (generate/swap/accept/log) lives in its own actions module —
 * we deliberately do NOT abstract those because they don't share much.
 */

export type TrackerStatus = "configured" | "available" | "coming-soon";

export type TrackerRegistryEntry = {
  id: string;
  /** Display name on the picker. */
  title: string;
  /** One-sentence description for the unconfigured state. */
  description: string;
  /** Tagline shown when the tracker is configured. */
  configuredHint: string;
  /** Lucide icon component. */
  Icon: LucideIcon;
  /** Where to navigate when the tracker is configured. */
  href: string;
  /** Where to navigate to set the tracker up. */
  setupHref: string;
  /** Server-side check returning true if the user has a config saved. */
  isConfigured: () => Promise<boolean>;
};

/**
 * "Coming soon" placeholder — distinct from real entries because it has
 * no setup flow, no isConfigured probe.
 */
export type TrackerPlaceholder = {
  id: string;
  title: string;
  description: string;
  Icon: LucideIcon;
};
