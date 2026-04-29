import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <header className="flex items-center gap-3">
        <div
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm"
        >
          A
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">AtomicTracker</h1>
          <p className="text-xs text-slate-500">Weekly meal planner</p>
        </div>
      </header>

      <section className="mt-12 flex-1">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">
          Plan your week, your way.
        </h2>
        <p className="mt-4 text-slate-600">
          Sign in with Google, pick an AI of your choice (Claude, ChatGPT, or
          Gemini), and let AtomicTracker write your meal plans, grocery lists,
          and calendar events — all stored in your own Drive.
        </p>

        <ul className="mt-8 space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              1
            </span>
            Sign in with your Google account
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              2
            </span>
            Grant Drive + Calendar access (least-privilege scopes)
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              3
            </span>
            Plug in your AI provider key — guided wizard
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              4
            </span>
            Configure cuisines, diet, health, and frequency. Done.
          </li>
        </ul>
      </section>

      <footer className="mt-10 space-y-4">
        <button
          type="button"
          disabled
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Sign in with Google (coming in commit 2)"
        >
          <span aria-hidden>🔐</span>
          Sign in with Google
        </button>
        <p className="text-center text-xs text-slate-400">
          Auth wires up in commit 2. Currently scaffold-only.
        </p>
        <p className="text-center text-[11px] text-slate-400">
          Open source · MIT · {" "}
          <Link
            href="https://github.com/AWANSARI/atomicTracker"
            className="underline-offset-2 hover:underline"
          >
            github.com/AWANSARI/atomicTracker
          </Link>
        </p>
      </footer>
    </main>
  );
}
