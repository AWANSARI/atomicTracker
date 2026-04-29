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
import type { MealPlannerConfig } from "@/lib/tracker/meal-planner-types";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const CONFIG_FILE = "tracker.meal-planner.json";
const PLAN_DEEP_LINK_BASE = "https://atomictracker.vercel.app";

/**
 * Day-of-week → RRULE BYDAY token. Google's RRULE expects two-letter codes.
 */
const RRULE_DAY: Record<NonNullable<MealPlannerConfig["shoppingDay"]>, string> = {
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
  Sun: "SU",
};

/**
 * One-time setup of the three recurring reminders. Idempotent: deletes any
 * existing reminders (per the IDs stored in tracker config) before creating
 * fresh ones, so re-running this after editing config does NOT duplicate.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { timezone?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const timezone =
    typeof body.timezone === "string" && body.timezone ? body.timezone : "UTC";

  const config = await readMealPlannerConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Meal planner is not configured yet" },
      { status: 400 },
    );
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const configFolderId = layout.folderIds["config"];
  if (!configFolderId) {
    return NextResponse.json(
      { error: "Config folder missing — re-bootstrap from dashboard" },
      { status: 500 },
    );
  }

  // 1. Delete any existing reminder events (idempotency)
  const existing = config.reminderEventIds ?? {};
  const previousIds = [
    existing.fridayPlan,
    existing.sundayPrep,
    existing.weeklyShopping,
  ].filter((id): id is string => Boolean(id));
  const deletionResults: { id: string; deleted: boolean; error?: string }[] = [];
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

  // 2. Create the three recurring events. Anchor on a recent date (today) —
  // RRULE handles the recurrence, the start date just needs to fall on the
  // correct day-of-week. For weekly events Google auto-extends.
  const today = new Date();

  function nextDayOfWeek(target: number): Date {
    // target: 0=Sun..6=Sat (UTC)
    const d = new Date(today);
    d.setUTCHours(0, 0, 0, 0);
    const diff = (target - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return d;
  }
  const friday = nextDayOfWeek(5);
  const sunday = nextDayOfWeek(0);
  const dowToInt: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const shoppingAnchor = nextDayOfWeek(dowToInt[config.shoppingDay] ?? 6);

  const planUrl = `${PLAN_DEEP_LINK_BASE}/trackers/meal-planner`;
  const prepCheckinUrl = `${PLAN_DEEP_LINK_BASE}/trackers/meal-planner/prep`;

  const created: { name: string; ok: boolean; id?: string; htmlLink?: string; error?: string }[] = [];
  let fridayId: string | undefined;
  let sundayId: string | undefined;
  let shoppingId: string | undefined;

  try {
    const ev = await createEvent(session.accessToken, {
      summary: "AtomicTracker · Plan next week's meals",
      description: `Tap to generate next week's meal plan.\n\n${planUrl}`,
      source: { title: "AtomicTracker", url: planUrl },
      start: localDateTime(friday, "18:00", timezone),
      end: localDateTime(friday, "18:30", timezone),
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=FR"],
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 0 }],
      },
    });
    fridayId = ev.id;
    created.push({ name: "Friday plan reminder", ok: true, id: ev.id, htmlLink: ev.htmlLink });
  } catch (e) {
    created.push({
      name: "Friday plan reminder",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const ev = await createEvent(session.accessToken, {
      summary: "AtomicTracker · What did you prep this week?",
      description: `Tap to mark what you cooked and add breakfast/lunch/dinner to your Calendar.\n\n${prepCheckinUrl}`,
      source: { title: "AtomicTracker", url: prepCheckinUrl },
      start: localDateTime(sunday, "18:00", timezone),
      end: localDateTime(sunday, "18:30", timezone),
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SU"],
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 0 }],
      },
    });
    sundayId = ev.id;
    created.push({ name: "Sunday prep check-in", ok: true, id: ev.id, htmlLink: ev.htmlLink });
  } catch (e) {
    created.push({
      name: "Sunday prep check-in",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const shopTime = config.shoppingTime || "10:00";
    const ev = await createEvent(session.accessToken, {
      summary: "AtomicTracker · Grocery shopping",
      description:
        "Weekly grocery shopping. Latest list lives in your Drive at /AtomicTracker/grocery/.",
      start: localDateTime(shoppingAnchor, shopTime, timezone),
      end: localDateTime(shoppingAnchor, addMinutes(shopTime, 90), timezone),
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAY[config.shoppingDay]}`],
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 60 }],
      },
    });
    shoppingId = ev.id;
    created.push({ name: "Weekly shopping", ok: true, id: ev.id, htmlLink: ev.htmlLink });
  } catch (e) {
    created.push({
      name: "Weekly shopping",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. Persist the new event IDs back into the config
  const fileId = await findFile(session.accessToken, CONFIG_FILE, configFolderId);
  if (fileId) {
    try {
      const existingConfig = await readJson<MealPlannerConfig>(
        session.accessToken,
        fileId,
      );
      const updated: MealPlannerConfig = {
        ...existingConfig,
        reminderEventIds: {
          fridayPlan: fridayId,
          sundayPrep: sundayId,
          weeklyShopping: shoppingId,
        },
        updatedAt: new Date().toISOString(),
      };
      await upsertJson(session.accessToken, configFolderId, CONFIG_FILE, updated);
    } catch (e) {
      return NextResponse.json(
        {
          error: `Events created but config write failed: ${e instanceof Error ? e.message : String(e)}`,
          created,
          deleted: deletionResults,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    deleted: deletionResults,
    timezone,
  });
}
