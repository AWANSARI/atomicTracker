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
  // Full re-accept (no onlyDays): clear admin events + ALL per-day dinner events.
  // Partial re-accept (onlyDays set): clear ONLY the per-day events for those days.
  const previousAdminEventIds: string[] = partial
    ? []
    : Array.isArray(plan.calendarEventIds)
      ? plan.calendarEventIds
      : [];
  const previousDayEventIds: { day: Day; id: string }[] = [];
  const existingByDay = plan.eventIdByDay ?? {};
  for (const day of (Object.keys(existingByDay) as Day[])) {
    if (partial && !onlyDays.includes(day)) continue;
    const id = existingByDay[day];
    if (id) previousDayEventIds.push({ day, id });
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
  for (const { id } of previousDayEventIds) {
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

  // 3. Create Calendar events
  // Use this Saturday (i.e. Saturday in the upcoming or current week) as the grocery shopping day.
  const grocerySaturday = computeNextSaturday();

  const planUrl = `${PLAN_DEEP_LINK_BASE}/trackers/meal-planner/plan?week=${weekId}`;
  const prepCheckinUrl = `${PLAN_DEEP_LINK_BASE}/trackers/meal-planner/prep?week=${weekId}`;

  const eventResults: { name: string; ok: boolean; htmlLink?: string; error?: string }[] = [];
  const newAdminEventIds: string[] = [];
  const newEventIdByDay: Partial<Record<Day, string>> = {};

  // ---- Per-day dinner events (always created) ----
  const weekStartDate = new Date(plan.weekStart + "T00:00:00Z");
  const DAY_OFFSETS: Record<Day, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const dinnerTime = config?.mealtimes.dinner ?? "19:00";

  for (const meal of plan.meals) {
    if (partial && !onlyDays.includes(meal.day)) continue;
    const dayDate = new Date(weekStartDate);
    dayDate.setUTCDate(weekStartDate.getUTCDate() + DAY_OFFSETS[meal.day]);
    try {
      const ev = await createEvent(session.accessToken, {
        summary: `🍽 ${meal.name}`,
        description: [
          `${meal.cuisine} · ${meal.calories} kcal`,
          `Macros — P ${meal.macros.protein_g}g / C ${meal.macros.carbs_g}g / F ${meal.macros.fat_g}g / Fib ${meal.macros.fiber_g}g`,
          "",
          meal.health_notes,
          "",
          "Ingredients:",
          ...meal.ingredients.map((i) => `  • ${i.qty} ${i.unit} ${i.name}`),
          "",
          `Instructions: ${meal.instructions}`,
          ...(meal.recipe_video?.url
            ? ["", `Recipe: ${meal.recipe_video.title} — ${meal.recipe_video.url}`]
            : meal.recipe_url
              ? ["", `Recipe search: ${meal.recipe_url}`]
              : []),
        ].join("\n"),
        start: localDateTime(dayDate, dinnerTime, timezone),
        end: localDateTime(dayDate, addMinutes(dinnerTime, 60), timezone),
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
        ...(meal.recipe_video?.url
          ? { source: { title: "Recipe video", url: meal.recipe_video.url } }
          : {}),
      });
      newEventIdByDay[meal.day] = ev.id;
      eventResults.push({ name: `${meal.day} · ${meal.name}`, ok: true, htmlLink: ev.htmlLink });
    } catch (e) {
      eventResults.push({
        name: `${meal.day} · ${meal.name}`,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ---- Admin events (only on full accept) ----
  if (partial) {
    // Skip admin event creation; preserve existing IDs in acceptedPlan.calendarEventIds
  } else {
  try {
    const ev1 = await createEvent(session.accessToken, {
      summary: "AtomicTracker · Plan next week's meals",
      description: `Tap to generate next week's meal plan.\n\n${planUrl}`,
      source: { title: "AtomicTracker", url: planUrl },
      start: localDateTime(grocerySaturday, "18:00", timezone),
      end: localDateTime(grocerySaturday, "18:30", timezone),
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=FR"],
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 0 }],
      },
    });
    newAdminEventIds.push(ev1.id);
    eventResults.push({ name: "Friday plan reminder", ok: true, htmlLink: ev1.htmlLink });
  } catch (e) {
    eventResults.push({
      name: "Friday plan reminder",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const ev2 = await createEvent(session.accessToken, {
      summary: "AtomicTracker · What did you prep this week?",
      description: `Tap to mark what you cooked and add breakfast/lunch/dinner to your Calendar.\n\n${prepCheckinUrl}`,
      source: { title: "AtomicTracker", url: prepCheckinUrl },
      start: localDateTime(grocerySaturday, "18:00", timezone),
      end: localDateTime(grocerySaturday, "18:30", timezone),
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SU"],
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 0 }],
      },
    });
    newAdminEventIds.push(ev2.id);
    eventResults.push({ name: "Sunday prep check-in", ok: true, htmlLink: ev2.htmlLink });
  } catch (e) {
    eventResults.push({
      name: "Sunday prep check-in",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const groceryDescription =
      `Grocery list for week ${weekId} (${plan.weekStart} → ${plan.weekEnd}):\n\n` +
      rows.map((r) => `• ${r.qty} ${r.unit} ${r.item}`).join("\n") +
      `\n\nFull CSV in your Drive at /AtomicTracker/grocery/${weekId}-list.csv`;
    const ev3 = await createEvent(session.accessToken, {
      summary: `AtomicTracker · Grocery shopping for week of ${plan.weekStart}`,
      description: groceryDescription,
      source: {
        title: "AtomicTracker grocery list",
        url: `https://drive.google.com/file/d/${csvFileId}/view`,
      },
      start: localDateTime(grocerySaturday, "10:00", timezone),
      end: localDateTime(grocerySaturday, "11:30", timezone),
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 60 }],
      },
    });
    newAdminEventIds.push(ev3.id);
    eventResults.push({ name: "Grocery shopping", ok: true, htmlLink: ev3.htmlLink });
  } catch (e) {
    eventResults.push({
      name: "Grocery shopping",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  } // end of !partial admin events block

  // Persist the new event IDs back into the accepted plan.
  if (!partial) {
    acceptedPlan.calendarEventIds = newAdminEventIds;
    acceptedPlan.eventIdByDay = newEventIdByDay;
  } else {
    acceptedPlan.eventIdByDay = {
      ...(acceptedPlan.eventIdByDay ?? {}),
      ...newEventIdByDay,
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
    reaccept: previousAdminEventIds.length > 0 || previousDayEventIds.length > 0,
  });
}

/** Saturday on or after today (UTC). Used for the grocery-shopping event start. */
function computeNextSaturday(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  const daysUntilSat = day <= 6 ? (6 - day) : 0;
  const sat = new Date(now);
  sat.setUTCDate(now.getUTCDate() + daysUntilSat);
  sat.setUTCHours(0, 0, 0, 0);
  return sat;
}
