"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMealPlannerConfig } from "../actions";
import {
  ALL_DIETS,
  COMMON_ALLERGIES,
  COOKING_FREQUENCIES,
  CUISINES,
  CUISINE_INGREDIENTS,
  DAYS_OF_WEEK,
  DIET_GROUPS,
  HEALTH_OPTIONS,
} from "@/lib/tracker/meal-planner-defaults";
import {
  emptyMealPlannerConfig,
  type MealPlannerConfig,
} from "@/lib/tracker/meal-planner-types";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
const STEP_LABELS = [
  "Diet",
  "Health",
  "Allergies",
  "Cuisines",
  "Ingredients",
  "Repeats",
  "Cook freq",
  "Cheat day",
  "Times",
  "Review",
];
const LAST_STEP: Step = 9;

export function MealPlannerWizard({
  initialConfig,
}: {
  initialConfig: MealPlannerConfig | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<MealPlannerConfig>(
    initialConfig ?? emptyMealPlannerConfig(),
  );

  function update<K extends keyof MealPlannerConfig>(key: K, value: MealPlannerConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function toggleArray(key: "diets" | "healthConditions" | "allergies" | "cuisines", id: string) {
    setConfig((c) => {
      const arr = c[key] as string[];
      const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
      return { ...c, [key]: next };
    });
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
        await saveMealPlannerConfig(config);
        router.push("/trackers/meal-planner");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  // Auto-suggest ingredients when entering the ingredients step
  const suggestedIngredients = useMemo(() => {
    const set = new Set<string>();
    for (const c of config.cuisines) {
      const list = CUISINE_INGREDIENTS[c];
      if (list) for (const i of list) set.add(i);
    }
    return Array.from(set);
  }, [config.cuisines]);

  return (
    <div className="mt-6 space-y-6">
      <Stepper step={step} />

      {step === 0 ? (
        <DietStep
          selected={config.diets}
          custom={config.customDiet ?? ""}
          onToggle={(id) => toggleArray("diets", id)}
          onCustom={(v) => update("customDiet", v || undefined)}
        />
      ) : null}

      {step === 1 ? (
        <HealthStep
          selected={config.healthConditions}
          custom={config.customHealth ?? ""}
          onToggle={(id) => toggleArray("healthConditions", id)}
          onCustom={(v) => update("customHealth", v || undefined)}
        />
      ) : null}

      {step === 2 ? (
        <AllergiesStep
          selected={config.allergies}
          custom={config.customAllergies}
          onToggle={(id) => toggleArray("allergies", id)}
          onAddCustom={(v) =>
            update("customAllergies", [...config.customAllergies, v])
          }
          onRemoveCustom={(v) =>
            update(
              "customAllergies",
              config.customAllergies.filter((x) => x !== v),
            )
          }
        />
      ) : null}

      {step === 3 ? (
        <CuisinesStep
          selected={config.cuisines}
          custom={config.customCuisines}
          onToggle={(id) => toggleArray("cuisines", id)}
          onAddCustom={(v) =>
            update("customCuisines", [...config.customCuisines, v])
          }
          onRemoveCustom={(v) =>
            update(
              "customCuisines",
              config.customCuisines.filter((x) => x !== v),
            )
          }
        />
      ) : null}

      {step === 4 ? (
        <IngredientsStep
          suggested={suggestedIngredients}
          selected={config.ingredients}
          custom={config.customIngredients}
          onToggle={(name) => {
            setConfig((c) => {
              const has = c.ingredients.includes(name);
              return {
                ...c,
                ingredients: has
                  ? c.ingredients.filter((x) => x !== name)
                  : [...c.ingredients, name],
              };
            });
          }}
          onAddCustom={(v) =>
            update("customIngredients", [...config.customIngredients, v])
          }
          onRemoveCustom={(v) =>
            update(
              "customIngredients",
              config.customIngredients.filter((x) => x !== v),
            )
          }
        />
      ) : null}

      {step === 5 ? (
        <FrequencyStep
          value={config.repeatsPerWeek}
          onChange={(v) => update("repeatsPerWeek", v)}
        />
      ) : null}

      {step === 6 ? (
        <CookingFrequencyStep
          value={config.cookingFrequency}
          custom={config.customCookingFrequency ?? ""}
          onChange={(v) => update("cookingFrequency", v)}
          onCustom={(v) => update("customCookingFrequency", v || undefined)}
        />
      ) : null}

      {step === 7 ? (
        <CheatDayStep
          value={config.cheatDay}
          onChange={(v) => update("cheatDay", v)}
        />
      ) : null}

      {step === 8 ? (
        <MealtimesStep
          value={config.mealtimes}
          onChange={(mt) => update("mealtimes", mt)}
          defaultBreakfast={config.defaultBreakfast ?? ""}
          defaultLunch={config.defaultLunch ?? ""}
          onBreakfastChange={(v) => update("defaultBreakfast", v || undefined)}
          onLunchChange={(v) => update("defaultLunch", v || undefined)}
        />
      ) : null}

      {step === 9 ? (
        <ReviewStep config={config} suggested={suggestedIngredients.length} />
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={back}
          disabled={step === 0 || pending}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Back
        </button>
        <span className="text-xs text-slate-400">
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
            disabled={pending}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900">
          {error}
        </p>
      ) : null}
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
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            i === step
              ? "bg-brand-600 text-white"
              : i < step
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          <span>{i < step ? "✓" : i + 1}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────────────

function DietStep({
  selected,
  custom,
  onToggle,
  onCustom,
}: {
  selected: string[];
  custom: string;
  onToggle: (id: string) => void;
  onCustom: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading title="Diet category" hint="Multi-select. These can overlap (e.g. Halal + Low-carb)." />
      {DIET_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {group.title}
          </p>
          <Chips
            options={group.options}
            selected={selected}
            onToggle={onToggle}
          />
        </div>
      ))}
      <CustomInput
        placeholder="Custom diet (optional)"
        value={custom}
        onChange={onCustom}
      />
    </div>
  );
}

function HealthStep({
  selected,
  custom,
  onToggle,
  onCustom,
}: {
  selected: string[];
  custom: string;
  onToggle: (id: string) => void;
  onCustom: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Health conditions"
        hint="Selected items inform sodium, glycemic load, and other diet-relevant adjustments."
      />
      <Chips options={HEALTH_OPTIONS} selected={selected} onToggle={onToggle} />
      <CustomInput
        placeholder="Other condition (optional)"
        value={custom}
        onChange={onCustom}
      />
    </div>
  );
}

function AllergiesStep({
  selected,
  custom,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: {
  selected: string[];
  custom: string[];
  onToggle: (id: string) => void;
  onAddCustom: (v: string) => void;
  onRemoveCustom: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Allergies"
        hint="The AI will avoid ingredients that contain these."
      />
      <Chips
        options={COMMON_ALLERGIES}
        selected={selected}
        onToggle={onToggle}
      />
      <CustomList
        items={custom}
        onAdd={onAddCustom}
        onRemove={onRemoveCustom}
        placeholder="Add another allergy"
      />
    </div>
  );
}

function CuisinesStep({
  selected,
  custom,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: {
  selected: string[];
  custom: string[];
  onToggle: (id: string) => void;
  onAddCustom: (v: string) => void;
  onRemoveCustom: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Cuisines"
        hint="Pick the ones you want to see in your weekly plan. Add custom ones below."
      />
      <Chips options={CUISINES} selected={selected} onToggle={onToggle} />
      <CustomList
        items={custom}
        onAdd={onAddCustom}
        onRemove={onRemoveCustom}
        placeholder="Add a cuisine"
      />
    </div>
  );
}

function IngredientsStep({
  suggested,
  selected,
  custom,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: {
  suggested: string[];
  selected: string[];
  custom: string[];
  onToggle: (name: string) => void;
  onAddCustom: (v: string) => void;
  onRemoveCustom: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Ingredients"
        hint={`Suggested by your selected cuisines. Tap to include in the AI's pantry.`}
      />
      {suggested.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          No suggestions — add at least one cuisine on the previous step.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {suggested.map((name) => {
            const on = selected.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => onToggle(name)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Custom ingredients (always included):
      </p>
      <CustomList
        items={custom}
        onAdd={onAddCustom}
        onRemove={onRemoveCustom}
        placeholder="Add an ingredient"
      />
    </div>
  );
}

function FrequencyStep({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Repeat frequency"
        hint="How many times in a week is it OK to see the same dish?"
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-center">
          <span className="text-5xl font-bold text-brand-600">{value}</span>
          <span className="ml-1 text-sm text-slate-500">/ 7 days</span>
        </div>
        <input
          type="range"
          min={1}
          max={7}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="mt-4 w-full accent-brand-600"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5</span>
          <span>6</span>
          <span>7</span>
        </div>
      </div>
    </div>
  );
}

function CookingFrequencyStep({
  value,
  custom,
  onChange,
  onCustom,
}: {
  value: MealPlannerConfig["cookingFrequency"];
  custom: string;
  onChange: (v: MealPlannerConfig["cookingFrequency"]) => void;
  onCustom: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="How often do you cook?"
        hint="Affects how many distinct dinners the AI generates. Leftovers fill the rest."
      />
      <div className="space-y-2">
        {COOKING_FREQUENCIES.map((opt) => {
          const on = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`block w-full rounded-xl border p-3 text-left transition ${
                on
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {opt.label}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {opt.hint}
              </p>
            </button>
          );
        })}
      </div>
      {value === "custom" ? (
        <CustomInput
          placeholder="Describe your cooking pattern"
          value={custom}
          onChange={onCustom}
        />
      ) : null}
    </div>
  );
}

function CheatDayStep({
  value,
  onChange,
}: {
  value: MealPlannerConfig["cheatDay"];
  onChange: (v: MealPlannerConfig["cheatDay"]) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Cheat day"
        hint="Pick a day with no planned meal — eat out, order in, whatever. Skip if you don't want one."
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            value === null
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          No cheat day
        </button>
        {DAYS_OF_WEEK.map((d) => {
          const on = value === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() =>
                onChange(d.id as MealPlannerConfig["cheatDay"])
              }
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                on
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MealtimesStep({
  value,
  onChange,
  defaultBreakfast,
  defaultLunch,
  onBreakfastChange,
  onLunchChange,
}: {
  value: { breakfast: string; lunch: string; dinner: string };
  onChange: (mt: { breakfast: string; lunch: string; dinner: string }) => void;
  defaultBreakfast: string;
  defaultLunch: string;
  onBreakfastChange: (v: string) => void;
  onLunchChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Mealtime defaults"
        hint="Times + your usual breakfast/lunch (auto-fills the prep check-in)."
      />
      <TimeRow
        label="Breakfast"
        value={value.breakfast}
        onChange={(v) => onChange({ ...value, breakfast: v })}
      />
      <CustomInput
        placeholder="Default breakfast (e.g. Overnight oats)"
        value={defaultBreakfast}
        onChange={onBreakfastChange}
      />
      <TimeRow
        label="Lunch"
        value={value.lunch}
        onChange={(v) => onChange({ ...value, lunch: v })}
      />
      <CustomInput
        placeholder="Default lunch (e.g. Quinoa salad)"
        value={defaultLunch}
        onChange={onLunchChange}
      />
      <TimeRow
        label="Dinner"
        value={value.dinner}
        onChange={(v) => onChange({ ...value, dinner: v })}
      />
    </div>
  );
}

function freqLabel(id: MealPlannerConfig["cookingFrequency"]): string {
  return COOKING_FREQUENCIES.find((f) => f.id === id)?.label ?? id;
}

function dayLabel(id: MealPlannerConfig["cheatDay"]): string {
  if (!id) return "None";
  return DAYS_OF_WEEK.find((d) => d.id === id)?.label ?? id;
}

function ReviewStep({
  config,
  suggested,
}: {
  config: MealPlannerConfig;
  suggested: number;
}) {
  const dietLabels = config.diets
    .map((id) => ALL_DIETS.find((d) => d.id === id)?.label ?? id)
    .filter(Boolean);
  const healthLabels = config.healthConditions
    .map((id) => HEALTH_OPTIONS.find((h) => h.id === id)?.label ?? id)
    .filter(Boolean);
  const allergyLabels = [
    ...config.allergies.map(
      (id) => COMMON_ALLERGIES.find((a) => a.id === id)?.label ?? id,
    ),
    ...config.customAllergies,
  ];
  const cuisineLabels = [
    ...config.cuisines.map((id) => CUISINES.find((c) => c.id === id)?.label ?? id),
    ...config.customCuisines,
  ];
  return (
    <div className="space-y-3">
      <Heading title="Review" hint="Tap Save to write to your Drive." />
      <ReviewRow label="Diet" value={[...dietLabels, config.customDiet].filter(Boolean).join(", ") || "—"} />
      <ReviewRow label="Health" value={[...healthLabels, config.customHealth].filter(Boolean).join(", ") || "—"} />
      <ReviewRow label="Allergies" value={allergyLabels.join(", ") || "None"} />
      <ReviewRow label="Cuisines" value={cuisineLabels.join(", ") || "—"} />
      <ReviewRow
        label="Ingredients"
        value={`${config.ingredients.length} from suggestions · ${config.customIngredients.length} custom · ${suggested - config.ingredients.length} unselected`}
      />
      <ReviewRow label="Repeats / week" value={`${config.repeatsPerWeek}`} />
      <ReviewRow
        label="Cook frequency"
        value={
          config.cookingFrequency === "custom" && config.customCookingFrequency
            ? `Custom · ${config.customCookingFrequency}`
            : freqLabel(config.cookingFrequency)
        }
      />
      <ReviewRow label="Cheat day" value={dayLabel(config.cheatDay)} />
      <ReviewRow
        label="Mealtimes"
        value={`B ${config.mealtimes.breakfast} · L ${config.mealtimes.lunch} · D ${config.mealtimes.dinner}`}
      />
      <ReviewRow
        label="Default B/L"
        value={`${config.defaultBreakfast || "—"} / ${config.defaultLunch || "—"}`}
      />
      <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
        Saves to /AtomicTracker/config/tracker.meal-planner.json on your Drive.
        Plain JSON — not encrypted (preferences, not secrets).
      </p>
    </div>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────────

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              on
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CustomInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
    />
  );
}

function CustomList({
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      setDraft("");
      return;
    }
    onAdd(v);
    setDraft("");
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          className="block flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={commit}
          className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          Add
        </button>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
            >
              {item}
              <button
                type="button"
                onClick={() => onRemove(item)}
                aria-label={`Remove ${item}`}
                className="text-white/80 hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
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
    <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:ring-brand-500"
      />
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-right text-xs text-slate-900">{value}</span>
    </div>
  );
}
