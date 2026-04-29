import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  readHabitConfig,
  readHabitLog,
  readHabitLogsLast,
} from "./actions";
import { HabitsClient } from "./HabitsClient";
import {
  computeOverallWeeklyCompletion,
  maxCurrentStreak,
} from "@/lib/tracker/habit-stats";

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function HabitsPage() {
  const config = await readHabitConfig();
  if (!config) {
    redirect("/trackers/habits/setup");
  }

  const today = todayIso();
  // 4 weeks of history is enough for streak math + 7-day grid; the streak
  // walker bails out at first gap so historical depth doesn't matter much.
  const [todayLog, history] = await Promise.all([
    readHabitLog(today),
    readHabitLogsLast(28),
  ]);

  const overallPct = computeOverallWeeklyCompletion(config.habits, history);
  const bestStreak = maxCurrentStreak(config.habits, history);

  return (
    <AppShell
      title="Habit Tracker"
      subtitle="Daily non-negotiables"
      backHref="/trackers"
      rightSlot={
        <Link
          href="/trackers/habits/setup"
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Edit
        </Link>
      }
    >
      {/* Header chips: streak + weekly completion */}
      <section className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Best current streak
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">
            {bestStreak}
            <span className="ml-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              days
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              This week
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">
            {overallPct}
            <span className="ml-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              %
            </span>
          </p>
        </div>
      </section>

      <HabitsClient
        habits={config.habits}
        today={today}
        todayLog={todayLog}
        history={history}
        remindersEnabled={config.remindersEnabled}
      />
    </AppShell>
  );
}
