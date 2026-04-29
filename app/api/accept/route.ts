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
import { createEvent, localDateTime } from "@/lib/google/calendar";
import { buildGroceryRows, rowsToCsv } from "@/lib/tracker/grocery";
import {
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const PLAN_DEEP_LINK_BASE = "https://atomictracker.vercel.app";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { weekId?: string; timezone?: string; mealtimes?: { breakfast: string; lunch: string; dinner: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const weekId = body.weekId;
  const timezone =
    typeof body.timezone === "string" && body.timezone ? body.timezone : "UTC";

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

  // 1. Build + write grocery CSV and JSON mirror
  const rows = buildGroceryRows(plan);
  const csv = rowsToCsv(rows);
  let csvFileId: string;
  let groceryJsonId: string;
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

  // 2. Save plan as accepted, delete draft if it was a separate file
  const acceptedPlan: MealPlan = {
    ...plan,
    status: "accepted",
  };
  let acceptedFileId: string;
  try {
    acceptedFileId = await upsertJson(
      session.accessToken,
      mealsFolderId,
      `${weekId}.json`,
      acceptedPlan,
    );
    // If we read from a draft (not the same file as accepted), trash the draft.
    const draftStillExists = await findFile(
      session.accessToken,
      `${weekId}.draft.json`,
      mealsFolderId,
    );
    if (draftStillExists) {
      await deleteFile(session.accessToken, draftStillExists);
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
    eventResults.push({ name: "Grocery shopping", ok: true, htmlLink: ev3.htmlLink });
  } catch (e) {
    eventResults.push({
      name: "Grocery shopping",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return NextResponse.json({
    ok: true,
    weekId,
    plan: acceptedPlan,
    csv: {
      driveFileId: csvFileId,
      jsonMirrorId: groceryJsonId,
      itemCount: rows.length,
    },
    calendar: {
      events: eventResults,
    },
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
