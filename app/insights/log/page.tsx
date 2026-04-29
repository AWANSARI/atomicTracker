import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { readAnalyticsLog } from "../actions";
import { InsightsLogClient } from "../InsightsLogClient";

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function InsightsLogPage() {
  const today = todayIso();
  const [config, existing] = await Promise.all([
    readMealPlannerConfig(),
    readAnalyticsLog(today),
  ]);

  if (!config) {
    // Logging without a config is fine, but the symptom-gated fields rely on
    // it. Bounce to setup so the user gets the full UI on return.
    redirect("/trackers/meal-planner/setup");
  }

  // Decide whether to show hair-fall + cycle inputs based on saved symptoms /
  // sex. These are cheap UI gates — the API accepts them either way.
  const symptoms = config.symptoms ?? [];
  const showHair = symptoms.includes("hair-loss");
  const showCycle =
    symptoms.includes("irregular-cycle") || config.sex === "female";

  return (
    <AppShell
      title="Daily log"
      subtitle={today}
      backHref="/insights"
    >
      <InsightsLogClient
        date={today}
        existing={existing}
        showHair={showHair}
        showCycle={showCycle}
      />
    </AppShell>
  );
}
