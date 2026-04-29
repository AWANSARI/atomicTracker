"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { saveHabitConfig } from "../actions";
import { HABIT_CATALOG } from "@/lib/tracker/habit-defaults";
import {
  emptyHabitConfig,
  HABIT_WEEKDAYS,
  newHabitId,
  type Habit,
  type HabitCadence,
  type HabitConfig,
  type HabitWeekday,
} from "@/lib/tracker/habit-types";

type Step = 0 | 1 | 2 | 3;
const STEP_LABELS = ["Catalog", "Custom", "Reminders", "Review"];
const LAST_STEP: Step = 3;

const CADENCE_OPTIONS: { id: HabitCadence; label: string; hint: string }[] = [
  { id: "daily", label: "Daily", hint: "Every day of the week." },
  { id: "weekdays", label: "Weekdays", hint: "Mon-Fri only." },
  { id: "weekly", label: "Weekly", hint: "One specific day per week." },
  { id: "custom", label: "Custom", hint: "Pick specific weekdays." },
];

export function HabitsWizard({
  initialConfig,
}: {
  initialConfig: HabitConfig | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<HabitConfig>(() => {
    if (!initialConfig) return emptyHabitConfig();
    return {
      ...emptyHabitConfig(),
      ...initialConfig,
      habits: initialConfig.habits ?? [],
    };
  });

  // Track which catalog IDs are currently selected (i.e. exist in habits[]).
  const catalogSelected = new Set(
    config.habits.map((h) => h.catalogId).filter((x): x is string => Boolean(x)),
  );

  function toggleCatalog(catalogId: string) {
    const entry = HABIT_CATALOG.find((c) => c.id === catalogId);
    if (!entry) return;
    setConfig((c) => {
      const exists = c.habits.find((h) => h.catalogId === catalogId);
      if (exists) {
        return { ...c, habits: c.habits.filter((h) => h.catalogId !== catalogId) };
      }
      const newHabit: Habit = {
        id: newHabitId(),
        name: entry.name,
        cadence: entry.cadence,
        tags: entry.tags,
        catalogId: entry.id,
      };
      return { ...c, habits: [...c.habits, newHabit] };
    });
  }

  function addCustom(habit: Omit<Habit, "id">) {
    setConfig((c) => ({
      ...c,
      habits: [...c.habits, { id: newHabitId(), ...habit }],
    }));
  }

  function removeHabit(id: string) {
    setConfig((c) => ({ ...c, habits: c.habits.filter((h) => h.id !== id) }));
  }

  function next() {
    if (step < LAST_STEP) setStep((step + 1) as Step);
  }
  function back() {
    if (step > 0) setStep((step - 1) as Step);
  }

  async function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        await saveHabitConfig(config);
        router.push("/trackers/habits");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const customHabits = config.habits.filter((h) => !h.catalogId);

  return (
    <div className="mt-6 space-y-6">
      <Stepper step={step} />

      {step === 0 ? (
        <CatalogStep selected={catalogSelected} onToggle={toggleCatalog} />
      ) : null}

      {step === 1 ? (
        <CustomStep
          customHabits={customHabits}
          onAdd={addCustom}
          onRemove={removeHabit}
        />
      ) : null}

      {step === 2 ? (
        <RemindersStep
          enabled={config.remindersEnabled}
          dailyTime={config.reminderTime ?? "09:00"}
          weeklyTime={config.weeklyReminderTime ?? "19:00"}
          onToggle={(v) => setConfig((c) => ({ ...c, remindersEnabled: v }))}
          onDailyTimeChange={(v) =>
            setConfig((c) => ({ ...c, reminderTime: v }))
          }
          onWeeklyTimeChange={(v) =>
            setConfig((c) => ({ ...c, weeklyReminderTime: v }))
          }
        />
      ) : null}

      {step === 3 ? <ReviewStep config={config} /> : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-14 -mx-6 mt-6 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-[#0d1117]/95">
        <div className="flex items-center justify-between gap-2 px-6 py-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || pending}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back
          </button>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Step {step + 1} of {STEP_LABELS.length}
          </span>
          {step < LAST_STEP ? (
            <button
              type="button"
              onClick={next}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={pending || config.habits.length === 0}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STEP_LABELS.map((label, i) => (
        <div
          key={label}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
            i === step
              ? "bg-brand-600 text-white"
              : i < step
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"
                : "border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
          }`}
        >
          <span className="inline-flex items-center justify-center">
            {i < step ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
          </span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────────────

function CatalogStep({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Pick your daily non-negotiables"
        hint="Tap to add. You can edit later."
      />
      <div className="space-y-2">
        {HABIT_CATALOG.map((entry) => {
          const on = selected.has(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onToggle(entry.id)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                on
                  ? "border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-950/30"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                  on
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                }`}
              >
                {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                  {entry.name}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {entry.cadence}
                  {entry.tags && entry.tags.length > 0
                    ? ` · ${entry.tags.join(" · ")}`
                    : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomStep({
  customHabits,
  onAdd,
  onRemove,
}: {
  customHabits: Habit[];
  onAdd: (habit: Omit<Habit, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<HabitCadence>("daily");
  const [weeklyDay, setWeeklyDay] = useState<HabitWeekday>("Sun");
  const [customDays, setCustomDays] = useState<HabitWeekday[]>([]);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const habit: Omit<Habit, "id"> = { name: trimmed, cadence };
    if (cadence === "weekly") habit.weeklyDay = weeklyDay;
    if (cadence === "custom") {
      if (customDays.length === 0) return;
      habit.customDays = customDays;
    }
    onAdd(habit);
    setName("");
    setCadence("daily");
    setWeeklyDay("Sun");
    setCustomDays([]);
  }

  return (
    <div className="space-y-4">
      <Heading
        title="Add custom habits"
        hint="Anything not in the catalog. Skip if the catalog is enough."
      />
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Name
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Stretch 5 minutes"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Cadence
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CADENCE_OPTIONS.map((opt) => {
              const on = cadence === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCadence(opt.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {CADENCE_OPTIONS.find((o) => o.id === cadence)?.hint}
          </p>
        </div>
        {cadence === "weekly" ? (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Day of week
            </p>
            <div className="flex flex-wrap gap-1.5">
              {HABIT_WEEKDAYS.map((d) => {
                const on = weeklyDay === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setWeeklyDay(d)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {cadence === "custom" ? (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Days
            </p>
            <div className="flex flex-wrap gap-1.5">
              {HABIT_WEEKDAYS.map((d) => {
                const on = customDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setCustomDays((cur) =>
                        cur.includes(d)
                          ? cur.filter((x) => x !== d)
                          : [...cur, d],
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={commit}
          disabled={
            !name.trim() || (cadence === "custom" && customDays.length === 0)
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Add habit
        </button>
      </div>

      {customHabits.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Added
          </p>
          {customHabits.map((h) => (
            <div
              key={h.id}
              className="flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                  {h.name}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {h.cadence}
                  {h.cadence === "weekly" && h.weeklyDay
                    ? ` · ${h.weeklyDay}`
                    : ""}
                  {h.cadence === "custom" && h.customDays
                    ? ` · ${h.customDays.join("/")}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(h.id)}
                aria-label={`Remove ${h.name}`}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RemindersStep({
  enabled,
  dailyTime,
  weeklyTime,
  onToggle,
  onDailyTimeChange,
  onWeeklyTimeChange,
}: {
  enabled: boolean;
  dailyTime: string;
  weeklyTime: string;
  onToggle: (v: boolean) => void;
  onDailyTimeChange: (v: string) => void;
  onWeeklyTimeChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Reminders (optional)"
        hint="Habits work best with a light touch. Off by default."
      />
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onToggle(false)}
          className={`block w-full rounded-xl border p-3 text-left transition ${
            !enabled
              ? "border-brand-600 bg-brand-600 text-white shadow-sm"
              : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          }`}
        >
          <p
            className={`text-sm font-semibold ${!enabled ? "text-white" : "text-slate-900 dark:text-slate-50"}`}
          >
            No Calendar reminders
          </p>
          <p
            className={`mt-1 text-xs ${!enabled ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}
          >
            Just check off habits when you remember. Recommended.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onToggle(true)}
          className={`block w-full rounded-xl border p-3 text-left transition ${
            enabled
              ? "border-brand-600 bg-brand-600 text-white shadow-sm"
              : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          }`}
        >
          <p
            className={`text-sm font-semibold ${enabled ? "text-white" : "text-slate-900 dark:text-slate-50"}`}
          >
            Yes, create Calendar reminders
          </p>
          <p
            className={`mt-1 text-xs ${enabled ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}
          >
            One recurring event per habit, on its cadence. You can clean up later by toggling this off and re-syncing.
          </p>
        </button>
      </div>

      {enabled ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <TimeRow
            label="Daily / weekday reminder time"
            value={dailyTime}
            onChange={onDailyTimeChange}
          />
          <TimeRow
            label="Weekly check-in time"
            value={weeklyTime}
            onChange={onWeeklyTimeChange}
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            After saving, tap &ldquo;Sync reminders&rdquo; on the habits page to actually create or refresh the Calendar events.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ReviewStep({ config }: { config: HabitConfig }) {
  return (
    <div className="space-y-3">
      <Heading title="Review" hint="Tap Save to write to your Drive." />
      <ReviewRow
        label="Habits"
        value={`${config.habits.length} total`}
      />
      <div className="space-y-1.5">
        {config.habits.map((h) => (
          <div
            key={h.id}
            className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="text-xs text-slate-900 dark:text-slate-100">
              {h.name}
            </span>
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {h.cadence}
              {h.cadence === "weekly" && h.weeklyDay ? ` · ${h.weeklyDay}` : ""}
              {h.cadence === "custom" && h.customDays
                ? ` · ${h.customDays.join("/")}`
                : ""}
            </span>
          </div>
        ))}
      </div>
      <ReviewRow
        label="Reminders"
        value={
          config.remindersEnabled
            ? `On · daily ${config.reminderTime ?? "09:00"} · weekly ${config.weeklyReminderTime ?? "19:00"}`
            : "Off"
        }
      />
      <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
        Saves to /AtomicTracker/config/tracker.habits.json on your Drive. Daily ticks land in /AtomicTracker/history/habits/&#123;date&#125;.json.
      </p>
    </div>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────────

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

function TimeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark]"
      />
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="text-right text-xs text-slate-900 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}
