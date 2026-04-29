import Link from "next/link";
import { Activity, NotebookPen } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
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
import { computeInsights } from "@/lib/tracker/insights";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { readSupplementConfig } from "@/app/trackers/supplements/actions";
import { readHabitConfig, readHabitLogsLast } from "@/app/trackers/habits/actions";
import { readAnalyticsLogsLast } from "./actions";
import { InsightsClient } from "./InsightsClient";

const APP_VERSION = "0.1.0";

type SupplementLogRaw = {
  date?: string;
  taken?: Record<string, string>;
};

async function loadAcceptedPlan(
  accessToken: string,
  folderId: string,
  weekId: string,
): Promise<MealPlan | null> {
  const id = await findFile(accessToken, `${weekId}.json`, folderId);
  if (!id) return null;
  return await readJson<MealPlan>(accessToken, id).catch(() => null);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function InsightsPage() {
  const session = await auth();
  const accessToken = session!.accessToken!;
  const googleSub = session!.googleSub!;

  const layout = await ensureAtomicTrackerLayout(accessToken, {
    googleSub,
    appVersion: APP_VERSION,
  });

  const mealsFolderId = layout.folderIds["history/meals"];
  const supplementsHistoryId = layout.folderIds["history/supplements"];

  // Compute the last 4 ISO week ids ending with this week.
  const monday = currentWeekStart();
  const recentWeekIds: string[] = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    recentWeekIds.push(isoWeekId(d));
  }

  // Build the last 28-day date list for supplement-log lookups (mirror of
  // readHabitLogsLast/readAnalyticsLogsLast — supplements/log doesn't expose
  // a server-action helper yet, so we do the sequential lookup inline).
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const supplementDates: string[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(todayUtc);
    d.setUTCDate(d.getUTCDate() - i);
    supplementDates.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }

  const [config, supplementConfig, habitConfig, analytics, habitLogs] =
    await Promise.all([
      readMealPlannerConfig(),
      readSupplementConfig(),
      readHabitConfig(),
      readAnalyticsLogsLast(28),
      readHabitLogsLast(28),
    ]);

  const recentPlans: MealPlan[] = [];
  if (mealsFolderId) {
    for (const wid of recentWeekIds) {
      const plan = await loadAcceptedPlan(accessToken, mealsFolderId, wid);
      if (plan) recentPlans.push(plan);
    }
  }

  const supplementLogs: { date: string; taken: Record<string, string> }[] = [];
  if (supplementsHistoryId) {
    for (const iso of supplementDates) {
      const fid = await findFile(accessToken, `${iso}.json`, supplementsHistoryId);
      if (!fid) continue;
      const raw = await readJson<SupplementLogRaw>(accessToken, fid).catch(() => null);
      if (!raw) continue;
      supplementLogs.push({
        date: raw.date ?? iso,
        taken: raw.taken ?? {},
      });
    }
  }

  const cards = config
    ? computeInsights({
        analytics,
        supplementLogs,
        habitLogs,
        recentPlans,
        config,
        habits: habitConfig?.habits,
        supplements: supplementConfig?.supplements,
      })
    : [];

  const today_ = todayIso();
  const todayLog = analytics.find((l) => l.date === today_) ?? null;

  return (
    <AppShell
      title="Insights"
      subtitle="Patterns from your last 4 weeks"
      backHref="/dashboard"
      rightSlot={
        <Link
          href="/insights/log"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <NotebookPen className="h-3.5 w-3.5" />
          Log today
        </Link>
      }
    >
      {!config ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <Activity className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-50">
            Set up the meal planner first
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Insights compare your daily logs against your nutrition targets and
            habit cadences. We need a meal-planner config before any of those
            rules fire.
          </p>
          <Link
            href="/trackers/meal-planner/setup"
            className="mt-4 inline-flex rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Open setup
          </Link>
        </div>
      ) : (
        <>
          {/* Today snapshot — quick log status */}
          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Today
                </p>
                <p className="mt-0.5 text-sm text-slate-900 dark:text-slate-50">
                  {todayLog ? (
                    <>
                      Logged{" "}
                      {[
                        todayLog.energy != null ? `energy ${todayLog.energy}/5` : null,
                        todayLog.mood != null ? `mood ${todayLog.mood}/5` : null,
                        todayLog.sleepHours != null
                          ? `sleep ${todayLog.sleepHours} h`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "no fields yet"}
                    </>
                  ) : (
                    "No log yet — takes 20 seconds."
                  )}
                </p>
              </div>
              <Link
                href="/insights/log"
                className="shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {todayLog ? "Edit" : "Log"}
              </Link>
            </div>
          </section>

          <InsightsClient cards={cards} />

          <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
            Insights are correlations — not medical advice. Citations open the
            specific dates the rule looked at.
          </p>
        </>
      )}
    </AppShell>
  );
}
