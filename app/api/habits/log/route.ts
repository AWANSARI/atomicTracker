import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import {
  emptyHabitDayLog,
  type HabitDayLog,
} from "@/lib/tracker/habit-types";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST { date: "YYYY-MM-DD", habitId: string, done: boolean }
 * → upserts /AtomicTracker/history/habits/{date}.json with the habitId
 *   added to or removed from the `done` array.
 *
 * Idempotent: setting done=true twice keeps the array a set; done=false on
 * a habit that wasn't in the array is a no-op.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { date?: string; habitId?: string; done?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = body.date;
  const habitId = body.habitId;
  const done = body.done;
  if (!date || !ISO_DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (!habitId || typeof habitId !== "string") {
    return NextResponse.json({ error: "habitId required" }, { status: 400 });
  }
  if (typeof done !== "boolean") {
    return NextResponse.json(
      { error: "done must be a boolean" },
      { status: 400 },
    );
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const folderId = layout.folderIds["history/habits"];
  if (!folderId) {
    return NextResponse.json(
      { error: "history/habits folder missing — re-bootstrap from dashboard" },
      { status: 500 },
    );
  }

  const fileName = `${date}.json`;
  const existingId = await findFile(session.accessToken, fileName, folderId);
  let log: HabitDayLog;
  if (existingId) {
    try {
      const raw = await readJson<Partial<HabitDayLog>>(
        session.accessToken,
        existingId,
      );
      log = {
        v: 1,
        date,
        done: raw.done ?? [],
        loggedAt: new Date().toISOString(),
      };
    } catch {
      log = emptyHabitDayLog(date);
    }
  } else {
    log = emptyHabitDayLog(date);
  }

  const set = new Set(log.done);
  if (done) {
    set.add(habitId);
  } else {
    set.delete(habitId);
  }
  log.done = Array.from(set);
  log.loggedAt = new Date().toISOString();

  await upsertJson(session.accessToken, folderId, fileName, log);

  return NextResponse.json({ ok: true, log });
}
