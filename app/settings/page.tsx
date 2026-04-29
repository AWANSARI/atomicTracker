import { auth, signOut } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { PassphraseSection } from "./PassphraseSection";
import { ConnectorWizard } from "./ConnectorWizard";
import { YouTubeKeySection } from "./YouTubeKeySection";
import { TelegramSection } from "./TelegramSection";
import { DataExport } from "./DataExport";
import { ArchiveSection } from "./ArchiveSection";
import { RoutineSection } from "./RoutineSection";

export default async function SettingsPage() {
  const session = await auth();
  const user = session!.user!;
  const googleSub = session!.googleSub!;

  return (
    <AppShell
      title="Settings"
      subtitle={user.email ?? undefined}
      backHref="/dashboard"
      rightSlot={
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </form>
      }
    >
      <Section
        title="Encryption passphrase"
        description="Used to encrypt your AI provider keys before they're saved to your Drive. The passphrase never leaves your browser."
      >
        <PassphraseSection googleSub={googleSub} />
      </Section>

      <Section
        title="Reminder times"
        description="Default reminder times for the Friday plan and Sunday prep check-in. Editable in commit 5."
      >
        <div className="space-y-2 text-sm">
          <Row label="Friday plan reminder" value="6:00 PM (your timezone)" />
          <Row label="Sunday prep check-in" value="6:00 PM (your timezone)" />
          <Row label="Breakfast" value="8:00 AM" />
          <Row label="Lunch" value="12:30 PM" />
          <Row label="Dinner" value="7:00 PM" />
        </div>
      </Section>

      <Section
        title="AI provider"
        description="Pick Claude, OpenAI, or Gemini. Your key is encrypted with the passphrase above before it's written to your Drive."
      >
        <ConnectorWizard googleSub={googleSub} />
      </Section>

      <Section
        title="YouTube (recipe videos)"
        description="Optional. Looks up a specific recommended recipe video for each meal."
      >
        <YouTubeKeySection googleSub={googleSub} />
      </Section>

      <Section
        title="Telegram bot"
        description="Optional. Receive AtomicTracker nudges directly in Telegram (e.g. plan-accepted, prep-due). Outbound only — bot commands are not yet supported."
      >
        <TelegramSection googleSub={googleSub} />
      </Section>

      <Section
        title="Other connectors"
        description="OpenClaw, Claude Routine — wizards arrive in later commits."
      >
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nothing else connected yet.
        </p>
      </Section>

      <Section
        title="Data"
        description="Your data lives in your Google Drive at /AtomicTracker. Download a zip mirror anytime."
      >
        <DataExport />
      </Section>

      <Section
        title="Yearly archive"
        description="Generate a single XLSX with every accepted plan from a chosen year. Auto-runs once on the first accept of each new year; rebuild on demand here."
      >
        <ArchiveSection />
      </Section>

      <Section
        title="Claude Code Routine"
        description="Schedule weekly meal-plan generation from a Claude Code Routine (or any external scheduler). Mints an opaque dispatch URL you paste into the routine config — no live session needed."
      >
        <RoutineSection />
      </Section>
    </AppShell>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
      <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}
