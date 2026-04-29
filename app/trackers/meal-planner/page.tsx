import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensureAtomicTrackerLayout, findFile, readJson } from "@/lib/google/drive";
import {
  currentWeekStart,
  isoDate,
  isoWeekId,
  nextWeekStart,
  weekEnd,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
import {
  ALL_DIETS,
  COMMON_ALLERGIES,
  CUISINES,
  HEALTH_OPTIONS,
} from "@/lib/tracker/meal-planner-defaults";
import { readMealPlannerConfig } from "./actions";
import { AppShell } from "@/components/AppShell";
import { WeekCard } from "@/components/WeekCard";
import { RemindersClient } from "./RemindersClient";

const APP_VERSION = "0.1.0";

async function loadPlanForWeek(
  accessToken: string,
  mealsFolderId: string,
  weekId: string,
): Promise<MealPlan | null> {
  const acceptedId = await findFile(accessToken, `${weekId}.json`, mealsFolderId);
  if (acceptedId) {
    return await readJson<MealPlan>(accessToken, acceptedId).catch(() => null);
  }
  const draftId = await findFile(accessToken, `${weekId}.draft.json`, mealsFolderId);
  if (draftId) {
    return await readJson<MealPlan>(accessToken, draftId).catch(() => null);
  }
  return null;
}

export default async function MealPlannerHomePage() {
  const config = await readMealPlannerConfig();
  if (!config) {
    redirect("/trackers/meal-planner/setup");
  }
  const session = await auth();
  const accessToken = session!.accessToken!;
  const googleSub = session!.googleSub!;

  const currentMonday = currentWeekStart();
  const nextMonday = nextWeekStart();
  const currentId = isoWeekId(currentMonday);
  const nextId = isoWeekId(nextMonday);

  const layout = await ensureAtomicTrackerLayout(accessToken, {
    googleSub,
    appVersion: APP_VERSION,
  });
  const mealsFolderId = layout.folderIds["history/meals"];

  const [currentPlan, nextPlan] = await Promise.all([
    mealsFolderId ? loadPlanForWeek(accessToken, mealsFolderId, currentId) : null,
    mealsFolderId ? loadPlanForWeek(accessToken, mealsFolderId, nextId) : null,
  ]);

  return (
    <AppShell
      title="Weekly Meal Planner"
      subtitle={`Updated ${formatRelative(config.updatedAt)}`}
      backHref="/trackers"
      rightSlot={
        <Link
          href="/trackers/meal-planner/setup"
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Edit
        </Link>
      }
    >
      {/* Two week cards — current week (already started) + next week (focus of planning). */}
      <section className="space-y-4">
        <WeekCard
          weekId={currentId}
          weekStart={isoDate(currentMonday)}
          weekEnd={isoDate(weekEnd(currentMonday))}
          plan={currentPlan}
          isCurrent
          cheatDay={config.cheatDay}
          googleSub={googleSub}
        />
        <WeekCard
          weekId={nextId}
          weekStart={isoDate(nextMonday)}
          weekEnd={isoDate(weekEnd(nextMonday))}
          plan={nextPlan}
          isCurrent={false}
          cheatDay={config.cheatDay}
          googleSub={googleSub}
        />
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Configuration
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row
            label="Diet"
            value={
              [
                ...config.diets.map((id) => labelOf(ALL_DIETS, id)),
                config.customDiet,
              ]
                .filter(Boolean)
                .join(", ") || "—"
            }
          />
          <Row
            label="Health"
            value={
              [
                ...config.healthConditions.map((id) =>
                  labelOf(HEALTH_OPTIONS, id),
                ),
                config.customHealth,
              ]
                .filter(Boolean)
                .join(", ") || "—"
            }
          />
          <Row
            label="Allergies"
            value={
              [
                ...config.allergies.map((id) =>
                  labelOf(COMMON_ALLERGIES, id),
                ),
                ...config.customAllergies,
              ]
                .filter(Boolean)
                .join(", ") || "None"
            }
          />
          <Row
            label="Cuisines"
            value={
              [
                ...config.cuisines.map((id) => labelOf(CUISINES, id)),
                ...config.customCuisines,
              ].join(", ") || "—"
            }
          />
          <Row
            label="Ingredients"
            value={`${config.ingredients.length + config.customIngredients.length} items`}
          />
          <Row label="Repeats / week" value={`${config.repeatsPerWeek}`} />
          <Row
            label="Cheat day"
            value={config.cheatDay ?? "None"}
          />
          <Row
            label="Mealtimes"
            value={`${config.mealtimes.breakfast} · ${config.mealtimes.lunch} · ${config.mealtimes.dinner}`}
          />
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Recurring reminders
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {config.reminderEventIds?.fridayPlan
            ? "Friday plan + Sunday prep + weekly shopping reminders are set up. Refresh to apply changes after editing your config."
            : "One-time setup: creates Friday 6pm plan reminder, Sunday 6pm prep check-in, and a weekly shopping reminder on your shopping day."}
        </p>
        <div className="mt-3">
          <RemindersClient
            hasReminders={Boolean(config.reminderEventIds?.fridayPlan)}
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Prep check-in
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Sunday flow — mark the dinners you&apos;ve prepped and add
          breakfast/lunch. We&apos;ll schedule them on your Calendar.
        </p>
        <Link
          href="/trackers/meal-planner/prep"
          className="mt-4 block w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Open prep check-in →
        </Link>
      </section>
    </AppShell>
  );
}

function labelOf(options: { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="text-right text-xs text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
