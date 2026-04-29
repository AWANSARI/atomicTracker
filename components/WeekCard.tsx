import Link from "next/link";
import { CalendarDays, CheckCircle2, FileEdit, MinusCircle } from "lucide-react";
import { GenerateClient } from "@/app/trackers/meal-planner/GenerateClient";
import { DAYS, type Day, type MealPlan } from "@/lib/tracker/meal-planner-plan";

/**
 * Apple-Calendar-inspired week card. Shows the week range, status badge,
 * and a 7-row mini-grid of day → meal name (or em-dash for empty days).
 *
 * Used twice on the tracker home: current week + next week.
 */
export function WeekCard({
  weekId,
  weekStart,
  weekEnd,
  plan,
  isCurrent,
  cheatDay,
  googleSub,
}: {
  weekId: string;
  weekStart: string;
  weekEnd: string;
  plan: MealPlan | null;
  isCurrent: boolean;
  cheatDay: Day | null;
  googleSub: string;
}) {
  const status = plan?.status ?? null;
  const mealByDay = new Map<Day, string>(
    (plan?.meals ?? []).map((m) => [m.day, m.name]),
  );

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white dark:bg-slate-900 ${
        isCurrent
          ? "border-l-4 border-l-brand-500 border-y-slate-200 border-r-slate-200 dark:border-l-brand-500 dark:border-y-slate-800 dark:border-r-slate-800"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <CalendarDays
            className={`h-4 w-4 ${isCurrent ? "text-brand-600 dark:text-brand-400" : "text-slate-500 dark:text-slate-400"}`}
          />
          <div>
            <p
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                isCurrent
                  ? "text-brand-700 dark:text-brand-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {isCurrent ? "This week" : "Next week"} · {weekId}
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {formatRange(weekStart, weekEnd)}
            </p>
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {DAYS.map((day) => {
          const meal = mealByDay.get(day);
          const isCheat = cheatDay === day;
          return (
            <li
              key={day}
              className="flex items-center gap-3 px-4 py-2 text-xs"
            >
              <span className="w-8 shrink-0 font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {day}
              </span>
              {isCheat ? (
                <span className="text-slate-500 italic dark:text-slate-500">
                  Cheat day
                </span>
              ) : meal ? (
                <span className="truncate text-slate-900 dark:text-slate-100">
                  {meal}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-600">—</span>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="space-y-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        {plan ? (
          <Link
            href={`/trackers/meal-planner/plan?week=${weekId}`}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            View · swap · accept →
          </Link>
        ) : null}
        <GenerateClient
          googleSub={googleSub}
          weekId={weekId}
          weekLabel={weekId.split("-")[1] ?? weekId}
          hasExisting={Boolean(plan)}
          variant={plan ? "secondary" : "primary"}
        />
      </footer>
    </article>
  );
}

function StatusBadge({ status }: { status: "draft" | "accepted" | null }) {
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Accepted
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <FileEdit className="h-3 w-3" />
        Draft
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
      <MinusCircle className="h-3 w-3" />
      No plan
    </span>
  );
}

function formatRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}
