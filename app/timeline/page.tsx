import Link from "next/link";
import { Sparkles } from "lucide-react";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
} from "@/lib/google/drive";
import {
  currentWeekStart,
  isoWeekId,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
import { computeDailySchedule } from "@/lib/tracker/supplement-rules";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { readSupplementConfig } from "@/app/trackers/supplements/actions";
import { readHabitConfig, readHabitLog } from "@/app/trackers/habits/actions";
import {
  dateFromIso,
  fuseTimeline,
  isoFromDate,
  mealsForDate,
  todayIso,
} from "@/lib/tracker/timeline";
import { AppShell } from "@/components/AppShell";
import { TimelineClient } from "./TimelineClient";

const APP_VERSION = "0.1.0";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: { date?: string; print?: string };
}) {
  const session = await auth();
  const accessToken = session!.accessToken!;
  const googleSub = session!.googleSub!;

  // Date — default to today; query ?date overrides.
  const dateIso =
    typeof searchParams.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : todayIso();
  const date = dateFromIso(dateIso);
  const isPrint = searchParams.print === "fridge";

  // Parallel-fetch all the bits we need. Each tracker's read is per-request
  // memoized via React cache(), so subsequent calls share the same Promise.
  const [layout, mealConfig, supplementConfig, habitConfig, habitLog] =
    await Promise.all([
      ensureAtomicTrackerLayout(accessToken, {
        googleSub,
        appVersion: APP_VERSION,
      }),
      readMealPlannerConfig(),
      readSupplementConfig(),
      readHabitConfig(),
      readHabitLog(dateIso),
    ]);

  // Find the meal plan that contains this date — try the current ISO week
  // first, then fall back to scanning the date's own week.
  let plan: MealPlan | null = null;
  const mealsFolderId = layout.folderIds["history/meals"];
  if (mealsFolderId) {
    const dayWeekId = isoWeekId(date);
    const tryRead = async (weekId: string): Promise<MealPlan | null> => {
      const fileId = await findFile(accessToken, `${weekId}.json`, mealsFolderId);
      if (!fileId) return null;
      return readJson<MealPlan>(accessToken, fileId).catch(() => null);
    };
    plan = await tryRead(dayWeekId);
    if (!plan) {
      const currentId = isoWeekId(currentWeekStart());
      if (currentId !== dayWeekId) plan = await tryRead(currentId);
    }
  }

  // Build the supplement schedule for this date's mealtimes.
  const mealtimes = mealConfig?.mealtimes ?? {
    breakfast: "08:00",
    lunch: "12:30",
    dinner: "19:00",
  };
  const supplementSchedule =
    supplementConfig && supplementConfig.supplements.length > 0
      ? computeDailySchedule(supplementConfig.supplements, mealtimes)
      : [];

  const meals = mealsForDate(plan, date);
  const habits = habitConfig?.habits ?? [];
  const habitsDone = habitLog?.done ?? [];

  const entries = fuseTimeline({
    date,
    meals,
    mealtimes,
    supplementSchedule,
    habits,
    habitsDone,
  });

  // Render: print view is a simpler layout, no AppShell chrome.
  if (isPrint) {
    return (
      <main className="mx-auto max-w-3xl p-8 print:p-4">
        <h1 className="text-2xl font-semibold">Daily plan · {dateIso}</h1>
        <p className="mt-1 text-sm text-slate-500">
          AtomicTracker · routine + nutrition + balance
        </p>
        <TimelineClient
          dateIso={dateIso}
          entries={entries}
          printMode
          hasMeals={meals.length > 0}
          hasSupplements={supplementSchedule.length > 0}
          hasHabits={habits.length > 0}
        />
      </main>
    );
  }

  return (
    <AppShell
      title="Daily timeline"
      subtitle={dateIso}
      backHref="/dashboard"
      rightSlot={
        <Link
          href={`/timeline?date=${dateIso}&print=fridge`}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Print
        </Link>
      }
    >
      {entries.length === 0 ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <p>
            Nothing scheduled for <strong>{dateIso}</strong> yet. Set up at
            least one of the trackers below to see your day fuse together.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/trackers/meal-planner"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Meal planner
            </Link>
            <Link
              href="/trackers/supplements"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Supplements
            </Link>
            <Link
              href="/trackers/habits"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Habits
            </Link>
          </div>
        </section>
      ) : (
        <TimelineClient
          dateIso={dateIso}
          entries={entries}
          hasMeals={meals.length > 0}
          hasSupplements={supplementSchedule.length > 0}
          hasHabits={habits.length > 0}
        />
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <p>
          Showing {meals.length} meal{meals.length === 1 ? "" : "s"},{" "}
          {supplementSchedule.length} supplement
          {supplementSchedule.length === 1 ? " dose" : " doses"}, and{" "}
          {entries.filter((e) => e.kind === "habit").length} habit
          {entries.filter((e) => e.kind === "habit").length === 1 ? "" : "s"}{" "}
          for {dateIso}.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href={`/timeline?date=${prevDayIso(dateIso)}`}
            className="text-brand-600 hover:underline dark:text-brand-400"
          >
            ← Previous day
          </Link>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <Link
            href={`/timeline?date=${nextDayIso(dateIso)}`}
            className="text-brand-600 hover:underline dark:text-brand-400"
          >
            Next day →
          </Link>
          {dateIso !== todayIso() ? (
            <>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link
                href="/timeline"
                className="text-brand-600 hover:underline dark:text-brand-400"
              >
                Today
              </Link>
            </>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

function prevDayIso(iso: string): string {
  const d = dateFromIso(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return isoFromDate(d);
}

function nextDayIso(iso: string): string {
  const d = dateFromIso(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return isoFromDate(d);
}
