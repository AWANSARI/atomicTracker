import Link from "next/link";
import { auth, signOut } from "@/auth";
import { PassphraseSection } from "./PassphraseSection";
import { ConnectorWizard } from "./ConnectorWizard";
import { DataExport } from "./DataExport";

export default async function SettingsPage() {
  const session = await auth();
  const user = session!.user!;
  const googleSub = session!.googleSub!;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            ←
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </form>
      </header>

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
        title="Other connectors"
        description="Telegram, OpenClaw, Claude Routine — wizards arrive in later commits."
      >
        <p className="text-sm text-slate-500">Nothing connected yet.</p>
      </Section>

      <Section
        title="Data"
        description="Your data lives in your Google Drive at /AtomicTracker. Download a zip mirror anytime."
      >
        <DataExport />
      </Section>
    </main>
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
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <span className="text-xs text-slate-600">{label}</span>
      <span className="text-xs font-medium text-slate-900">{value}</span>
    </div>
  );
}
