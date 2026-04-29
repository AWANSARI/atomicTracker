import { auth } from "@/auth";
import { ensureAtomicTrackerLayout, findFile, readJson } from "@/lib/google/drive";
import {
  isoWeekId,
  nextWeekStart,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
import { PlanClient } from "./PlanClient";
import { AppShell } from "@/components/AppShell";
import { readMealPlannerConfig } from "../actions";

const APP_VERSION = "0.1.0";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await auth();
  const accessToken = session!.accessToken!;
  const googleSub = session!.googleSub!;

  const weekId = searchParams.week ?? isoWeekId(nextWeekStart());

  const [layout, config] = await Promise.all([
    ensureAtomicTrackerLayout(accessToken, {
      googleSub,
      appVersion: APP_VERSION,
    }),
    readMealPlannerConfig(),
  ]);
  const mealsFolderId = layout.folderIds["history/meals"];

  let plan: MealPlan | null = null;
  if (mealsFolderId) {
    const draftId =
      (await findFile(accessToken, `${weekId}.draft.json`, mealsFolderId)) ||
      (await findFile(accessToken, `${weekId}.json`, mealsFolderId));
    if (draftId) {
      try {
        plan = await readJson<MealPlan>(accessToken, draftId);
      } catch {
        plan = null;
      }
    }
  }

  return (
    <AppShell
      title={weekId}
      subtitle={
        plan
          ? `${plan.weekStart} → ${plan.weekEnd} · ${plan.status === "draft" ? "Draft" : "Accepted"}`
          : "No plan yet"
      }
      backHref="/trackers/meal-planner"
    >
      {!plan ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <p>
            No plan generated for this week yet. Go back and tap{" "}
            <em>Generate next week</em>.
          </p>
        </section>
      ) : (
        <PlanClient
          initialPlan={plan}
          googleSub={googleSub}
          initialFavoriteMeals={config?.favoriteMeals ?? []}
        />
      )}
    </AppShell>
  );
}
