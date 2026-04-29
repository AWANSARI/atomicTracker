import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  deleteFile,
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
  upsertText,
} from "@/lib/google/drive";
import { addMinutes, createEvent, deleteEvent, localDateTime } from "@/lib/google/calendar";
import { buildGroceryRows, rowsToCsv } from "@/lib/tracker/grocery";
import {
  type Day,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const PLAN_DEEP_LINK_BASE = "https://atomictracker.vercel.app";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    weekId?: string;
    timezone?: string;
    /** Optional: if set, only re-accept these specific days (per-day partial re-accept). */
    onlyDays?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const weekId = body.weekId;
  const timezone =
    typeof body.timezone === "string" && body.timezone ? body.timezone : "UTC";
  const onlyDays = (body.onlyDays ?? []).filter(
    (d): d is Day => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(d),
  );
  const partial = onlyDays.length > 0;

  if (!weekId || typeof weekId !== "string") {
    return NextResponse.json({ error: "Missing weekId" }, { status: 400 });
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const mealsFolderId = layout.folderIds["history/meals"];
  const groceryFolderId = layout.folderIds["grocery"];
  if (!mealsFolderId || !groceryFolderId) {
    return NextResponse.json(
      { error: "Drive folders missing — re-bootstrap from dashboard" },
      { status: 500 },
    );
  }

  // Load draft (or already-accepted, in which case we'll re-accept)
  const draftId =
    (await findFile(session.accessToken, `${weekId}.draft.json`, mealsFolderId)) ||
    (await findFile(session.accessToken, `${weekId}.json`, mealsFolderId));
  if (!draftId) {
    return NextResponse.json({ error: "No plan found for this week" }, { status: 404 });
  }
  let plan: MealPlan;
  try {
    plan = await readJson<MealPlan>(session.accessToken, draftId);
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't read plan: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  // 0. Delete previous events for the days we're re-accepting.
  // Full re-accept (no onlyDays): clear admin events + ALL per-(day,slot) events.
  // Partial re-accept (onlyDays set): clear ONLY events for those days.
  const previousAdminEventIds: string[] = partial
    ? []
    : Array.isArray(plan.calendarEventIds)
      ? plan.calendarEventIds
      : [];
  const previousIds: string[] = [];
  // Prefer the slot-aware map (new plans). Fall back to legacy day-only map
  // for plans saved before the multi-slot rewrite.
  const existingBySlot = plan.eventIdByDaySlot ?? {};
  for (const key of Object.keys(existingBySlot)) {
    const day = key.split("/")[0] as Day;
    if (partial && !onlyDays.includes(day)) continue;
    const id = existingBySlot[key];
    if (id) previousIds.push(id);
  }
  // Legacy fallback — only consult if slot-aware map was empty for this day
  // to avoid double-deleting the same dinner ID.
  const slotAwareDays = new Set(
    Object.keys(existingBySlot).map((k) => k.split("/")[0]),
  );
  const existingByDay = plan.eventIdByDay ?? {};
  for (const day of (Object.keys(existingByDay) as Day[])) {
    if (partial && !onlyDays.includes(day)) continue;
    if (slotAwareDays.has(day)) continue;
    const id = existingByDay[day];
    if (id) previousIds.push(id);
  }
  const deletionResults: { id: string; deleted: boolean; error?: string }[] = [];
  for (const eventId of previousAdminEventIds) {
    try {
      const deleted = await deleteEvent(session.accessToken, eventId);
      deletionResults.push({ id: eventId, deleted });
    } catch (e) {
      deletionResults.push({
        id: eventId,
        deleted: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  for (const id of previousIds) {
    try {
      const deleted = await deleteEvent(session.accessToken, id);
      deletionResults.push({ id, deleted });
    } catch (e) {
      deletionResults.push({
        id,
        deleted: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Need config for dinner time
  const config = await readMealPlannerConfig();

  // 1. Build + write grocery CSV and JSON mirror.
  // Skip on partial re-accept (CSV doesn't reflect per-day deltas cleanly).
  const rows = buildGroceryRows(plan);
  const csv = rowsToCsv(rows);
  let csvFileId: string | null = null;
  let groceryJsonId: string | null = null;
  if (!partial) {
    try {
      csvFileId = await upsertText(
        session.accessToken,
        groceryFolderId,
        `${weekId}-list.csv`,
        csv,
        "text/csv",
      );
      groceryJsonId = await upsertJson(
        session.accessToken,
        groceryFolderId,
        `${weekId}-list.json`,
        { week: weekId, generatedAt: new Date().toISOString(), rows },
      );
    } catch (e) {
      return NextResponse.json(
        { error: `Drive write (grocery) failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 },
      );
    }
  }

  // 2. Save plan as accepted, delete draft if it was a separate file.
  // For full accept: reset both adminEventIds + per-day eventIdByDay to be filled below.
  // For partial: keep existing structure, only mutate the touched days below.
  const acceptedPlan: MealPlan = {
    ...plan,
    status: "accepted",
    acceptedAt: partial ? plan.acceptedAt ?? new Date().toISOString() : new Date().toISOString(),
    calendarEventIds: partial ? plan.calendarEventIds ?? [] : [],
    eventIdByDay: partial ? { ...(plan.eventIdByDay ?? {}) } : {},
    modifiedByDay: partial
      ? Object.fromEntries(
          Object.entries(plan.modifiedByDay ?? {}).filter(([d]) => !onlyDays.includes(d as Day)),
        )
      : {},
  };
  // Clear per-day event IDs we just deleted (will be repopulated below for the days we re-create).
  if (partial) {
    for (const day of onlyDays) {
      delete acceptedPlan.eventIdByDay![day];
    }
  }
  try {
    await upsertJson(
      session.accessToken,
      mealsFolderId,
      `${weekId}.json`,
      acceptedPlan,
    );
    if (!partial) {
      const draftStillExists = await findFile(
        session.accessToken,
        `${weekId}.draft.json`,
        mealsFolderId,
      );
      if (draftStillExists) {
        await deleteFile(session.accessToken, draftStillExists);
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Drive write (plan) failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  // 3. Create Calendar events — one per meal (B/L/D/Snack) on its slot time.

  const eventResults: { name: string; ok: boolean; htmlLink?: string; error?: string }[] = [];
  const newAdminEventIds: string[] = [];
  const newEventIdByDay: Partial<Record<Day, string>> = {};
  const newEventIdByDaySlot: Partial<Record<string, string>> = {};

  const weekStartDate = new Date(plan.weekStart + "T00:00:00Z");
  const DAY_OFFSETS: Record<Day, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };

  // Slot → time + duration + emoji. Snack defaults to mid-afternoon.
  const SLOT_EMOJI: Record<string, string> = {
    breakfast: "🥣",
    lunch: "🥗",
    dinner: "🍽",
    snack: "🥜",
  };
  const SLOT_DURATION_MIN: Record<string, number> = {
    breakfast: 30,
    lunch: 45,
    dinner: 60,
    snack: 15,
  };
  function slotTime(slot: string): string {
    if (!config) return "19:00";
    if (slot === "breakfast") return config.mealtimes.breakfast;
    if (slot === "lunch") return config.mealtimes.lunch;
    if (slot === "dinner") return config.mealtimes.dinner;
    // Snack: pick a time between lunch + dinner, default 16:30.
    if (slot === "snack") return "16:30";
    return config.mealtimes.dinner;
  }

  for (const meal of plan.meals) {
    if (partial && !onlyDays.includes(meal.day)) continue;
    const slot = meal.slot ?? "dinner";
    const dayDate = new Date(weekStartDate);
    dayDate.setUTCDate(weekStartDate.getUTCDate() + DAY_OFFSETS[meal.day]);
    const startTime = slotTime(slot);
    try {
      const ev = await createEvent(session.accessToken, {
        summary: `${SLOT_EMOJI[slot] ?? "🍽"} ${meal.name}`,
        description: [
          `${slot.charAt(0).toUpperCase() + slot.slice(1)} · ${meal.cuisine} · ${meal.calories} kcal`,
          `Macros — P ${meal.macros.protein_g}g / C ${meal.macros.carbs_g}g / F ${meal.macros.fat_g}g / Fib ${meal.macros.fiber_g}g`,
          "",
          meal.health_notes,
          "",
          "Ingredients:",
          ...meal.ingredients.map((i) => `  • ${i.qty} ${i.unit} ${i.name}`),
          "",
          `Instructions: ${meal.instructions}`,
          ...(meal.storage ? ["", `Store: ${meal.storage}`] : []),
          ...(meal.reheat ? [`Reheat: ${meal.reheat}`] : []),
          ...(meal.recipe_video?.url
            ? ["", `Recipe: ${meal.recipe_video.title} — ${meal.recipe_video.url}`]
            : meal.recipe_url
              ? ["", `Recipe search: ${meal.recipe_url}`]
              : []),
          ...(meal.recipe_alternatives && meal.recipe_alternatives.length > 0
            ? [
                "",
                "More recipes:",
                ...meal.recipe_alternatives.map((alt) => `  • ${alt.title} — ${alt.url}`),
              ]
            : []),
        ].join("\n"),
        start: localDateTime(dayDate, startTime, timezone),
        end: localDateTime(dayDate, addMinutes(startTime, SLOT_DURATION_MIN[slot] ?? 30), timezone),
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
        ...(meal.recipe_video?.url
          ? { source: { title: "Recipe video", url: meal.recipe_video.url } }
          : {}),
      });
      newEventIdByDaySlot[`${meal.day}/${slot}`] = ev.id;
      // Keep the legacy dinner-only map populated for back-compat with the
      // existing per-day re-accept UI in PlanClient.
      if (slot === "dinner") {
        newEventIdByDay[meal.day] = ev.id;
      }
      eventResults.push({
        name: `${meal.day} · ${slot} · ${meal.name}`,
        ok: true,
        htmlLink: ev.htmlLink,
      });
    } catch (e) {
      eventResults.push({
        name: `${meal.day} · ${slot} · ${meal.name}`,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Admin events (Friday plan / Sunday prep / weekly shopping) are now
  // created once via /api/setup-reminders and stored on the user's config
  // (NOT on each plan). This avoids the duplicate-events-per-week bug.

  // Persist the new event IDs back into the accepted plan.
  if (!partial) {
    acceptedPlan.calendarEventIds = newAdminEventIds;
    acceptedPlan.eventIdByDay = newEventIdByDay;
    acceptedPlan.eventIdByDaySlot = newEventIdByDaySlot;
  } else {
    acceptedPlan.eventIdByDay = {
      ...(acceptedPlan.eventIdByDay ?? {}),
      ...newEventIdByDay,
    };
    acceptedPlan.eventIdByDaySlot = {
      ...(acceptedPlan.eventIdByDaySlot ?? {}),
      ...newEventIdByDaySlot,
    };
  }
  try {
    await upsertJson(
      session.accessToken,
      mealsFolderId,
      `${weekId}.json`,
      acceptedPlan,
    );
  } catch (e) {
    eventResults.push({
      name: "Save plan with event IDs",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return NextResponse.json({
    ok: true,
    weekId,
    plan: acceptedPlan,
    partial,
    csv: partial
      ? null
      : {
          driveFileId: csvFileId,
          jsonMirrorId: groceryJsonId,
          itemCount: rows.length,
        },
    calendar: {
      events: eventResults,
      deleted: deletionResults,
    },
    reaccept: previousAdminEventIds.length > 0 || previousIds.length > 0,
  });
}

