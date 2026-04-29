import Link from "next/link";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
} from "@/lib/google/drive";
import {
  isoWeekId,
  nextWeekStart,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
import { readMealPlannerConfig } from "../actions";
import { PrepClient } from "./PrepClient";
import { AppShell } from "@/components/AppShell";

const APP_VERSION = "0.1.0";

async function findLatestAcceptedPlan(
  accessToken: string,
  mealsFolderId: string,
): Promise<MealPlan | null> {
  // Walk backward up to 4 weeks looking for an accepted plan
  const start = new Date();
  for (let offset = 0; offset <= 28; offset += 7) {
    const probe = new Date(start);
    probe.setUTCDate(start.getUTCDate() + 7 - offset);
    const weekId = isoWeekId(probe);
    const id = await findFile(accessToken, `${weekId}.json`, mealsFolderId);
    if (id) {
      try {
        return await readJson<MealPlan>(accessToken, id);
      } catch {
        // ignore, continue
      }
    }
  }
  return null;
}

export default async function PrepPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await auth();
  const accessToken = session!.accessToken!;
  const googleSub = session!.googleSub!;

  const layout = await ensureAtomicTrackerLayout(accessToken, {
    googleSub,
    appVersion: APP_VERSION,
  });
  const mealsFolderId = layout.folderIds["history/meals"];

  let plan: MealPlan | null = null;
  if (mealsFolderId) {
    if (searchParams.week) {
      const id = await findFile(
        accessToken,
        `${searchParams.week}.json`,
        mealsFolderId,
      );
      if (id) {
        plan = await readJson<MealPlan>(accessToken, id).catch(() => null);
      }
    } else {
      plan = await findLatestAcceptedPlan(accessToken, mealsFolderId);
    }
  }

  // Read existing prep state if any (lets the user revisit and update)
  let existingPrep: { prepped: string[] } | null = null;
  if (plan && mealsFolderId) {
    const prepFileId = await findFile(
      accessToken,
      `${plan.weekId}-prep.json`,
      mealsFolderId,
    );
    if (prepFileId) {
      existingPrep = await readJson<{ prepped: string[] }>(
        accessToken,
        prepFileId,
      ).catch(() => null);
    }
  }

  const config = await readMealPlannerConfig();

  return (
    <AppShell
      title="Prep check-in"
      subtitle={
        plan
          ? `${plan.weekId} · ${plan.weekStart} → ${plan.weekEnd}`
          : "No accepted plan found"
      }
      backHref="/trackers/meal-planner"
    >
      {!plan ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <p>
            No accepted plan to check in against. Generate and accept a plan
            first from the tracker home.
          </p>
          <Link
            href="/trackers/meal-planner"
            className="mt-3 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Go to tracker
          </Link>
        </section>
      ) : !config ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <p>
            Meal planner config missing — that&apos;s odd. Re-save your config
            and try again.
          </p>
          <Link
            href="/trackers/meal-planner/setup"
            className="mt-3 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Open config
          </Link>
        </section>
      ) : (
        <PrepClient
          plan={plan}
          mealtimes={config.mealtimes}
          initialPrepped={existingPrep?.prepped ?? []}
          defaultBreakfast={config.defaultBreakfast ?? ""}
          defaultLunch={config.defaultLunch ?? ""}
        />
      )}
    </AppShell>
  );
}
