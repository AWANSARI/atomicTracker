import { readHabitConfig } from "../actions";
import { HabitsWizard } from "./HabitsWizard";
import { AppShell } from "@/components/AppShell";

export default async function HabitsSetupPage() {
  const existing = await readHabitConfig();

  return (
    <AppShell
      title={existing ? "Edit habits" : "Set up Habit Tracker"}
      subtitle="Pick your daily non-negotiables"
      backHref={existing ? "/trackers/habits" : "/trackers"}
    >
      <HabitsWizard initialConfig={existing} />
    </AppShell>
  );
}
