"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
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
  SYMPTOM_OPTIONS,
} from "@/lib/tracker/meal-planner-defaults";
import {
  emptyMealPlannerConfig,
  type MealPlannerConfig,
} from "@/lib/tracker/meal-planner-types";
import {
  computeBmi,
  computeDailyTargets,
  type BmiResult,
  type DailyTargets,
} from "@/lib/tracker/nutrition";

type Step =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11;
const STEP_LABELS = [
  "Diet",
  "Health",
  "Allergies",
  "Cuisines",
  "Ingredients",
  "Repeats",
  "Cook freq",
  "Cheat day",
  "Schedule",
  "Times",
  "Body & goals",
  "Review",
];
const LAST_STEP: Step = 11;

export function MealPlannerWizard({
  initialConfig,
}: {
  initialConfig: MealPlannerConfig | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<MealPlannerConfig>(() => {
    const defaults = emptyMealPlannerConfig();
    if (!initialConfig) return defaults;
    // Merge loaded config over defaults so older saved configs missing newer
    // fields (e.g. cookingDays, shoppingDay, shoppingTime, mealtimes) don't
    // crash the wizard with "cannot read properties of undefined".
    return {
      ...defaults,
      ...initialConfig,
      mealtimes: { ...defaults.mealtimes, ...(initialConfig.mealtimes ?? {}) },
      cookingDays: initialConfig.cookingDays ?? defaults.cookingDays,
      shoppingDay: initialConfig.shoppingDay ?? defaults.shoppingDay,
      shoppingTime: initialConfig.shoppingTime ?? defaults.shoppingTime,
      diets: initialConfig.diets ?? [],
      healthConditions: initialConfig.healthConditions ?? [],
      allergies: initialConfig.allergies ?? [],
      customAllergies: initialConfig.customAllergies ?? [],
      cuisines: initialConfig.cuisines ?? [],
      customCuisines: initialConfig.customCuisines ?? [],
      ingredients: initialConfig.ingredients ?? [],
      customIngredients: initialConfig.customIngredients ?? [],
      favoriteMeals: initialConfig.favoriteMeals ?? [],
      favoriteIngredients: initialConfig.favoriteIngredients ?? [],
    };
  });

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
        <ScheduleStep
          cookingDays={config.cookingDays}
          shoppingDay={config.shoppingDay}
          shoppingTime={config.shoppingTime}
          onCookingDaysChange={(v) => update("cookingDays", v)}
          onShoppingDayChange={(v) => update("shoppingDay", v)}
          onShoppingTimeChange={(v) => update("shoppingTime", v)}
        />
      ) : null}

      {step === 9 ? (
        <MealtimesStep
          value={config.mealtimes}
          onChange={(mt) => update("mealtimes", mt)}
          defaultBreakfast={config.defaultBreakfast ?? ""}
          defaultLunch={config.defaultLunch ?? ""}
          onBreakfastChange={(v) => update("defaultBreakfast", v || undefined)}
          onLunchChange={(v) => update("defaultLunch", v || undefined)}
        />
      ) : null}

      {step === 10 ? (
        <BodyGoalsStep
          heightCm={config.heightCm}
          weightKg={config.weightKg}
          age={config.age}
          sex={config.sex}
          activityLevel={config.activityLevel}
          goal={config.goal}
          nutritionistNotes={config.nutritionistNotes ?? ""}
          symptoms={config.symptoms ?? []}
          snacksEnabled={config.snacksEnabled ?? false}
          onHeightChange={(v) => update("heightCm", v)}
          onWeightChange={(v) => update("weightKg", v)}
          onAgeChange={(v) => update("age", v)}
          onSexChange={(v) => update("sex", v)}
          onActivityChange={(v) => update("activityLevel", v)}
          onGoalChange={(v) => update("goal", v)}
          onNotesChange={(v) => update("nutritionistNotes", v || undefined)}
          onSymptomToggle={(id) => {
            const current = config.symptoms ?? [];
            const next = current.includes(id)
              ? current.filter((x) => x !== id)
              : [...current, id];
            update("symptoms", next);
          }}
          onSnacksToggle={(v) => update("snacksEnabled", v)}
        />
      ) : null}

      {step === 11 ? (
        <ReviewStep config={config} suggested={suggestedIngredients.length} />
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Sticky nav bar that sits just above the AppShell bottom nav. The
          negative horizontal margin breaks out of the page's px-6 padding so
          the border + backdrop spans the full max-w-md container width. */}
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
              disabled={pending}
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
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
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
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
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
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-center">
          <span className="text-5xl font-bold text-brand-600 dark:text-brand-400">{value}</span>
          <span className="ml-1 text-sm text-slate-500 dark:text-slate-400">/ 7 days</span>
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
        <div className="mt-1 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
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
                  ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              }`}
            >
              <p className={`text-sm font-semibold ${on ? "text-white" : "text-slate-900 dark:text-slate-50"}`}>
                {opt.label}
              </p>
              <p className={`mt-1 text-xs ${on ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}>
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
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            value === null
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                on
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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

function ScheduleStep({
  cookingDays,
  shoppingDay,
  shoppingTime,
  onCookingDaysChange,
  onShoppingDayChange,
  onShoppingTimeChange,
}: {
  cookingDays: MealPlannerConfig["cookingDays"];
  shoppingDay: MealPlannerConfig["shoppingDay"];
  shoppingTime: string;
  onCookingDaysChange: (v: MealPlannerConfig["cookingDays"]) => void;
  onShoppingDayChange: (v: MealPlannerConfig["shoppingDay"]) => void;
  onShoppingTimeChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading
        title="Cooking & shopping days"
        hint="When you typically batch-cook, and the day you shop. Drives the recurring Calendar reminders."
      />
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Cooking days (multi-select)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS_OF_WEEK.map((d) => {
            const on = cookingDays.includes(d.id as MealPlannerConfig["cookingDays"][number]);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  const id = d.id as MealPlannerConfig["cookingDays"][number];
                  onCookingDaysChange(
                    on
                      ? cookingDays.filter((x) => x !== id)
                      : [...cookingDays, id],
                  );
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {d.label.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Shopping day (single)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS_OF_WEEK.map((d) => {
            const on = shoppingDay === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() =>
                  onShoppingDayChange(d.id as MealPlannerConfig["shoppingDay"])
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {d.label.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>
      <TimeRow
        label="Shopping reminder at"
        value={shoppingTime}
        onChange={onShoppingTimeChange}
      />
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

function BodyGoalsStep({
  heightCm,
  weightKg,
  age,
  sex,
  activityLevel,
  goal,
  nutritionistNotes,
  symptoms,
  snacksEnabled,
  onHeightChange,
  onWeightChange,
  onAgeChange,
  onSexChange,
  onActivityChange,
  onGoalChange,
  onNotesChange,
  onSymptomToggle,
  onSnacksToggle,
}: {
  heightCm: number | undefined;
  weightKg: number | undefined;
  age: number | undefined;
  sex: MealPlannerConfig["sex"];
  activityLevel: MealPlannerConfig["activityLevel"];
  goal: MealPlannerConfig["goal"];
  nutritionistNotes: string;
  symptoms: string[];
  snacksEnabled: boolean;
  onHeightChange: (v: number | undefined) => void;
  onWeightChange: (v: number | undefined) => void;
  onAgeChange: (v: number | undefined) => void;
  onSexChange: (v: MealPlannerConfig["sex"]) => void;
  onActivityChange: (v: MealPlannerConfig["activityLevel"]) => void;
  onGoalChange: (v: MealPlannerConfig["goal"]) => void;
  onNotesChange: (v: string) => void;
  onSymptomToggle: (id: string) => void;
  onSnacksToggle: (v: boolean) => void;
}) {
  const showTargets =
    typeof heightCm === "number" &&
    heightCm > 0 &&
    typeof weightKg === "number" &&
    weightKg > 0 &&
    typeof age === "number" &&
    age > 0 &&
    sex &&
    activityLevel &&
    goal;
  const bmi = showTargets ? computeBmi(heightCm, weightKg) : null;
  const targets =
    showTargets && sex && activityLevel && goal
      ? computeDailyTargets({
          heightCm,
          weightKg,
          age,
          sex,
          activityLevel,
          goal,
        })
      : null;

  const SEXES: { id: NonNullable<MealPlannerConfig["sex"]>; label: string }[] = [
    { id: "male", label: "Male" },
    { id: "female", label: "Female" },
    { id: "other", label: "Other" },
  ];
  const GOALS: { id: NonNullable<MealPlannerConfig["goal"]>; label: string; hint: string }[] = [
    { id: "lose", label: "Weight loss", hint: "Calorie deficit, protein-forward." },
    { id: "maintain", label: "Maintain", hint: "Match energy expenditure." },
    { id: "gain", label: "Bulking / gain", hint: "Lean surplus, higher carbs." },
  ];
  const ACTIVITIES: { id: NonNullable<MealPlannerConfig["activityLevel"]>; label: string }[] = [
    { id: "sedentary", label: "Sedentary" },
    { id: "light", label: "Light" },
    { id: "moderate", label: "Moderate" },
    { id: "active", label: "Active" },
    { id: "very-active", label: "Very active" },
  ];

  return (
    <div className="space-y-5">
      <Heading
        title="Body & goals"
        hint="Drives BMI and daily kcal/macro targets via Mifflin-St Jeor. All optional — leave blank to skip."
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberRow
          label="Height (cm)"
          value={heightCm}
          onChange={onHeightChange}
          min={80}
          max={250}
          placeholder="170"
        />
        <NumberRow
          label="Weight (kg)"
          value={weightKg}
          onChange={onWeightChange}
          min={30}
          max={300}
          step={0.1}
          placeholder="68"
        />
        <NumberRow
          label="Age"
          value={age}
          onChange={onAgeChange}
          min={12}
          max={120}
          placeholder="30"
        />
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Sex
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SEXES.map((s) => {
              const on = sex === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSexChange(s.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Activity level
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITIES.map((a) => {
            const on = activityLevel === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onActivityChange(a.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Goal
        </p>
        <div className="space-y-2">
          {GOALS.map((g) => {
            const on = goal === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onGoalChange(g.id)}
                className={`block w-full rounded-xl border p-3 text-left transition ${
                  on
                    ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                }`}
              >
                <p className={`text-sm font-semibold ${on ? "text-white" : "text-slate-900 dark:text-slate-50"}`}>
                  {g.label}
                </p>
                <p className={`mt-0.5 text-xs ${on ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}>
                  {g.hint}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {bmi && targets ? (
        <NutritionSummary bmi={bmi} targets={targets} />
      ) : null}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Symptoms to address (optional)
        </p>
        <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
          Biases meal selection toward foods that support these — e.g. iron-rich
          for fatigue / hair loss, anti-inflammatory for joint pain.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SYMPTOM_OPTIONS.map((s) => {
            const on = symptoms.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSymptomToggle(s.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={snacksEnabled}
            onChange={(e) => onSnacksToggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-900 dark:text-slate-50">
              Include snacks in the AI plan
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
              When on, the AI generates one snack per day too — typically nuts,
              seeds, fruit, sprouts, or a smoothie. Off keeps to B/L/D only.
            </span>
          </span>
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Nutritionist notes
        </p>
        <textarea
          value={nutritionistNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          placeholder="Paste advice from your nutritionist (e.g. &lsquo;keep sodium under 1500mg&rsquo;, &lsquo;rotate iron-rich greens&rsquo;). Fed verbatim into the AI."
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>
    </div>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? 1}
        value={typeof value === "number" ? value : ""}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") {
            onChange(undefined);
            return;
          }
          const n = Number(v);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </div>
  );
}

function NutritionSummary({
  bmi,
  targets,
}: {
  bmi: BmiResult;
  targets: DailyTargets;
}) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
        Computed targets
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-emerald-900 dark:text-emerald-200">
        <span>BMI</span>
        <span className="text-right font-semibold">
          {bmi.bmi.toFixed(1)} · {bmi.label}
        </span>
        <span>BMR</span>
        <span className="text-right font-semibold">{targets.bmrKcal} kcal</span>
        <span>TDEE</span>
        <span className="text-right font-semibold">{targets.tdeeKcal} kcal</span>
        <span>Daily kcal</span>
        <span className="text-right font-semibold">{targets.kcal} kcal</span>
        <span>Protein</span>
        <span className="text-right font-semibold">{targets.protein_g} g</span>
        <span>Carbs</span>
        <span className="text-right font-semibold">{targets.carbs_g} g</span>
        <span>Fat</span>
        <span className="text-right font-semibold">{targets.fat_g} g</span>
        <span>Fiber</span>
        <span className="text-right font-semibold">{targets.fiber_g} g</span>
      </div>
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
        label="Cooking days"
        value={config.cookingDays.length ? config.cookingDays.join(", ") : "—"}
      />
      <ReviewRow
        label="Shopping"
        value={`${config.shoppingDay} at ${config.shoppingTime}`}
      />
      <ReviewRow
        label="Mealtimes"
        value={`B ${config.mealtimes.breakfast} · L ${config.mealtimes.lunch} · D ${config.mealtimes.dinner}`}
      />
      <ReviewRow
        label="Default B/L"
        value={`${config.defaultBreakfast || "—"} / ${config.defaultLunch || "—"}`}
      />
      <ReviewRow
        label="Body"
        value={
          config.heightCm && config.weightKg
            ? `${config.heightCm} cm · ${config.weightKg} kg${config.age ? ` · ${config.age} y` : ""}${config.sex ? ` · ${config.sex}` : ""}`
            : "—"
        }
      />
      <ReviewRow
        label="Goal"
        value={
          config.goal
            ? `${config.goal === "lose" ? "Weight loss" : config.goal === "gain" ? "Bulking / gain" : "Maintain"}${config.activityLevel ? ` · ${config.activityLevel}` : ""}`
            : "—"
        }
      />
      {config.nutritionistNotes ? (
        <ReviewRow label="Notes" value={config.nutritionistNotes} />
      ) : null}
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
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
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
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              on
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
      className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
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
          className="block flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={commit}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
    <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
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
