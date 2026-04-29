import { auth, signOut } from "@/auth";

export default async function DashboardPage() {
  // The layout already guards this; auth() will return a session here.
  const session = await auth();
  const user = session!.user!;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm"
          >
            A
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              AtomicTracker
            </h1>
            <p className="text-xs text-slate-500">Dashboard</p>
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

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="h-12 w-12 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-base font-semibold text-brand-700">
              {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Connections
        </h2>
        <ul className="mt-3 space-y-2">
          <ConnectionRow label="Google account" status="connected" />
          <ConnectionRow
            label="Drive (drive.file scope)"
            status="connected"
            note="Pending — folder bootstrap in commit 3"
          />
          <ConnectionRow
            label="Calendar (calendar.events)"
            status="connected"
            note="Pending — used by Friday/Sunday reminders in commit 5"
          />
          <ConnectionRow
            label="AI provider"
            status="not-connected"
            note="Wizard arrives in commit 4"
          />
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-900">What&apos;s next</p>
        <p className="mt-2">
          Phase 1 is being built in five commits — see{" "}
          <a
            href="https://github.com/AWANSARI/atomicTracker/blob/main/PLAN.md"
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            PLAN.md
          </a>
          . You&apos;re looking at the end of commit 2: Google sign-in is wired
          and Drive + Calendar permissions are granted on your account. Commit
          3 brings the Drive folder bootstrap and the encrypted connectors
          store.
        </p>
      </section>
    </main>
  );
}

function ConnectionRow({
  label,
  status,
  note,
}: {
  label: string;
  status: "connected" | "not-connected";
  note?: string;
}) {
  const isConnected = status === "connected";
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
          isConnected ? "bg-emerald-500" : "bg-slate-300"
        }`}
        aria-hidden
      >
        {isConnected ? "✓" : "—"}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {note ? <p className="mt-0.5 text-xs text-slate-500">{note}</p> : null}
      </div>
    </li>
  );
}
