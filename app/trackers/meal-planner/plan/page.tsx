import Link from "next/link";
import { auth } from "@/auth";
import { ensureAtomicTrackerLayout, findFile, readJson } from "@/lib/google/drive";
import {
  isoWeekId,
  nextWeekStart,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
import { PlanClient } from "./PlanClient";

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

  const layout = await ensureAtomicTrackerLayout(accessToken, {
    googleSub,
    appVersion: APP_VERSION,
  });
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
    <main className="mx-auto min-h-dvh max-w-md px-6 py-10">
      <header className="flex items-center gap-3">
        <Link
          href="/trackers/meal-planner"
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          ←
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{weekId}</h1>
          <p className="text-xs text-slate-500">
            {plan
              ? `${plan.weekStart} → ${plan.weekEnd} · ${
                  plan.status === "draft" ? "Draft" : "Accepted"
                }`
              : "No plan yet"}
          </p>
        </div>
      </header>

      {!plan ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <p>
            No plan generated for this week yet. Go back and tap{" "}
            <em>Generate next week</em>.
          </p>
        </section>
      ) : (
        <PlanClient initialPlan={plan} googleSub={googleSub} />
      )}
    </main>
  );
}
