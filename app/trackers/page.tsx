import Link from "next/link";
import { Dumbbell, Pill, Sprout, UtensilsCrossed, Wallet } from "lucide-react";
import { hasMealPlannerConfig } from "./meal-planner/actions";
import { hasSupplementConfig } from "./supplements/actions";
import { hasHabitConfig } from "./habits/actions";
import { AppShell } from "@/components/AppShell";

export default async function TrackersPage() {
  const [mealPlannerConfigured, supplementsConfigured, habitsConfigured] =
    await Promise.all([
      hasMealPlannerConfig(),
      hasSupplementConfig(),
      hasHabitConfig(),
    ]);

  return (
    <AppShell
      title="Trackers"
      subtitle="Pick what to track"
      backHref="/dashboard"
    >
      <section className="space-y-3">
        <TrackerCard
          href={
            mealPlannerConfigured
              ? "/trackers/meal-planner"
              : "/trackers/meal-planner/setup"
          }
          Icon={UtensilsCrossed}
          title="Weekly Meal Planner"
          description={
            mealPlannerConfigured
              ? "Configured · tap to view"
              : "Plan dinners for the week with AI suggestions, ingredient lists, and Calendar reminders."
          }
          status={mealPlannerConfigured ? "configured" : "available"}
        />

        <TrackerCard
          href={
            supplementsConfigured
              ? "/trackers/supplements"
              : "/trackers/supplements/setup"
          }
          Icon={Pill}
          title="Supplement Scheduler"
          description={
            supplementsConfigured
              ? "Configured · tap to view today's schedule"
              : "Track supplements & meds with conflict-aware timing and Calendar reminders."
          }
          status={supplementsConfigured ? "configured" : "available"}
        />

        <TrackerCard
          href={
            habitsConfigured
              ? "/trackers/habits"
              : "/trackers/habits/setup"
          }
          Icon={Sprout}
          title="Habit Tracker"
          description={
            habitsConfigured
              ? "Configured · tap to check off today's habits"
              : "Daily non-negotiables with streaks and weekly consistency."
          }
          status={habitsConfigured ? "configured" : "available"}
        />

        <TrackerCard
          Icon={Dumbbell}
          title="Workout Planner"
          description="Coming after Phase 1."
          status="coming-soon"
        />

        <TrackerCard
          Icon={Wallet}
          title="Finance Tracker"
          description="Coming after Phase 1."
          status="coming-soon"
        />
      </section>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        Trackers are designed as plug-ins. The first one (meal planner)
        validates the pattern; more arrive once Phase 1 ships.
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
