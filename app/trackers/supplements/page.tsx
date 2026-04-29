import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { readSupplementConfig } from "./actions";
import { readMealPlannerConfig } from "../meal-planner/actions";
import { computeDailySchedule } from "@/lib/tracker/supplement-rules";
import { SupplementsClient } from "./SupplementsClient";

export default async function SupplementsPage() {
  const [config, mealConfig] = await Promise.all([
    readSupplementConfig(),
    readMealPlannerConfig(),
  ]);

  if (!config || config.supplements.length === 0) {
    redirect("/trackers/supplements/setup");
  }

  // Borrow mealtimes from the meal planner config when available; fall back
  // to sensible defaults so the supplements tracker is usable standalone.
  const mealtimes = {
    breakfast: mealConfig?.mealtimes?.breakfast ?? "08:00",
    lunch: mealConfig?.mealtimes?.lunch ?? "12:30",
    dinner: mealConfig?.mealtimes?.dinner ?? "19:00",
    bedtime: "22:30",
  };

  const schedule = computeDailySchedule(config.supplements, mealtimes);

  return (
    <AppShell
      title="Supplements"
      subtitle={`${config.supplements.length} item${config.supplements.length === 1 ? "" : "s"} · daily schedule`}
      backHref="/trackers"
    >
      <SupplementsClient
        config={config}
        schedule={schedule}
        mealtimes={mealtimes}
      />
    </AppShell>
  );
}
