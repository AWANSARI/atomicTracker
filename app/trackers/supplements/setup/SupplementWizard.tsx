"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { saveSupplementConfig } from "../actions";
import {
  emptySupplementConfig,
  type Supplement,
  type SupplementConfig,
  type TimingHint,
} from "@/lib/tracker/supplement-types";
import {
  SUPPLEMENT_CATALOG,
  getCatalogEntry,
} from "@/lib/tracker/supplement-catalog";

type Step = 0 | 1 | 2;
const STEP_LABELS = ["Catalog", "Custom", "Review"];
const LAST_STEP: Step = 2;

const HINT_OPTIONS: { id: TimingHint; label: string }[] = [
  { id: "empty-stomach", label: "Empty stomach" },
  { id: "before-food", label: "Before food" },
  { id: "with-food", label: "With food" },
  { id: "after-food", label: "After food" },
  { id: "with-fat", label: "With fat" },
  { id: "morning", label: "Morning" },
  { id: "bedtime", label: "Bedtime" },
  { id: "any-time", label: "Any time" },
];

function rid(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function SupplementWizard({
  initialConfig,
}: {
  initialConfig: SupplementConfig | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [supplements, setSupplements] = useState<Supplement[]>(
    () => initialConfig?.supplements ?? [],
  );

  const selectedCatalogIds = useMemo(
    () =>
      new Set(
        supplements.map((s) => s.catalogId).filter((x): x is string => Boolean(x)),
      ),
    [supplements],
  );

  function toggleCatalog(id: string) {
    setSupplements((curr) => {
      const idx = curr.findIndex((s) => s.catalogId === id);
      if (idx >= 0) {
        return curr.filter((_, i) => i !== idx);
      }
      const entry = getCatalogEntry(id);
      if (!entry) return curr;
      const supp: Supplement = {
        id: rid(),
        catalogId: entry.id,
        name: entry.name,
        dose: entry.defaultDose,
        timesPerDay: entry.timesPerDay,
        rule: entry.rule,
      };
      return [...curr, supp];
    });
  }

  function addCustom(s: { name: string; dose?: string; timesPerDay: number; hint: TimingHint }) {
    const supp: Supplement = {
      id: rid(),
      name: s.name,
      dose: s.dose,
      timesPerDay: s.timesPerDay,
      rule: { hints: [s.hint], selfTags: [] },
    };
    setSupplements((curr) => [...curr, supp]);
  }

  function removeOne(id: string) {
    setSupplements((curr) => curr.filter((s) => s.id !== id));
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
        const base = initialConfig ?? emptySupplementConfig();
        await saveSupplementConfig({
          ...base,
          v: 1,
          supplements,
        });
        router.push("/trackers/supplements");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <Stepper step={step} />

      {step === 0 ? (
        <CatalogStep
          selectedIds={selectedCatalogIds}
          onToggle={toggleCatalog}
        />
      ) : null}

      {step === 1 ? (
        <CustomStep
          supplements={supplements}
          onAdd={addCustom}
          onRemove={removeOne}
        />
      ) : null}

      {step === 2 ? (
        <ReviewStep supplements={supplements} onRemove={removeOne} />
      ) : null}

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
              disabled={pending || supplements.length === 0}
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
  selectedIds,
  onToggle,
}: {
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Pick from catalog"
        hint="Common supplements with built-in timing rules. Tap to add."
      />
      <div className="space-y-2">
        {SUPPLEMENT_CATALOG.map((entry) => {
          const on = selectedIds.has(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onToggle(entry.id)}
              className={`block w-full rounded-xl border p-3 text-left transition ${
                on
                  ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`text-sm font-semibold ${on ? "text-white" : "text-slate-900 dark:text-slate-50"}`}
                >
                  {entry.name}
                </p>
                <span
                  className={`shrink-0 text-[11px] ${on ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {entry.defaultDose}
                </span>
              </div>
              <p
                className={`mt-1 text-xs ${on ? "text-white/85" : "text-slate-500 dark:text-slate-400"}`}
              >
                {entry.info}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomStep({
  supplements,
  onAdd,
  onRemove,
}: {
  supplements: Supplement[];
  onAdd: (s: { name: string; dose?: string; timesPerDay: number; hint: TimingHint }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [hint, setHint] = useState<TimingHint>("with-food");

  const customs = supplements.filter((s) => !s.catalogId);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({
      name: trimmed,
      dose: dose.trim() || undefined,
      timesPerDay: Math.max(1, Math.min(6, timesPerDay)),
      hint,
    });
    setName("");
    setDose("");
    setTimesPerDay(1);
    setHint("with-food");
  }

  return (
    <div className="space-y-4">
      <Heading
        title="Add custom supplements"
        hint="Anything not in the catalog. Pick a basic timing hint — the solver handles the rest."
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
            placeholder="e.g. Methylfolate"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Dose (optional)
          </p>
          <input
            type="text"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            placeholder="e.g. 400 mcg"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Times per day
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4].map((n) => {
              const on = timesPerDay === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTimesPerDay(n)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {n}×
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Timing hint
          </p>
          <div className="flex flex-wrap gap-1.5">
            {HINT_OPTIONS.map((h) => {
              const on = hint === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setHint(h.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {h.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={commit}
          disabled={!name.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          Add custom
        </button>
      </div>

      {customs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Your custom items
          </p>
          {customs.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {s.name}
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {s.dose ? `${s.dose} · ` : ""}
                  {s.timesPerDay}× daily
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.name}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewStep({
  supplements,
  onRemove,
}: {
  supplements: Supplement[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Heading
        title="Review"
        hint="Tap Save to write to your Drive. The schedule is computed on the next screen."
      />
      {supplements.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          No supplements added yet. Go back and pick at least one.
        </p>
      ) : (
        <ul className="space-y-2">
          {supplements.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {s.name}
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {s.dose ? `${s.dose} · ` : ""}
                  {s.timesPerDay}× daily
                  {s.catalogId ? " · catalog" : " · custom"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.name}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
        Saves to /AtomicTracker/config/tracker.supplements.json on your Drive.
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
