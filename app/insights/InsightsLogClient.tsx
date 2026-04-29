"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  type AnalyticsDayLog,
  type CycleMarker,
  type EnergyScore,
  type HairFallLevel,
  type MoodScore,
  CYCLE_MARKERS,
  CYCLE_LABEL,
  ENERGY_LABEL,
  ENERGY_SCORES,
  HAIR_FALL_LABEL,
  HAIR_FALL_LEVELS,
  MOOD_LABEL,
  MOOD_SCORES,
} from "@/lib/tracker/analytics-types";

type Props = {
  date: string;
  existing: AnalyticsDayLog | null;
  showHair: boolean;
  showCycle: boolean;
};

export function InsightsLogClient({
  date,
  existing,
  showHair,
  showCycle,
}: Props) {
  const router = useRouter();
  const [energy, setEnergy] = useState<EnergyScore | undefined>(existing?.energy);
  const [mood, setMood] = useState<MoodScore | undefined>(existing?.mood);
  const [sleep, setSleep] = useState<number>(existing?.sleepHours ?? 7);
  const [sleepSet, setSleepSet] = useState<boolean>(existing?.sleepHours != null);
  const [hair, setHair] = useState<HairFallLevel | undefined>(existing?.hairFall);
  const [cycle, setCycle] = useState<CycleMarker | undefined>(existing?.cycleMarker);
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        date,
        energy: energy ?? null,
        mood: mood ?? null,
        sleepHours: sleepSet ? sleep : null,
        hairFall: showHair ? hair ?? null : undefined,
        cycleMarker: showCycle ? cycle ?? null : undefined,
        notes: notes.trim().length > 0 ? notes.trim() : null,
      };
      const res = await fetch("/api/analytics/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push("/insights");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Energy */}
      <Section
        title="Energy"
        hint="How energized did you feel today, overall?"
      >
        <div className="grid grid-cols-5 gap-2">
          {ENERGY_SCORES.map((s) => (
            <Chip
              key={s}
              active={energy === s}
              onClick={() => setEnergy(energy === s ? undefined : s)}
              label={`${s}`}
              sub={ENERGY_LABEL[s]}
            />
          ))}
        </div>
      </Section>

      {/* Mood */}
      <Section title="Mood" hint="Overall mood for the day.">
        <div className="grid grid-cols-5 gap-2">
          {MOOD_SCORES.map((s) => (
            <Chip
              key={s}
              active={mood === s}
              onClick={() => setMood(mood === s ? undefined : s)}
              label={`${s}`}
              sub={MOOD_LABEL[s]}
            />
          ))}
        </div>
      </Section>

      {/* Sleep */}
      <Section
        title="Sleep"
        hint="Hours slept last night. Slide to set."
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={14}
            step={0.5}
            value={sleep}
            onChange={(e) => {
              setSleep(parseFloat(e.target.value));
              setSleepSet(true);
            }}
            className="flex-1 accent-brand-600"
          />
          <span className="w-16 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-xs font-semibold tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {sleepSet ? `${sleep.toFixed(1)} h` : "—"}
          </span>
        </div>
        {sleepSet ? (
          <button
            type="button"
            onClick={() => setSleepSet(false)}
            className="mt-1.5 text-[11px] text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
          >
            Clear
          </button>
        ) : null}
      </Section>

      {showHair ? (
        <Section
          title="Hair fall"
          hint="Roughly how much shedding today? Last write wins for the week."
        >
          <div className="grid grid-cols-3 gap-2">
            {HAIR_FALL_LEVELS.map((lvl) => (
              <Chip
                key={lvl}
                active={hair === lvl}
                onClick={() => setHair(hair === lvl ? undefined : lvl)}
                label={HAIR_FALL_LABEL[lvl]}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {showCycle ? (
        <Section title="Cycle marker" hint="Which phase are you in today?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CYCLE_MARKERS.map((c) => (
              <Chip
                key={c}
                active={cycle === c}
                onClick={() => setCycle(cycle === c ? undefined : c)}
                label={CYCLE_LABEL[c]}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {/* Notes */}
      <Section title="Notes" hint="Anything to remember about today (optional).">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Felt heavy after lunch, walked 5 km, …"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </Section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-20 -mx-6 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-[#0d1117]/95">
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>Save log</>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
          Saves to /AtomicTracker/history/analytics/{date}.json on your Drive.
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        {title}
      </h2>
      {hint ? (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-2 text-center transition ${
        active
          ? "border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-200"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
      }`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      {sub ? (
        <span className="block text-[10px] uppercase tracking-wide opacity-80">
          {sub}
        </span>
      ) : null}
    </button>
  );
}
