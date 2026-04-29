import Link from "next/link";
import { redirect } from "next/navigation";
import { readMealPlannerConfig } from "./actions";
import {
  ALL_DIETS,
  COMMON_ALLERGIES,
  CUISINES,
  HEALTH_OPTIONS,
} from "@/lib/tracker/meal-planner-defaults";

function labelFor(options: { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

export default async function MealPlannerHomePage() {
  const config = await readMealPlannerConfig();
  if (!config) {
    redirect("/trackers/meal-planner/setup");
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 py-10">
      <header className="flex items-center gap-3">
        <Link
          href="/trackers"
          aria-label="Back to trackers"
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          ←
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Weekly Meal Planner
          </h1>
          <p className="text-xs text-slate-500">
            Updated {formatRelative(config.updatedAt)}
          </p>
        </div>
        <Link
          href="/trackers/meal-planner/setup"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </Link>
      </header>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Next week
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Plan generation arrives in commit 6.
        </p>
        <button
          type="button"
          disabled
          className="mt-4 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white opacity-50 disabled:cursor-not-allowed"
        >
          Generate next week (commit 6)
        </button>
      </section>

      <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Phase 1 wrap-up</p>
        <p className="mt-2">
          Commit 5 (this one) saves your config. Commits 6-8 wire up plan
          generation, review/swap UI, acceptance flow that writes the grocery
          CSV and Calendar reminders, and the Sunday prep check-in.
        </p>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-right text-xs text-slate-900">{value}</dd>
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
