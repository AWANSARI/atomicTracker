import { AppShell } from "@/components/AppShell";
import { readSupplementConfig } from "../actions";
import { SupplementWizard } from "./SupplementWizard";

export default async function SupplementsSetupPage() {
  const existing = await readSupplementConfig();
  return (
    <AppShell
      title={existing && existing.supplements.length > 0 ? "Edit supplements" : "Set up Supplements"}
      subtitle="Pick your supplements"
      backHref={existing && existing.supplements.length > 0 ? "/trackers/supplements" : "/trackers"}
    >
      <SupplementWizard initialConfig={existing} />
    </AppShell>
  );
}
