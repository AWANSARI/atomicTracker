import Link from "next/link";
import { Activity, CalendarRange, Check, Minus, MoreHorizontal, UtensilsCrossed } from "lucide-react";
import { auth, signOut } from "@/auth";
import { findFile, readAtomicTrackerLayout } from "@/lib/google/drive";
import { bootstrapDriveFolder } from "./actions";
import { hasMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user!;
  const accessToken = session!.accessToken!;

  // Fast-path read: if user.json exists we're already bootstrapped.
  // Don't auto-bootstrap on every dashboard load — wait for explicit user action
  // so the first-load latency is fast and the bootstrap is observable.
  const layout = await readAtomicTrackerLayout(accessToken);
  const isBootstrapped = layout != null;

  // AI connector: just check the file exists (we don't decrypt server-side).
  let hasAiConnector = false;
  if (layout?.folderIds["config"]) {
    const fileId = await findFile(
      accessToken,
      "connectors.enc.json",
      layout.folderIds["config"],
    );
    hasAiConnector = fileId != null;
  }

  // Tracker: meal-planner config presence
  const mealPlannerConfigured = isBootstrapped
    ? await hasMealPlannerConfig().catch(() => false)
    : false;

  return (
    <AppShell
      title="AtomicTracker"
      subtitle="Routine · nutrition · balance"
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
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
            <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-base font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-100">
              {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{user.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Connections
        </h2>
        <ul className="mt-3 space-y-2">
          <ConnectionRow label="Google account" status="connected" />
          <ConnectionRow
            label="Drive folder /AtomicTracker"
            status={isBootstrapped ? "connected" : "pending"}
            note={
              isBootstrapped
                ? `Bootstrapped ${formatRelative(layout!.bootstrappedAt)} · ${
                    Object.keys(layout!.folderIds).length
                  } folders`
                : "Tap below to create the folder structure on your Drive."
            }
          />
          <ConnectionRow
            label="Calendar"
            status="connected"
            note="Used for plan reminders, prep check-ins, and weekly shopping"
          />
          <ConnectionRow
            label="AI provider"
            status={hasAiConnector ? "connected" : "not-connected"}
            note={
              hasAiConnector
                ? "Encrypted in /config/connectors.enc.json"
                : "Set up in Settings"
            }
          />
        </ul>

        {!isBootstrapped ? (
          <form
            action={async () => {
              "use server";
              await bootstrapDriveFolder();
            }}
            className="mt-4"
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Set up my Drive folder
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
              Creates /AtomicTracker/ with subfolders for config, history,
              grocery, archive, and exports. ~1-2s on first run.
            </p>
          </form>
        ) : (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <p className="font-medium">Drive folder ready.</p>
            <p className="mt-1">
              Open in{" "}
              <a
                href={`https://drive.google.com/drive/folders/${layout!.rootId}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline-offset-2 hover:underline"
              >
                Google Drive ↗
              </a>
            </p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Today
        </h2>
        <Link
          href="/timeline"
          className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600 dark:hover:bg-slate-800"
        >
          <div
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <CalendarRange className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Daily timeline
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Meals, supplements, and habits fused into one chronological day view.
            </p>
          </div>
        </Link>

        <Link
          href="/insights"
          className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600 dark:hover:bg-slate-800"
        >
          <div
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Activity className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Insights
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Patterns from energy, sleep, habits, and meal adherence over the last 4 weeks.
            </p>
          </div>
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Trackers
        </h2>
        <Link
          href={
            mealPlannerConfigured
              ? "/trackers/meal-planner"
              : "/trackers"
          }
          className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600 dark:hover:bg-slate-800"
        >
          <div
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Weekly Meal Planner
              </p>
              {mealPlannerConfigured ? (
                <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Active
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Set up
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {mealPlannerConfigured
                ? "Tap to view config and generate next week"
                : "10-step wizard: diet, health, allergies, cuisines, ingredients, frequency, cheat day, mealtimes"}
            </p>
          </div>
        </Link>
      </section>

    </AppShell>
  );
}

function ConnectionRow({
  label,
  status,
  note,
}: {
  label: string;
  status: "connected" | "pending" | "not-connected";
  note?: string;
}) {
  const Icon =
    status === "connected" ? Check : status === "pending" ? MoreHorizontal : Minus;
  const bg =
    status === "connected"
      ? "bg-emerald-500"
      : status === "pending"
        ? "bg-amber-500"
        : "bg-slate-300 dark:bg-slate-700";
  return (
    <li className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${bg}`}
        aria-hidden
      >
        <Icon className="h-3 w-3" strokeWidth={3} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        {note ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note}</p> : null}
      </div>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
