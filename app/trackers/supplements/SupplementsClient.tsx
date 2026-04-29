"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BellRing,
  Check,
  Clock,
  Pencil,
  Pill,
} from "lucide-react";
import type { SupplementConfig } from "@/lib/tracker/supplement-types";
import { hintLabel, type TimelineSlot } from "@/lib/tracker/supplement-rules";

export function SupplementsClient({
  config,
  schedule,
  mealtimes,
}: {
  config: SupplementConfig;
  schedule: TimelineSlot[];
  mealtimes: { breakfast: string; lunch: string; dinner: string; bedtime?: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reminderState, setReminderState] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "ok"; created: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [taken, setTaken] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function todayKey(slot: TimelineSlot, idx: number): string {
    return `${slot.supplementId}__${idx}`;
  }

  async function markTaken(slot: TimelineSlot, idx: number) {
    setError(null);
    const key = todayKey(slot, idx);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const takenAt = `${hh}:${mm}`;
    setTaken((t) => ({ ...t, [key]: takenAt }));
    startTransition(async () => {
      try {
        const res = await fetch("/api/supplements/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: today,
            supplementId: slot.supplementId,
            takenAt,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `Log failed (${res.status})`,
          );
        }
      } catch (e) {
        setTaken((t) => {
          const next = { ...t };
          delete next[key];
          return next;
        });
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function setupReminders() {
    setReminderState({ kind: "saving" });
    try {
      const tz =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : "UTC";
      const res = await fetch("/api/supplements/setup-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        created?: { ok: boolean }[];
        error?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `Reminder setup failed (${res.status})`);
      }
      setReminderState({
        kind: "ok",
        created: (body.created ?? []).filter((c) => c.ok).length,
      });
      router.refresh();
    } catch (e) {
      setReminderState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Group slots by hour-band for a vertical timeline feel.
  const groups = useMemo(() => {
    const out: { band: string; slots: { slot: TimelineSlot; idx: number }[] }[] = [];
    let prevBand = "";
    let prevSlots: { slot: TimelineSlot; idx: number }[] = [];
    schedule.forEach((slot, idx) => {
      const band = bandFor(slot.time, mealtimes);
      if (band !== prevBand) {
        if (prevSlots.length) out.push({ band: prevBand, slots: prevSlots });
        prevBand = band;
        prevSlots = [{ slot, idx }];
      } else {
        prevSlots.push({ slot, idx });
      }
    });
    if (prevSlots.length) out.push({ band: prevBand, slots: prevSlots });
    return out;
  }, [schedule, mealtimes]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/trackers/supplements/setup"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit list
        </Link>
        <button
          type="button"
          onClick={setupReminders}
          disabled={reminderState.kind === "saving"}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <BellRing className="h-3.5 w-3.5" />
          {reminderState.kind === "saving" ? "Setting up…" : "Setup reminders"}
        </button>
      </div>

      {reminderState.kind === "ok" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Created {reminderState.created} daily Calendar reminder
          {reminderState.created === 1 ? "" : "s"}.
        </p>
      ) : null}
      {reminderState.kind === "error" ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {reminderState.message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        {groups.map((group) => (
          <div key={group.band} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {group.band}
            </p>
            <ul className="space-y-2">
              {group.slots.map(({ slot, idx }) => {
                const key = todayKey(slot, idx);
                const isTaken = Boolean(taken[key]);
                return (
                  <li
                    key={key}
                    className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        aria-hidden
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-300"
                      >
                        <Pill className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {slot.supplementName}
                          </p>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <Clock className="h-3 w-3" />
                            {slot.time}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {hintLabel(slot.hint)}
                        </p>
                        {slot.warnings.length > 0 ? (
                          <ul className="mt-2 space-y-1">
                            {slot.warnings.map((w, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                              >
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="mt-2 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => markTaken(slot, idx)}
                            disabled={isTaken || pending}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
                              isTaken
                                ? "border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "border border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-950/60"
                            }`}
                          >
                            <Check className="h-3 w-3" />
                            {isTaken ? `Taken at ${taken[key]}` : "Mark taken"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
        Schedule is computed from your supplement timing rules. Changes save
        instantly to your Drive.
      </p>

      <div className="text-center text-[11px] text-slate-400 dark:text-slate-500">
        Updated {new Date(config.updatedAt).toLocaleDateString()}
      </div>
    </div>
  );
}

function bandFor(
  hhmm: string,
  m: { breakfast: string; lunch: string; dinner: string; bedtime?: string },
): string {
  const t = toMin(hhmm);
  const b = toMin(m.breakfast);
  const l = toMin(m.lunch);
  const d = toMin(m.dinner);
  if (t < b - 30) return "Early morning";
  if (t < b + 60) return "Breakfast";
  if (t < l - 30) return "Mid-morning";
  if (t < l + 60) return "Lunch";
  if (t < d - 30) return "Afternoon";
  if (t < d + 60) return "Dinner";
  return "Evening";
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}
