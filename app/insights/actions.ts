"use server";

import { cache } from "react";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
} from "@/lib/google/drive";
import {
  emptyAnalyticsDayLog,
  type AnalyticsDayLog,
  type CycleMarker,
  type EnergyScore,
  type HairFallLevel,
  type MoodScore,
} from "@/lib/tracker/analytics-types";

const APP_VERSION = "0.1.0";

const requireAuth = cache(async () => {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    throw new Error("Not authenticated");
  }
  return { accessToken: session.accessToken, googleSub: session.googleSub };
});

async function getAnalyticsFolderId(
  token: string,
  sub: string,
): Promise<string> {
  const layout = await ensureAtomicTrackerLayout(token, {
    googleSub: sub,
    appVersion: APP_VERSION,
  });
  const id = layout.folderIds["history/analytics"];
  if (!id) throw new Error("history/analytics folder missing");
  return id;
}

function normalize(raw: Partial<AnalyticsDayLog>, date: string): AnalyticsDayLog {
  // Tolerant numeric/string coercion. The API route validates on write, so this
  // mostly matters for legacy / hand-edited files.
  const energy =
    typeof raw.energy === "number" && raw.energy >= 1 && raw.energy <= 5
      ? (raw.energy as EnergyScore)
      : undefined;
  const mood =
    typeof raw.mood === "number" && raw.mood >= 1 && raw.mood <= 5
      ? (raw.mood as MoodScore)
      : undefined;
  const sleepHours =
    typeof raw.sleepHours === "number" && raw.sleepHours >= 0 && raw.sleepHours <= 14
      ? raw.sleepHours
      : undefined;
  const hairFall =
    raw.hairFall === "low" || raw.hairFall === "moderate" || raw.hairFall === "heavy"
      ? (raw.hairFall as HairFallLevel)
      : undefined;
  const cycleMarker =
    raw.cycleMarker === "menstrual" ||
    raw.cycleMarker === "follicular" ||
    raw.cycleMarker === "ovulatory" ||
    raw.cycleMarker === "luteal" ||
    raw.cycleMarker === "spotting"
      ? (raw.cycleMarker as CycleMarker)
      : undefined;
  return {
    v: 1,
    date,
    energy,
    mood,
    sleepHours,
    hairFall,
    cycleMarker,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
    loggedAt: typeof raw.loggedAt === "string" ? raw.loggedAt : new Date().toISOString(),
  };
}

/** Read a single day's analytics log. Returns null if the file doesn't exist. */
export const readAnalyticsLog = cache(
  async (date: string): Promise<AnalyticsDayLog | null> => {
    const { accessToken, googleSub } = await requireAuth();
    const folderId = await getAnalyticsFolderId(accessToken, googleSub);
    const fileId = await findFile(accessToken, `${date}.json`, folderId);
    if (!fileId) return null;
    try {
      const raw = await readJson<Partial<AnalyticsDayLog>>(accessToken, fileId);
      return normalize(raw, date);
    } catch {
      return null;
    }
  },
);

/**
 * Read the last `days` days of analytics logs (inclusive of today). Skips
 * dates with no log. Mirrors readHabitLogsLast — sequential lookup keeps the
 * Drive API call count predictable.
 */
export const readAnalyticsLogsLast = cache(
  async (days: number): Promise<AnalyticsDayLog[]> => {
    const { accessToken, googleSub } = await requireAuth();
    const folderId = await getAnalyticsFolderId(accessToken, googleSub);
    const out: AnalyticsDayLog[] = [];
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
      ),
    );
    for (let i = 0; i < days; i++) {
      const d = new Date(todayUtc);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const fileId = await findFile(accessToken, `${iso}.json`, folderId);
      if (!fileId) continue;
      try {
        const raw = await readJson<Partial<AnalyticsDayLog>>(accessToken, fileId);
        out.push(normalize(raw, iso));
      } catch {
        // skip unreadable
      }
    }
    return out;
  },
);

/** Bootstrap helper for "Log today" — returns an empty log object. */
export async function emptyLogForToday(): Promise<AnalyticsDayLog> {
  const d = new Date();
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return emptyAnalyticsDayLog(iso);
}
