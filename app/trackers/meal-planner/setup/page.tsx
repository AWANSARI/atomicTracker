import { readMealPlannerConfig } from "../actions";
import { MealPlannerWizard } from "./MealPlannerWizard";
import { AppShell } from "@/components/AppShell";

export default async function MealPlannerSetupPage() {
  const existing = await readMealPlannerConfig();

  return (
    <AppShell
      title={existing ? "Edit configuration" : "Set up Weekly Meal Planner"}
      subtitle="12 quick steps"
      backHref={existing ? "/trackers/meal-planner" : "/trackers"}
    >
      <MealPlannerWizard initialConfig={existing} />
    </AppShell>
  );
}
