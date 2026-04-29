import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

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
          <p className="text-xs text-slate-500">Routine, nutrition, hormonal balance</p>
        </div>
      </header>

      <section className="mt-12 flex-1">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">
          Routine timing. Nutrient absorption. Whole-day balance.
        </h2>
        <p className="mt-4 text-slate-600">
          AtomicTracker plans your week around meals, supplements, and habits
          that actually move your health markers. Built for men and women
          managing thyroid, hair loss, fatigue, hormonal balance — and anyone
          who wants their day to actually fit together.
        </p>

        <ul className="mt-8 space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              1
            </span>
            Weekly meal plan (B/L/D + optional snacks) tuned to your body, goal, and symptoms
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              2
            </span>
            Supplement scheduler that respects timing — empty-stomach, 2-h gaps from iron / calcium
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              3
            </span>
            Daily habit checklist with streaks for soaked nuts, seed cycling, fruit, water, sleep
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              4
            </span>
            All your data lives in your own Google Drive — your AI key stays encrypted and yours.
          </li>
        </ul>
      </section>

      <footer className="mt-10 space-y-4">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
          >
            <GoogleMark />
            Sign in with Google
          </button>
        </form>
        <p className="text-center text-xs text-slate-400">
          We request Drive (file-scoped) and Calendar permissions only.
        </p>
        <p className="text-center text-[11px] text-slate-400">
          Open source · MIT ·{" "}
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

function GoogleMark() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      className="rounded-sm bg-white p-0.5"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
