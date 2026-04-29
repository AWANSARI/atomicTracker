import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import {
  createEvent,
  deleteEvent,
  localDateTime,
} from "@/lib/google/calendar";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { readSupplementConfig } from "@/app/trackers/supplements/actions";
import { computeDailySchedule } from "@/lib/tracker/supplement-rules";
import type { SupplementConfig } from "@/lib/tracker/supplement-types";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const CONFIG_FILE = "tracker.supplements.json";
const PLAN_DEEP_LINK_BASE = "https://atomictracker.vercel.app";

/**
 * Daily-recurring Calendar reminder per supplement slot.
 *
 * Idempotent: deletes any previously stored reminder events (per the IDs
 * persisted on Supplement.reminderEventIds) before creating fresh ones, so
 * re-running this after editing doesn't duplicate.
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

  const [config, mealConfig] = await Promise.all([
    readSupplementConfig(),
    readMealPlannerConfig(),
  ]);
  if (!config || config.supplements.length === 0) {
    return NextResponse.json(
      { error: "Supplements are not configured yet" },
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

  const mealtimes = {
    breakfast: mealConfig?.mealtimes?.breakfast ?? "08:00",
    lunch: mealConfig?.mealtimes?.lunch ?? "12:30",
    dinner: mealConfig?.mealtimes?.dinner ?? "19:00",
    bedtime: "22:30",
  };

  // 1. Delete any existing reminder events
  const previousIds = config.supplements.flatMap((s) => s.reminderEventIds ?? []);
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

  // 2. Compute today's schedule and create one daily-recurring event per slot.
  const schedule = computeDailySchedule(config.supplements, mealtimes);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const supplementsLink = `${PLAN_DEEP_LINK_BASE}/trackers/supplements`;

  const created: {
    name: string;
    ok: boolean;
    id?: string;
    htmlLink?: string;
    error?: string;
  }[] = [];
  // supplementId → list of new event IDs (one per dose).
  const newEventIdsBySupp: Record<string, string[]> = {};

  for (const slot of schedule) {
    try {
      const start = localDateTime(today, slot.time, timezone);
      const endHHMM = addMinutes(slot.time, 15);
      const end = localDateTime(today, endHHMM, timezone);
      const supplement = config.supplements.find((s) => s.id === slot.supplementId);
      const dose = supplement?.dose ? ` (${supplement.dose})` : "";
      const ev = await createEvent(session.accessToken, {
        summary: `AtomicTracker · ${slot.supplementName}${dose}`,
        description: `Tap to mark taken in AtomicTracker.\n\n${supplementsLink}`,
        source: { title: "AtomicTracker", url: supplementsLink },
        start,
        end,
        recurrence: ["RRULE:FREQ=DAILY"],
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 0 }],
        },
      });
      created.push({
        name: `${slot.supplementName} @ ${slot.time}`,
        ok: true,
        id: ev.id,
        htmlLink: ev.htmlLink,
      });
      const list = newEventIdsBySupp[slot.supplementId] ?? [];
      list.push(ev.id);
      newEventIdsBySupp[slot.supplementId] = list;
    } catch (e) {
      created.push({
        name: `${slot.supplementName} @ ${slot.time}`,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 3. Persist the new event IDs back into the config
  const fileId = await findFile(session.accessToken, CONFIG_FILE, configFolderId);
  if (fileId) {
    try {
      const existingConfig = await readJson<SupplementConfig>(
        session.accessToken,
        fileId,
      );
      const updated: SupplementConfig = {
        ...existingConfig,
        supplements: existingConfig.supplements.map((s) => ({
          ...s,
          reminderEventIds: newEventIdsBySupp[s.id] ?? [],
        })),
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

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  let total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  if (total < 0) total = 0;
  if (total > 23 * 60 + 59) total = 23 * 60 + 59;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
