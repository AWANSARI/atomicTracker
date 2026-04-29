import Link from "next/link";

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ?? "Unknown";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600">
        <span aria-hidden className="text-xl">!</span>
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Sign-in didn&apos;t complete
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Google reported an error: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{error}</code>
      </p>
      <p className="mt-6 max-w-sm text-sm text-slate-500">
        Common causes: redirect URI mismatch in Google Cloud Console, or the
        OAuth consent screen blocking your account. Check the README&apos;s
        Google OAuth section.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
      >
        Try again
      </Link>
    </main>
  );
}
