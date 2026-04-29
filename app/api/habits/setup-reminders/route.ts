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
import {
  emptyHabitConfig,
  type Habit,
  type HabitConfig,
  type HabitWeekday,
} from "@/lib/tracker/habit-types";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const CONFIG_FILE = "tracker.habits.json";
const DEEP_LINK = "https://atomictracker.vercel.app/trackers/habits";

const RRULE_DAY: Record<HabitWeekday, string> = {
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
  Sun: "SU",
};
const WEEKDAY_TO_INT: Record<HabitWeekday, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function nextDayOfWeek(target: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const diff = (target - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/**
 * Build the recurrence + start anchor for a habit based on its cadence.
 * Returns null if the habit is configured in a way that has no expected days
 * (e.g. custom with empty customDays) — those skip reminder creation.
 */
function recurrenceFor(
  habit: Habit,
): { recurrence: string[]; anchor: Date } | null {
  switch (habit.cadence) {
    case "daily": {
      const anchor = nextDayOfWeek(new Date().getUTCDay());
      return { recurrence: ["RRULE:FREQ=DAILY"], anchor };
    }
    case "weekdays": {
      // Anchor on the next Mon so users see the first event in-week.
      const anchor = nextDayOfWeek(1);
      return {
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
        anchor,
      };
    }
    case "weekly": {
      const day = habit.weeklyDay ?? "Sun";
      const anchor = nextDayOfWeek(WEEKDAY_TO_INT[day]);
      return {
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAY[day]}`],
        anchor,
      };
    }
    case "custom": {
      const days = habit.customDays ?? [];
      if (days.length === 0) return null;
      const byday = days.map((d) => RRULE_DAY[d]).join(",");
      // Anchor on whichever listed day comes first from today.
      const anchor = days
        .map((d) => nextDayOfWeek(WEEKDAY_TO_INT[d]))
        .sort((a, b) => a.getTime() - b.getTime())[0]!;
      return {
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byday}`],
        anchor,
      };
    }
    default:
      return null;
  }
}

/**
 * Idempotently create per-habit recurring reminders. Deletes any previously
 * stored event IDs first so re-running after a config edit doesn't duplicate.
 *
 * If `remindersEnabled` is false, all existing reminder events are deleted
 * and the config is updated to clear `reminderEventIds` — call this route
 * after toggling reminders OFF to clean up.
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

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const configFolderId = layout.folderIds["config"];
  if (!configFolderId) {
    return NextResponse.json(
      { error: "config folder missing" },
      { status: 500 },
    );
  }

  const fileId = await findFile(session.accessToken, CONFIG_FILE, configFolderId);
  if (!fileId) {
    return NextResponse.json(
      { error: "Habits not configured yet" },
      { status: 400 },
    );
  }
  let config: HabitConfig;
  try {
    const raw = await readJson<Partial<HabitConfig>>(session.accessToken, fileId);
    const defaults = emptyHabitConfig();
    config = {
      ...defaults,
      ...raw,
      v: 1,
      habits: raw.habits ?? [],
      remindersEnabled: raw.remindersEnabled ?? false,
      createdAt: raw.createdAt ?? defaults.createdAt,
      updatedAt: raw.updatedAt ?? defaults.updatedAt,
    };
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to read config: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  // 1. Delete any existing per-habit reminder events
  const deletionResults: { id: string; deleted: boolean; error?: string }[] = [];
  for (const habit of config.habits) {
    for (const id of habit.reminderEventIds ?? []) {
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
  }

  // If reminders are disabled, persist the cleared IDs and exit.
  if (!config.remindersEnabled) {
    const cleared: HabitConfig = {
      ...config,
      habits: config.habits.map((h) => ({ ...h, reminderEventIds: [] })),
      updatedAt: new Date().toISOString(),
    };
    await upsertJson(session.accessToken, configFolderId, CONFIG_FILE, cleared);
    return NextResponse.json({
      ok: true,
      created: [],
      deleted: deletionResults,
      timezone,
      remindersEnabled: false,
    });
  }

  // 2. Create one recurring event per habit
  const dailyTime = config.reminderTime || "09:00";
  const weeklyTime = config.weeklyReminderTime || "19:00";
  const created: { habitId: string; ok: boolean; id?: string; error?: string }[] =
    [];
  const updatedHabits: Habit[] = [];

  for (const habit of config.habits) {
    const rec = recurrenceFor(habit);
    if (!rec) {
      updatedHabits.push({ ...habit, reminderEventIds: [] });
      continue;
    }
    const time = habit.cadence === "weekly" ? weeklyTime : dailyTime;
    try {
      const ev = await createEvent(session.accessToken, {
        summary: `AtomicTracker · ${habit.name}`,
        description: `Daily habit check-in.\n\nTap to mark this habit done for today.\n\n${DEEP_LINK}`,
        source: { title: "AtomicTracker", url: DEEP_LINK },
        start: localDateTime(rec.anchor, time, timezone),
        end: localDateTime(rec.anchor, addMinutes(time, 15), timezone),
        recurrence: rec.recurrence,
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 0 }],
        },
      });
      created.push({ habitId: habit.id, ok: true, id: ev.id });
      updatedHabits.push({ ...habit, reminderEventIds: [ev.id] });
    } catch (e) {
      created.push({
        habitId: habit.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      updatedHabits.push({ ...habit, reminderEventIds: [] });
    }
  }

  // 3. Persist the updated config back
  const updated: HabitConfig = {
    ...config,
    habits: updatedHabits,
    updatedAt: new Date().toISOString(),
  };
  try {
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

  return NextResponse.json({
    ok: true,
    created,
    deleted: deletionResults,
    timezone,
    remindersEnabled: true,
  });
}
