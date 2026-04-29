import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import {
  emptyAnalyticsDayLog,
  type AnalyticsDayLog,
  type CycleMarker,
  type EnergyScore,
  type HairFallLevel,
  type MoodScore,
} from "@/lib/tracker/analytics-types";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const HAIR_FALL: HairFallLevel[] = ["low", "moderate", "heavy"];
const CYCLE: CycleMarker[] = [
  "menstrual",
  "follicular",
  "ovulatory",
  "luteal",
  "spotting",
];

/**
 * POST /api/analytics/log
 * Body: {
 *   date: "YYYY-MM-DD",
 *   energy?: 1..5, mood?: 1..5, sleepHours?: 0..14,
 *   hairFall?: "low"|"moderate"|"heavy",
 *   cycleMarker?: "menstrual"|...,
 *   notes?: string
 * }
 *
 * Upserts /AtomicTracker/history/analytics/{date}.json with last-write-wins
 * semantics on each field. Sending `null` for a field clears it.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date : "";
  if (!ISO_DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  // Coerce numeric fields. Treat undefined as "not provided"; null as "clear".
  const energyRaw = body.energy;
  const moodRaw = body.mood;
  const sleepRaw = body.sleepHours;
  const hairRaw = body.hairFall;
  const cycleRaw = body.cycleMarker;
  const notesRaw = body.notes;

  function asScore(
    v: unknown,
  ): EnergyScore | MoodScore | undefined | null {
    if (v === null) return null;
    if (typeof v !== "number") return undefined;
    if (v < 1 || v > 5) return undefined;
    const r = Math.round(v);
    if (r < 1 || r > 5) return undefined;
    return r as EnergyScore;
  }

  function asSleep(v: unknown): number | undefined | null {
    if (v === null) return null;
    if (typeof v !== "number") return undefined;
    if (v < 0 || v > 14) return undefined;
    return Math.round(v * 2) / 2; // 0.5 step
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const folderId = layout.folderIds["history/analytics"];
  if (!folderId) {
    return NextResponse.json(
      { error: "history/analytics folder missing — re-bootstrap from dashboard" },
      { status: 500 },
    );
  }

  const fileName = `${date}.json`;
  const existingId = await findFile(session.accessToken, fileName, folderId);
  let log: AnalyticsDayLog;
  if (existingId) {
    try {
      const raw = await readJson<Partial<AnalyticsDayLog>>(
        session.accessToken,
        existingId,
      );
      log = {
        v: 1,
        date,
        energy: raw.energy as EnergyScore | undefined,
        mood: raw.mood as MoodScore | undefined,
        sleepHours: typeof raw.sleepHours === "number" ? raw.sleepHours : undefined,
        hairFall: raw.hairFall as HairFallLevel | undefined,
        cycleMarker: raw.cycleMarker as CycleMarker | undefined,
        notes: typeof raw.notes === "string" ? raw.notes : undefined,
        loggedAt: typeof raw.loggedAt === "string" ? raw.loggedAt : new Date().toISOString(),
      };
    } catch {
      log = emptyAnalyticsDayLog(date);
    }
  } else {
    log = emptyAnalyticsDayLog(date);
  }

  // Apply patch — null clears, undefined leaves untouched.
  if (energyRaw !== undefined) {
    const v = asScore(energyRaw);
    if (v === null) log.energy = undefined;
    else if (v !== undefined) log.energy = v as EnergyScore;
  }
  if (moodRaw !== undefined) {
    const v = asScore(moodRaw);
    if (v === null) log.mood = undefined;
    else if (v !== undefined) log.mood = v as MoodScore;
  }
  if (sleepRaw !== undefined) {
    const v = asSleep(sleepRaw);
    if (v === null) log.sleepHours = undefined;
    else if (v !== undefined) log.sleepHours = v;
  }
  if (hairRaw !== undefined) {
    if (hairRaw === null) log.hairFall = undefined;
    else if (typeof hairRaw === "string" && HAIR_FALL.includes(hairRaw as HairFallLevel)) {
      log.hairFall = hairRaw as HairFallLevel;
    }
  }
  if (cycleRaw !== undefined) {
    if (cycleRaw === null) log.cycleMarker = undefined;
    else if (typeof cycleRaw === "string" && CYCLE.includes(cycleRaw as CycleMarker)) {
      log.cycleMarker = cycleRaw as CycleMarker;
    }
  }
  if (notesRaw !== undefined) {
    if (notesRaw === null) log.notes = undefined;
    else if (typeof notesRaw === "string") {
      const trimmed = notesRaw.slice(0, 2000);
      log.notes = trimmed.length > 0 ? trimmed : undefined;
    }
  }
  log.loggedAt = new Date().toISOString();

  await upsertJson(session.accessToken, folderId, fileName, log);

  return NextResponse.json({ ok: true, log });
}
