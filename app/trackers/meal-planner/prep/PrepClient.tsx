"use client";

import { useState } from "react";
import type { Day, MealPlan } from "@/lib/tracker/meal-planner-plan";

type SubmitResult = {
  ok: boolean;
  events?: { name: string; ok: boolean; htmlLink?: string; error?: string }[];
};

export function PrepClient({
  plan,
  mealtimes,
  initialPrepped,
  defaultBreakfast,
  defaultLunch,
}: {
  plan: MealPlan;
  mealtimes: { breakfast: string; lunch: string; dinner: string };
  initialPrepped: string[];
  defaultBreakfast?: string;
  defaultLunch?: string;
}) {
  const [prepped, setPrepped] = useState<Set<Day>>(
    new Set(initialPrepped.filter((d): d is Day => true) as Day[]),
  );
  const [breakfast, setBreakfast] = useState(defaultBreakfast ?? "");
  const [lunch, setLunch] = useState(defaultLunch ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(day: Day) {
    setPrepped((s) => {
      const next = new Set(s);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function selectAll() {
    setPrepped(new Set(plan.meals.map((m) => m.day)));
  }
  function clearAll() {
    setPrepped(new Set());
  }

  async function submit() {
    setError(null);
    setPending(true);
    setResult(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch("/api/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId: plan.weekId,
          prepped: Array.from(prepped),
          breakfast: breakfast.trim() || undefined,
          lunch: lunch.trim() || undefined,
          timezone: tz,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      const data = (await res.json()) as SubmitResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (result?.ok) {
    return (
      <section className="space-y-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Done. Your meals are on the Calendar for this week.
        </div>
        {result.events?.length ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Calendar events created
            </p>
            <ul className="mt-2 space-y-1">
              {result.events.map((ev, i) => (
                <li
                  key={i}
                  className={`flex items-center justify-between rounded-md p-2 ${
                    ev.ok
                      ? "border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                      : "border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
                  }`}
                >
                  <span className={ev.ok ? "text-slate-700 dark:text-slate-300" : "text-red-900 dark:text-red-300"}>
                    {ev.ok ? "✓" : "✗"} {ev.name}
                  </span>
                  {ev.ok && ev.htmlLink ? (
                    <a
                      href={ev.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Open ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-700 dark:text-slate-300">
          Mark which dinners you&apos;ve prepped for the week ahead. We&apos;ll
          schedule them on your Calendar at{" "}
          <span className="font-medium">{mealtimes.dinner}</span> on each day.
        </p>
        <div className="mt-3 flex gap-2 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            All prepped
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            None
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {plan.meals.map((m) => {
          const on = prepped.has(m.day);
          return (
            <li key={m.day}>
              <button
                type="button"
                onClick={() => toggle(m.day)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  on
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
                    on
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-300 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-700"
                  }`}
                  aria-hidden
                >
                  {on ? "✓" : ""}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {m.day} · {m.cuisine}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {m.name}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Anything else you prepped?
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pre-filled from your defaults. We&apos;ll schedule Mon-Fri at your
          configured times.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Breakfast (Mon–Fri at {mealtimes.breakfast})
          </span>
          <input
            type="text"
            value={breakfast}
            onChange={(e) => setBreakfast(e.target.value)}
            placeholder="e.g. Overnight oats with chia"
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Lunch (Mon–Fri at {mealtimes.lunch})
          </span>
          <input
            type="text"
            value={lunch}
            onChange={(e) => setLunch(e.target.value)}
            placeholder="e.g. Quinoa salad meal-prep"
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? "Adding to your Calendar…"
          : `Schedule ${prepped.size} dinner${prepped.size === 1 ? "" : "s"}${
              breakfast.trim() ? " + breakfasts" : ""
            }${lunch.trim() ? " + lunches" : ""}`}
      </button>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}
