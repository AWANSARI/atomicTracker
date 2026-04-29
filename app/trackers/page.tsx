import Link from "next/link";
import { hasMealPlannerConfig } from "./meal-planner/actions";

export default async function TrackersPage() {
  const mealPlannerConfigured = await hasMealPlannerConfig();

  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 py-10">
      <header className="flex items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          ←
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Trackers</h1>
          <p className="text-xs text-slate-500">Pick what to track</p>
        </div>
      </header>

      <section className="mt-8 space-y-3">
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

      <p className="mt-8 text-center text-xs text-slate-400">
        Trackers are designed as plug-ins. The first one (meal planner)
        validates the pattern; more arrive once Phase 1 ships.
      </p>
    </main>
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
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 opacity-70">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={href ?? "#"}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
    >
      {inner}
    </Link>
  );
}
