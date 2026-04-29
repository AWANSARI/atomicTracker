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
}: {
  plan: MealPlan;
  mealtimes: { breakfast: string; lunch: string; dinner: string };
  initialPrepped: string[];
}) {
  const [prepped, setPrepped] = useState<Set<Day>>(
    new Set(initialPrepped.filter((d): d is Day => true) as Day[]),
  );
  const [breakfast, setBreakfast] = useState("");
  const [lunch, setLunch] = useState("");
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
      <section className="mt-8 space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          ✓ Done. Your meals are on the Calendar for this week.
        </div>
        {result.events?.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
            <p className="font-semibold uppercase tracking-wide text-slate-500">
              Calendar events created
            </p>
            <ul className="mt-2 space-y-1">
              {result.events.map((ev, i) => (
                <li
                  key={i}
                  className={`flex items-center justify-between rounded-lg p-2 ${
                    ev.ok
                      ? "border border-slate-200 bg-white"
                      : "border border-red-200 bg-red-50"
                  }`}
                >
                  <span className={ev.ok ? "text-slate-700" : "text-red-900"}>
                    {ev.ok ? "✓" : "✗"} {ev.name}
                  </span>
                  {ev.ok && ev.htmlLink ? (
                    <a
                      href={ev.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-700 hover:underline"
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
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <p className="text-slate-700">
          Mark which dinners you&apos;ve prepped for the week ahead. We&apos;ll
          schedule them on your Calendar at{" "}
          <span className="font-medium">{mealtimes.dinner}</span> on each day.
        </p>
        <div className="mt-3 flex gap-2 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
          >
            All prepped
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
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
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                  on
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
                    on
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-300 bg-white text-slate-300"
                  }`}
                  aria-hidden
                >
                  {on ? "✓" : ""}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {m.day} · {m.cuisine}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                    {m.name}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-900">
          Anything else you prepped?
        </p>
        <p className="text-xs text-slate-500">
          Optional. If you cooked or batched a breakfast or lunch, we&apos;ll
          schedule it Mon–Fri at your configured times.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            Breakfast (Mon–Fri at {mealtimes.breakfast})
          </span>
          <input
            type="text"
            value={breakfast}
            onChange={(e) => setBreakfast(e.target.value)}
            placeholder="e.g. Overnight oats with chia"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            Lunch (Mon–Fri at {mealtimes.lunch})
          </span>
          <input
            type="text"
            value={lunch}
            onChange={(e) => setLunch(e.target.value)}
            placeholder="e.g. Quinoa salad meal-prep"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? "Adding to your Calendar…"
          : `Schedule ${prepped.size} dinner${prepped.size === 1 ? "" : "s"}${
              breakfast.trim() ? " + breakfasts" : ""
            }${lunch.trim() ? " + lunches" : ""}`}
      </button>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900">
          {error}
        </p>
      ) : null}
    </section>
  );
}
