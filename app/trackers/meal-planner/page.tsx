import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readMealPlannerConfig } from "./actions";
import { GenerateClient } from "./GenerateClient";
import { findFile } from "@/lib/google/drive";
import { ensureAtomicTrackerLayout } from "@/lib/google/drive";
import {
  isoWeekId,
  nextWeekStart,
} from "@/lib/tracker/meal-planner-plan";
import {
  ALL_DIETS,
  COMMON_ALLERGIES,
  CUISINES,
  HEALTH_OPTIONS,
} from "@/lib/tracker/meal-planner-defaults";
import { AppShell } from "@/components/AppShell";

const APP_VERSION = "0.1.0";

function labelFor(options: { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

export default async function MealPlannerHomePage() {
  const config = await readMealPlannerConfig();
  if (!config) {
    redirect("/trackers/meal-planner/setup");
  }
  const session = await auth();
  const accessToken = session!.accessToken!;
  const googleSub = session!.googleSub!;

  const targetWeekId = isoWeekId(nextWeekStart());

  // Has a plan (draft or accepted) already been generated for next week?
  const layout = await ensureAtomicTrackerLayout(accessToken, {
    googleSub,
    appVersion: APP_VERSION,
  });
  let existingDraftId: string | null = null;
  const mealsFolderId = layout.folderIds["history/meals"];
  if (mealsFolderId) {
    existingDraftId =
      (await findFile(accessToken, `${targetWeekId}.draft.json`, mealsFolderId)) ||
      (await findFile(accessToken, `${targetWeekId}.json`, mealsFolderId));
  }

  return (
    <AppShell
      title="Weekly Meal Planner"
      subtitle={`Updated ${formatRelative(config.updatedAt)}`}
      backHref="/trackers"
      rightSlot={
        <Link
          href="/trackers/meal-planner/setup"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Edit
        </Link>
      }
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Configuration
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row
            label="Diet"
            value={
              [
                ...config.diets.map((id) => labelFor(ALL_DIETS, id)),
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
                  labelFor(HEALTH_OPTIONS, id),
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
                  labelFor(COMMON_ALLERGIES, id),
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
                ...config.cuisines.map((id) => labelFor(CUISINES, id)),
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
            label="Mealtimes"
            value={`${config.mealtimes.breakfast} · ${config.mealtimes.lunch} · ${config.mealtimes.dinner}`}
          />
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {targetWeekId}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Generates 7 dinners using your saved AI key.
        </p>
        {existingDraftId ? (
          <Link
            href={`/trackers/meal-planner/plan?week=${targetWeekId}`}
            className="mt-4 block w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            View this week&apos;s plan →
          </Link>
        ) : null}
        <div className="mt-4">
          <GenerateClient googleSub={googleSub} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Prep check-in
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Sunday flow — mark the dinners you&apos;ve prepped and add
          breakfast/lunch. We&apos;ll schedule them on your Calendar.
        </p>
        <Link
          href="/trackers/meal-planner/prep"
          className="mt-4 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Open prep check-in →
        </Link>
      </section>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="text-right text-xs text-slate-900 dark:text-slate-100">{value}</dd>
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
