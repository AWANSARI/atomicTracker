"use client";

import { useState } from "react";
import { Bell, RefreshCw } from "lucide-react";

export function RemindersClient({
  hasReminders,
}: {
  hasReminders: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function setupReminders() {
    setError(null);
    setPending(true);
    setDone(false);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch("/api/setup-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={setupReminders}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {hasReminders ? (
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {pending
          ? "Updating Calendar…"
          : hasReminders
            ? "Refresh recurring reminders"
            : "Set up recurring reminders"}
      </button>
      {done ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Done. Friday plan + Sunday prep + weekly shopping reminders are on
          your Calendar.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
