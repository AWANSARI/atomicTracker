import Link from "next/link";
import { hasMealPlannerConfig } from "./meal-planner/actions";
import { AppShell } from "@/components/AppShell";

export default async function TrackersPage() {
  const mealPlannerConfigured = await hasMealPlannerConfig();

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
          icon="🍽️"
          title="Weekly Meal Planner"
          description={
            mealPlannerConfigured
              ? "Configured · tap to view"
              : "Plan dinners for the week with AI suggestions, ingredient lists, and Calendar reminders."
          }
          status={mealPlannerConfigured ? "configured" : "available"}
        />

        <TrackerCard
          icon="🏋️"
          title="Workout Planner"
          description="Coming after Phase 1."
          status="coming-soon"
        />

        <TrackerCard
          icon="💰"
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
  icon,
  title,
  description,
  status,
}: {
  href?: string;
  icon: string;
  title: string;
  description: string;
  status: "configured" | "available" | "coming-soon";
}) {
  const inner = (
    <div className="flex items-start gap-3">
      <div
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xl"
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {status === "configured" ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800">
              ✓ Active
            </span>
          ) : null}
          {status === "coming-soon" ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Soon
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );

  if (status === "coming-soon") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 opacity-70 dark:border-slate-800 dark:bg-slate-900">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={href ?? "#"}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600 dark:hover:bg-slate-800"
    >
      {inner}
    </Link>
  );
}
