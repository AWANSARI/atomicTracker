import Link from "next/link";
import { readMealPlannerConfig } from "../actions";
import { MealPlannerWizard } from "./MealPlannerWizard";

export default async function MealPlannerSetupPage() {
  const existing = await readMealPlannerConfig();

  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 py-10">
      <header className="flex items-center gap-3">
        <Link
          href={existing ? "/trackers/meal-planner" : "/trackers"}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          ←
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {existing ? "Edit configuration" : "Set up Weekly Meal Planner"}
          </h1>
          <p className="text-xs text-slate-500">8 quick steps</p>
        </div>
      </header>

      <MealPlannerWizard initialConfig={existing} />
    </main>
  );
}
