"use client";

import { useRef, useState } from "react";
import {
  Camera,
  Check,
  Coffee,
  Image as ImageIcon,
  Loader2,
  Salad,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DAYS, type Day, type Meal, type MealPlan } from "@/lib/tracker/meal-planner-plan";

type Slot = "breakfast" | "lunch" | "dinner";

type Photo = {
  fileId: string;
  viewUrl: string;
  name: string;
};

type SlotState = {
  /** User-editable dish name (auto-filled from plan/defaults). */
  name: string;
  /** Did the user actually prep this? */
  prepped: boolean;
  /** Optional photo of the finished dish. */
  photo?: Photo;
};

type DayState = Record<Slot, SlotState>;

type PrepStateMap = Partial<Record<Day, DayState>>;

type SubmitResult = {
  ok: boolean;
  events?: { name: string; ok: boolean; htmlLink?: string; error?: string }[];
};

const SLOT_META: Record<Slot, { label: string; Icon: LucideIcon }> = {
  breakfast: { label: "Breakfast", Icon: Coffee },
  lunch: { label: "Lunch", Icon: Salad },
  dinner: { label: "Dinner", Icon: UtensilsCrossed },
};

/**
 * Re-design of the prep check-in flow:
 *  • Weekly grid (7 day rows) mirroring the meal-planner WeekCard.
 *  • Each day has B/L/D entries — toggle "prepped", edit dish name, upload
 *    a photo of the finished dish.
 *  • One submit creates 0–21 calendar events for that week and stashes the
 *    photo URLs in the event descriptions.
 */
export function PrepClient({
  plan,
  mealtimes,
  initialPrepped,
  initialPrep,
  defaultBreakfast,
  defaultLunch,
}: {
  plan: MealPlan;
  mealtimes: { breakfast: string; lunch: string; dinner: string };
  /** Legacy: list of prepped days from the v1 prep file. */
  initialPrepped: string[];
  /** Optional: structured prep state from a previous submission of this week. */
  initialPrep?: PrepStateMap;
  defaultBreakfast?: string;
  defaultLunch?: string;
}) {
  const dinnerByDay = new Map<Day, Meal>(
    plan.meals.map((m) => [m.day, m]),
  );

  function makeInitial(): PrepStateMap {
    const out: PrepStateMap = {};
    const preppedSet = new Set(initialPrepped);
    for (const day of DAYS) {
      const fromPrev = initialPrep?.[day];
      const dinner = dinnerByDay.get(day);
      out[day] = {
        breakfast: fromPrev?.breakfast ?? {
          name: defaultBreakfast ?? "",
          prepped: false,
        },
        lunch: fromPrev?.lunch ?? {
          name: defaultLunch ?? "",
          prepped: false,
        },
        dinner: fromPrev?.dinner ?? {
          name: dinner?.name ?? "",
          prepped: preppedSet.has(day),
        },
      };
    }
    return out;
  }

  const [state, setState] = useState<PrepStateMap>(makeInitial);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(day: Day, slot: Slot, patch: Partial<SlotState>) {
    setState((prev) => {
      const cur = prev[day]!;
      return {
        ...prev,
        [day]: { ...cur, [slot]: { ...cur[slot], ...patch } },
      };
    });
  }

  function setSlotForAllWeekdays(slot: "breakfast" | "lunch", name: string) {
    const days: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    setState((prev) => {
      const next: PrepStateMap = { ...prev };
      for (const d of days) {
        const cur = next[d]!;
        next[d] = { ...cur, [slot]: { ...cur[slot], name } };
      }
      return next;
    });
  }

  function selectAllDinners() {
    setState((prev) => {
      const next: PrepStateMap = { ...prev };
      for (const d of DAYS) {
        const cur = next[d]!;
        if (cur.dinner.name) {
          next[d] = { ...cur, dinner: { ...cur.dinner, prepped: true } };
        }
      }
      return next;
    });
  }

  function clearAll() {
    setState((prev) => {
      const next: PrepStateMap = {};
      for (const d of DAYS) {
        const cur = prev[d]!;
        next[d] = {
          breakfast: { ...cur.breakfast, prepped: false },
          lunch: { ...cur.lunch, prepped: false },
          dinner: { ...cur.dinner, prepped: false },
        };
      }
      return next;
    });
  }

  async function submit() {
    setError(null);
    setPending(true);
    setResult(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      // Build the per-day payload — strip empty slots so the server only
      // creates events that the user actually engaged with.
      const days: Record<string, unknown> = {};
      for (const d of DAYS) {
        const dayState = state[d];
        if (!dayState) continue;
        const entry: Record<string, unknown> = {};
        for (const slot of ["breakfast", "lunch", "dinner"] as Slot[]) {
          const s = dayState[slot];
          if (!s.prepped || !s.name.trim()) continue;
          entry[slot] = {
            name: s.name.trim(),
            photo: s.photo
              ? { fileId: s.photo.fileId, viewUrl: s.photo.viewUrl }
              : undefined,
          };
        }
        if (Object.keys(entry).length > 0) {
          days[d] = entry;
        }
      }
      const res = await fetch("/api/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId: plan.weekId,
          timezone: tz,
          days,
          // Legacy-compat fields so older /api/prep deployments still work.
          prepped: DAYS.filter((d) => state[d]?.dinner.prepped),
          breakfast: state.Mon?.breakfast.name?.trim() || undefined,
          lunch: state.Mon?.lunch.name?.trim() || undefined,
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
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      ev.ok
                        ? "text-slate-700 dark:text-slate-300"
                        : "text-red-900 dark:text-red-300"
                    }`}
                  >
                    {ev.ok ? (
                      <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
                    ) : (
                      <X className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400" strokeWidth={3} />
                    )}
                    {ev.name}
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

  // Weekly summary counts
  const counts = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const d of DAYS) {
    const day = state[d];
    if (!day) continue;
    if (day.breakfast.prepped) counts.breakfast += 1;
    if (day.lunch.prepped) counts.lunch += 1;
    if (day.dinner.prepped) counts.dinner += 1;
  }
  const total = counts.breakfast + counts.lunch + counts.dinner;

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-700 dark:text-slate-300">
          Tick any meal you actually prepped this week — breakfast, lunch, or
          dinner. We&apos;ll schedule each one on your Calendar at your
          configured times ({mealtimes.breakfast} · {mealtimes.lunch} ·{" "}
          {mealtimes.dinner}). Snap a photo of any dish and we&apos;ll attach
          it to its event.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={selectAllDinners}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            All dinners prepped
          </button>
          <button
            type="button"
            onClick={() =>
              setSlotForAllWeekdays(
                "breakfast",
                state.Mon?.breakfast.name ?? defaultBreakfast ?? "",
              )
            }
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Apply Mon breakfast → Mon-Fri
          </button>
          <button
            type="button"
            onClick={() =>
              setSlotForAllWeekdays(
                "lunch",
                state.Mon?.lunch.name ?? defaultLunch ?? "",
              )
            }
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Apply Mon lunch → Mon-Fri
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {DAYS.map((day) => {
          const ds = state[day]!;
          const dinnerMeal = dinnerByDay.get(day);
          return (
            <li
              key={day}
              className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {day}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  {[
                    ds.breakfast.prepped ? "B" : null,
                    ds.lunch.prepped ? "L" : null,
                    ds.dinner.prepped ? "D" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              <div className="space-y-2">
                <SlotRow
                  weekId={plan.weekId}
                  day={day}
                  slot="breakfast"
                  state={ds.breakfast}
                  onChange={(patch) => update(day, "breakfast", patch)}
                  placeholder="e.g. Overnight oats"
                />
                <SlotRow
                  weekId={plan.weekId}
                  day={day}
                  slot="lunch"
                  state={ds.lunch}
                  onChange={(patch) => update(day, "lunch", patch)}
                  placeholder="e.g. Quinoa salad"
                />
                <SlotRow
                  weekId={plan.weekId}
                  day={day}
                  slot="dinner"
                  state={ds.dinner}
                  onChange={(patch) => update(day, "dinner", patch)}
                  placeholder={dinnerMeal?.name ?? "Dinner dish"}
                  hint={dinnerMeal?.cuisine}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={submit}
        disabled={pending || total === 0}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? "Adding to your Calendar…"
          : total === 0
            ? "Tick at least one meal to schedule"
            : `Schedule ${total} meal${total === 1 ? "" : "s"}` +
              (counts.breakfast
                ? ` · ${counts.breakfast} breakfast${counts.breakfast === 1 ? "" : "s"}`
                : "") +
              (counts.lunch
                ? ` · ${counts.lunch} lunch${counts.lunch === 1 ? "" : "es"}`
                : "") +
              (counts.dinner
                ? ` · ${counts.dinner} dinner${counts.dinner === 1 ? "" : "s"}`
                : "")}
      </button>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function SlotRow({
  weekId,
  day,
  slot,
  state,
  onChange,
  placeholder,
  hint,
}: {
  weekId: string;
  day: Day;
  slot: Slot;
  state: SlotState;
  onChange: (patch: Partial<SlotState>) => void;
  placeholder?: string;
  hint?: string;
}) {
  const meta = SLOT_META[slot];
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function pickFile(file: File) {
    setUploadErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("weekId", weekId);
      fd.append("day", day);
      fd.append("slot", slot);
      fd.append("file", file);
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      const data = (await res.json()) as {
        fileId: string;
        viewUrl: string;
        name: string;
      };
      onChange({
        photo: { fileId: data.fileId, viewUrl: data.viewUrl, name: data.name },
        // Auto-tick prepped on photo upload
        prepped: true,
      });
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-2 transition ${
        state.prepped
          ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      }`}
    >
      <button
        type="button"
        onClick={() => onChange({ prepped: !state.prepped })}
        aria-label={state.prepped ? `Unmark ${meta.label}` : `Mark ${meta.label} prepped`}
        className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold transition ${
          state.prepped
            ? "bg-emerald-600 text-white"
            : "border border-slate-300 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-700"
        }`}
      >
        {state.prepped ? <Check className="h-3.5 w-3.5" /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <meta.Icon className="h-3 w-3 shrink-0" />
            {meta.label}
            {hint ? (
              <span className="ml-1 text-[10px] font-normal text-slate-400 dark:text-slate-500">
                · {hint}
              </span>
            ) : null}
          </p>
        </div>
        <input
          type="text"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={placeholder}
          className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {state.photo ? (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900">
            <ImageIcon className="h-3 w-3 shrink-0 text-slate-400" />
            <a
              href={state.photo.viewUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-slate-700 hover:underline dark:text-slate-300"
            >
              {state.photo.name}
            </a>
            <button
              type="button"
              onClick={() => onChange({ photo: undefined })}
              aria-label="Remove photo"
              className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
        {uploadErr ? (
          <p className="mt-1 text-[10px] text-red-700 dark:text-red-400">
            {uploadErr}
          </p>
        ) : null}
      </div>

      <div className="shrink-0">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={state.photo ? "Replace photo" : "Add photo"}
          className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
