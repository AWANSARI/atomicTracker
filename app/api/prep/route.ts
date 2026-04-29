import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import {
  addMinutes,
  createEvent,
  deleteEvent,
  localDateTime,
} from "@/lib/google/calendar";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { type Day, type MealPlan } from "@/lib/tracker/meal-planner-plan";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const VALID_DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_OFFSETS: Record<Day, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};
// Mon-Fri offsets, used as the legacy fallback for breakfast/lunch
const WEEKDAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

type Slot = "breakfast" | "lunch" | "dinner";
type SlotEntry = {
  name: string;
  photo?: { fileId: string; viewUrl: string };
};
type DayEntry = Partial<Record<Slot, SlotEntry>>;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    weekId?: string;
    timezone?: string;
    /** New structured payload: per-day breakfast/lunch/dinner with optional photos. */
    days?: Record<string, DayEntry>;
    /** Legacy fields (still honored if `days` is missing). */
    prepped?: string[];
    breakfast?: string;
    lunch?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const weekId = body.weekId;
  const timezone =
    typeof body.timezone === "string" && body.timezone ? body.timezone : "UTC";

  if (!weekId) {
    return NextResponse.json({ error: "Missing weekId" }, { status: 400 });
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const mealsFolderId = layout.folderIds["history/meals"];
  if (!mealsFolderId) {
    return NextResponse.json(
      { error: "Drive folders missing — re-bootstrap from dashboard" },
      { status: 500 },
    );
  }

  const planFileId = await findFile(
    session.accessToken,
    `${weekId}.json`,
    mealsFolderId,
  );
  if (!planFileId) {
    return NextResponse.json(
      { error: "No accepted plan for this week" },
      { status: 404 },
    );
  }
  const plan = await readJson<MealPlan>(session.accessToken, planFileId).catch(
    () => null,
  );
  if (!plan) {
    return NextResponse.json({ error: "Couldn't read plan" }, { status: 500 });
  }

  const config = await readMealPlannerConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Meal planner config missing" },
      { status: 400 },
    );
  }

  // ── Normalize the payload ────────────────────────────────────────────────
  // Prefer the new `days` structure. If absent, synthesize it from legacy
  // fields (prepped + breakfast + lunch) so older clients still work.
  const days: Partial<Record<Day, DayEntry>> = {};
  if (body.days && typeof body.days === "object") {
    for (const [k, v] of Object.entries(body.days)) {
      if (!VALID_DAYS.includes(k as Day)) continue;
      if (!v || typeof v !== "object") continue;
      const entry: DayEntry = {};
      for (const slot of ["breakfast", "lunch", "dinner"] as Slot[]) {
        const s = (v as DayEntry)[slot];
        if (!s || typeof s.name !== "string" || !s.name.trim()) continue;
        entry[slot] = {
          name: s.name.trim(),
          photo:
            s.photo && typeof s.photo.fileId === "string"
              ? { fileId: s.photo.fileId, viewUrl: String(s.photo.viewUrl) }
              : undefined,
        };
      }
      if (Object.keys(entry).length > 0) days[k as Day] = entry;
    }
  } else {
    const prepped = (body.prepped ?? []).filter((d): d is Day =>
      VALID_DAYS.includes(d as Day),
    );
    const breakfastName = (body.breakfast ?? "").trim();
    const lunchName = (body.lunch ?? "").trim();
    for (const d of prepped) {
      const meal = plan.meals.find((m) => m.day === d);
      const entry: DayEntry = {};
      if (meal) entry.dinner = { name: meal.name };
      days[d] = entry;
    }
    if (breakfastName) {
      for (const d of WEEKDAYS) {
        const e = days[d] ?? {};
        e.breakfast = { name: breakfastName };
        days[d] = e;
      }
    }
    if (lunchName) {
      for (const d of WEEKDAYS) {
        const e = days[d] ?? {};
        e.lunch = { name: lunchName };
        days[d] = e;
      }
    }
  }

  // ── Delete previous events from this week's prep submission, if any ──────
  const existingPrepFileId = await findFile(
    session.accessToken,
    `${weekId}-prep.json`,
    mealsFolderId,
  );
  let previousEventIds: string[] = [];
  if (existingPrepFileId) {
    try {
      const previousPrep = await readJson<{ calendarEventIds?: unknown }>(
        session.accessToken,
        existingPrepFileId,
      );
      if (Array.isArray(previousPrep.calendarEventIds)) {
        previousEventIds = previousPrep.calendarEventIds.filter(
          (id): id is string => typeof id === "string",
        );
      }
    } catch {
      // Ignore: malformed previous file, proceed without deletes
    }
  }
  const deletionResults: { id: string; deleted: boolean }[] = [];
  for (const eventId of previousEventIds) {
    try {
      const deleted = await deleteEvent(session.accessToken, eventId);
      deletionResults.push({ id: eventId, deleted });
    } catch {
      deletionResults.push({ id: eventId, deleted: false });
    }
  }

  // ── Build calendar events ────────────────────────────────────────────────
  const weekStartDate = new Date(plan.weekStart + "T00:00:00Z");
  const events: {
    name: string;
    ok: boolean;
    htmlLink?: string;
    error?: string;
  }[] = [];
  const newEventIds: string[] = [];

  const SLOT_TIME: Record<Slot, () => string> = {
    breakfast: () => config.mealtimes.breakfast,
    lunch: () => config.mealtimes.lunch,
    dinner: () => config.mealtimes.dinner,
  };
  const SLOT_DURATION: Record<Slot, number> = {
    breakfast: 30,
    lunch: 30,
    dinner: 60,
  };
  const SLOT_EMOJI: Record<Slot, string> = {
    breakfast: "☕",
    lunch: "🥗",
    dinner: "🍽",
  };

  for (const day of VALID_DAYS) {
    const dayEntry = days[day];
    if (!dayEntry) continue;
    for (const slot of ["breakfast", "lunch", "dinner"] as Slot[]) {
      const entry = dayEntry[slot];
      if (!entry) continue;
      const dayDate = new Date(weekStartDate);
      dayDate.setUTCDate(weekStartDate.getUTCDate() + DAY_OFFSETS[day]);
      const startTime = SLOT_TIME[slot]();
      const start = localDateTime(dayDate, startTime, timezone);
      const end = localDateTime(
        dayDate,
        addMinutes(startTime, SLOT_DURATION[slot]),
        timezone,
      );

      // Pull dinner-meal context (storage/reheat/etc.) if available so the
      // event description is rich, not just a name.
      const dinnerMeal =
        slot === "dinner" ? plan.meals.find((m) => m.day === day) : null;
      const descParts: string[] = [];
      descParts.push(
        `${slot.charAt(0).toUpperCase() + slot.slice(1)} — scheduled via AtomicTracker prep check-in.`,
      );
      if (dinnerMeal) {
        descParts.push(
          "",
          `${dinnerMeal.cuisine} · ${dinnerMeal.calories} kcal`,
          `Macros — P ${dinnerMeal.macros.protein_g}g / C ${dinnerMeal.macros.carbs_g}g / F ${dinnerMeal.macros.fat_g}g / Fib ${dinnerMeal.macros.fiber_g}g`,
        );
        if (dinnerMeal.health_notes) descParts.push("", dinnerMeal.health_notes);
        if (dinnerMeal.storage)
          descParts.push("", `Store: ${dinnerMeal.storage}`);
        if (dinnerMeal.reheat) descParts.push(`Reheat: ${dinnerMeal.reheat}`);
        if (dinnerMeal.recipe_video?.url)
          descParts.push(
            "",
            `Recipe: ${dinnerMeal.recipe_video.title} — ${dinnerMeal.recipe_video.url}`,
          );
      }
      if (entry.photo?.viewUrl) {
        descParts.push("", `📷 Photo: ${entry.photo.viewUrl}`);
      }

      try {
        const ev = await createEvent(session.accessToken, {
          summary: `${SLOT_EMOJI[slot]} ${entry.name}`,
          description: descParts.join("\n"),
          start,
          end,
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 30 }],
          },
          ...(entry.photo?.viewUrl
            ? { source: { title: "Photo", url: entry.photo.viewUrl } }
            : dinnerMeal?.recipe_video?.url
              ? {
                  source: {
                    title: "Recipe video",
                    url: dinnerMeal.recipe_video.url,
                  },
                }
              : {}),
        });
        newEventIds.push(ev.id);
        events.push({
          name: `${day} · ${slot} · ${entry.name}`,
          ok: true,
          htmlLink: ev.htmlLink,
        });
      } catch (e) {
        events.push({
          name: `${day} · ${slot} · ${entry.name}`,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // ── Save prep state ──────────────────────────────────────────────────────
  // Backwards compatible: keep `prepped` for older readers, and also the
  // structured `days` so the next visit can re-hydrate the form.
  try {
    await upsertJson(session.accessToken, mealsFolderId, `${weekId}-prep.json`, {
      v: 2,
      weekId,
      prepped: VALID_DAYS.filter((d) => days[d]?.dinner),
      breakfast: days.Mon?.breakfast?.name,
      lunch: days.Mon?.lunch?.name,
      days,
      submittedAt: new Date().toISOString(),
      timezone,
      calendarEventIds: newEventIds,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Calendar events created but prep.json write failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        events,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    events,
    deleted: deletionResults,
    resubmit: previousEventIds.length > 0,
  });
}
