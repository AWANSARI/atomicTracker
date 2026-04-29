"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, RefreshCw, Square } from "lucide-react";
import type {
  Habit,
  HabitDayLog,
  HabitWeekday,
} from "@/lib/tracker/habit-types";
import {
  computeHabitStats,
  isExpectedOn,
} from "@/lib/tracker/habit-stats";

type Props = {
  habits: Habit[];
  today: string; // YYYY-MM-DD
  todayLog: HabitDayLog | null;
  history: HabitDayLog[];
  remindersEnabled: boolean;
};

const WEEKDAY_FROM_INT: Record<number, HabitWeekday> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

export function HabitsClient({
  habits,
  today,
  todayLog,
  history,
  remindersEnabled,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Optimistic done-set for today.
  const [done, setDone] = useState<Set<string>>(
    () => new Set(todayLog?.done ?? []),
  );

  // Build today's expected-or-not lookup so we can mark non-expected habits
  // as a soft "rest day" rather than an unchecked obligation.
  const todayDate = useMemo(() => {
    const [y, m, d] = today.split("-").map((p) => parseInt(p, 10));
    return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  }, [today]);

  // Last 7 days of dates (oldest → newest, i.e. left-to-right).
  const last7 = useMemo(() => {
    const out: { date: string; weekday: HabitWeekday }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDate);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      out.push({
        date: iso,
        weekday: WEEKDAY_FROM_INT[d.getUTCDay()] ?? "Mon",
      });
    }
    return out;
  }, [todayDate]);

  const historyByDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const log of history) map.set(log.date, new Set(log.done));
    // Apply optimistic state for today
    map.set(today, done);
    return map;
  }, [history, today, done]);

  async function toggle(habitId: string, nextDone: boolean) {
    // Optimistic update
    setError(null);
    setDone((cur) => {
      const next = new Set(cur);
      if (nextDone) next.add(habitId);
      else next.delete(habitId);
      return next;
    });
    try {
      const res = await fetch("/api/habits/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, habitId, done: nextDone }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      // Roll back on error.
      setDone((cur) => {
        const next = new Set(cur);
        if (nextDone) next.delete(habitId);
        else next.add(habitId);
        return next;
      });
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function syncReminders() {
    setSyncMessage(null);
    setError(null);
    setSyncing(true);
    try {
      const tz =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch("/api/habits/setup-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: { ok: boolean }[];
        deleted?: unknown[];
        remindersEnabled?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const okCount = data.created?.filter((c) => c.ok).length ?? 0;
      const delCount = data.deleted?.length ?? 0;
      setSyncMessage(
        data.remindersEnabled === false
          ? `Reminders cleared (${delCount} removed).`
          : `Synced ${okCount} reminder${okCount === 1 ? "" : "s"}${delCount > 0 ? ` · cleared ${delCount} old` : ""}.`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  if (habits.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
          No habits configured yet
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Add a few from the catalog to get started.
        </p>
        <Link
          href="/trackers/habits/setup"
          className="mt-4 inline-flex rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          Set up habits
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Today's checklist — fridge-sheet vibe: one row per habit, big tap target */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-baseline justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Today
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {today}
          </span>
        </header>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {habits.map((h) => {
            const expected = isExpectedOn(h, todayDate);
            const isDone = done.has(h.id);
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => toggle(h.id, !isDone)}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                    !expected ? "opacity-60" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`shrink-0 ${
                      isDone
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {isDone ? (
                      <CheckSquare className="h-6 w-6" />
                    ) : (
                      <Square className="h-6 w-6" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`truncate text-sm font-medium ${
                        isDone
                          ? "text-slate-500 line-through dark:text-slate-500"
                          : "text-slate-900 dark:text-slate-50"
                      }`}
                    >
                      {h.name}
                    </p>
                    {!expected ? (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        Not expected today (rest day)
                      </p>
                    ) : null}
                  </div>
                  {h.cadence !== "daily" ? (
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      {cadenceLabel(h)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Per-habit streaks */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Streaks
        </h2>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {habits.map((h) => {
            const stats = computeHabitStats(h, history);
            return (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-slate-900 dark:text-slate-100">
                  {h.name}
                </span>
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {stats.currentStreak}
                  </span>{" "}
                  current ·{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {stats.longestStreak}
                  </span>{" "}
                  best ·{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {stats.weeklyCompletion}%
                  </span>{" "}
                  / 7d
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Last 7 days dot grid */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Last 7 days
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full table-fixed text-[11px]">
            <thead>
              <tr>
                <th className="w-1/3 text-left font-medium text-slate-500 dark:text-slate-400">
                  Habit
                </th>
                {last7.map((d) => (
                  <th
                    key={d.date}
                    className="px-1 text-center font-medium text-slate-500 dark:text-slate-400"
                    title={d.date}
                  >
                    {d.weekday.slice(0, 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => (
                <tr key={h.id}>
                  <td className="truncate py-1 text-slate-900 dark:text-slate-100">
                    {h.name}
                  </td>
                  {last7.map((d) => {
                    const dateObj = (() => {
                      const [y, m, day] = d.date.split("-").map((p) =>
                        parseInt(p, 10),
                      );
                      return new Date(
                        Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1),
                      );
                    })();
                    const expected = isExpectedOn(h, dateObj);
                    const log = historyByDate.get(d.date);
                    const wasDone = log ? log.has(h.id) : false;
                    let cellClass: string;
                    if (!expected) {
                      cellClass =
                        "h-5 w-5 rounded-full border border-dashed border-slate-300 dark:border-slate-700";
                    } else if (wasDone) {
                      cellClass =
                        "h-5 w-5 rounded-full bg-emerald-500 dark:bg-emerald-500";
                    } else {
                      cellClass =
                        "h-5 w-5 rounded-full border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800";
                    }
                    return (
                      <td key={d.date} className="px-1 py-1 text-center">
                        <span
                          aria-hidden
                          className={`mx-auto block ${cellClass}`}
                          title={`${h.name} · ${d.date} · ${
                            !expected ? "not expected" : wasDone ? "done" : "missed"
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
          Filled = done · empty = missed · dashed = rest day
        </p>
      </section>

      {/* Reminders sync */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Reminders
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {remindersEnabled
            ? "Calendar reminders are enabled. Tap below to refresh after editing habits."
            : "Calendar reminders are off. Toggle them on in setup, then tap below to clean up any old ones."}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={syncReminders}
            disabled={syncing || pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Syncing…" : "Sync reminders"}
          </button>
          {syncMessage ? (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              {syncMessage}
            </span>
          ) : null}
        </div>
      </section>

      <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
        Today saves to /AtomicTracker/history/habits/{today}.json on your Drive.
      </p>
    </div>
  );
}

function cadenceLabel(h: Habit): string {
  switch (h.cadence) {
    case "daily":
      return "daily";
    case "weekdays":
      return "Mon-Fri";
    case "weekly":
      return h.weeklyDay ? `weekly · ${h.weeklyDay}` : "weekly";
    case "custom":
      return h.customDays && h.customDays.length > 0
        ? h.customDays.join("/")
        : "custom";
  }
}

