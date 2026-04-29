import Link from "next/link";
import { Dumbbell, Pill, Sprout, UtensilsCrossed, Wallet } from "lucide-react";
import { hasMealPlannerConfig } from "./meal-planner/actions";
import { hasSupplementConfig } from "./supplements/actions";
import { hasHabitConfig } from "./habits/actions";
import { AppShell } from "@/components/AppShell";
import type {
  TrackerPlaceholder,
  TrackerRegistryEntry,
} from "@/lib/tracker/registry";

/**
 * Live tracker registry. Each entry is rendered as a card on the picker.
 * Adding a new tracker = appending to this array + dropping the matching
 * /trackers/<id>/ folder. No other edits required here.
 */
const TRACKERS: TrackerRegistryEntry[] = [
  {
    id: "meal-planner",
    title: "Weekly Meal Planner",
    description:
      "Plan a full week of breakfast / lunch / dinner / snacks with AI suggestions, ingredient lists, and Calendar reminders.",
    configuredHint: "Configured · tap to view",
    Icon: UtensilsCrossed,
    href: "/trackers/meal-planner",
    setupHref: "/trackers/meal-planner/setup",
    isConfigured: hasMealPlannerConfig,
  },
  {
    id: "supplements",
    title: "Supplement Scheduler",
    description:
      "Track supplements & meds with conflict-aware timing (empty-stomach, 2-h gaps from iron / calcium) and Calendar reminders.",
    configuredHint: "Configured · tap to view today's schedule",
    Icon: Pill,
    href: "/trackers/supplements",
    setupHref: "/trackers/supplements/setup",
    isConfigured: hasSupplementConfig,
  },
  {
    id: "habits",
    title: "Habit Tracker",
    description:
      "Daily non-negotiables with streaks and weekly consistency.",
    configuredHint: "Configured · tap to check off today's habits",
    Icon: Sprout,
    href: "/trackers/habits",
    setupHref: "/trackers/habits/setup",
    isConfigured: hasHabitConfig,
  },
];

const PLACEHOLDERS: TrackerPlaceholder[] = [
  {
    id: "workout",
    title: "Workout Planner",
    description: "Coming soon.",
    Icon: Dumbbell,
  },
  {
    id: "finance",
    title: "Finance Tracker",
    description: "Coming soon.",
    Icon: Wallet,
  },
];

export default async function TrackersPage() {
  // Fetch all isConfigured() probes in parallel (each is per-request memoized).
  const statuses = await Promise.all(TRACKERS.map((t) => t.isConfigured()));

  return (
    <AppShell
      title="Trackers"
      subtitle="Pick what to track"
      backHref="/dashboard"
    >
      <section className="space-y-3">
        {TRACKERS.map((t, i) => {
          const configured = statuses[i] ?? false;
          return (
            <TrackerCard
              key={t.id}
              href={configured ? t.href : t.setupHref}
              Icon={t.Icon}
              title={t.title}
              description={configured ? t.configuredHint : t.description}
              status={configured ? "configured" : "available"}
            />
          );
        })}

        {PLACEHOLDERS.map((p) => (
          <TrackerCard
            key={p.id}
            Icon={p.Icon}
            title={p.title}
            description={p.description}
            status="coming-soon"
          />
        ))}
      </section>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        Each tracker stores its own data in your Drive. Set up one or all of
        them — the Daily Timeline fuses whichever you have.
      </p>
    </AppShell>
  );
}

function TrackerCard({
  href,
  Icon,
  title,
  description,
  status,
}: {
  href?: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  status: "configured" | "available" | "coming-soon";
}) {
  const inner = (
    <div className="flex items-start gap-3">
      <div
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</p>
          {status === "configured" ? (
            <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Active
            </span>
          ) : null}
          {status === "coming-soon" ? (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Soon
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );

  if (status === "coming-soon") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 opacity-60 dark:border-slate-800 dark:bg-slate-900">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={href ?? "#"}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600 dark:hover:bg-slate-800"
    >
      {inner}
    </Link>
  );
}
