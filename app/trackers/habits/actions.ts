"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import {
  emptyHabitConfig,
  type HabitConfig,
  type HabitDayLog,
} from "@/lib/tracker/habit-types";

const APP_VERSION = "0.1.0";
const CONFIG_FILE = "tracker.habits.json";

const requireAuth = cache(async () => {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    throw new Error("Not authenticated");
  }
  return { accessToken: session.accessToken, googleSub: session.googleSub };
});

async function getFolders(
  token: string,
  sub: string,
): Promise<{ configId: string; historyId: string }> {
  const layout = await ensureAtomicTrackerLayout(token, {
    googleSub: sub,
    appVersion: APP_VERSION,
  });
  const configId = layout.folderIds["config"];
  const historyId = layout.folderIds["history/habits"];
  if (!configId) throw new Error("config folder missing");
  if (!historyId) throw new Error("history/habits folder missing");
  return { configId, historyId };
}

/** Per-request memoized read of the habit config. */
export const readHabitConfig = cache(async (): Promise<HabitConfig | null> => {
  const { accessToken, googleSub } = await requireAuth();
  const { configId } = await getFolders(accessToken, googleSub);
  const fileId = await findFile(accessToken, CONFIG_FILE, configId);
  if (!fileId) return null;
  try {
    const raw = await readJson<Partial<HabitConfig>>(accessToken, fileId);
    const defaults = emptyHabitConfig();
    return {
      ...defaults,
      ...raw,
      v: 1,
      habits: raw.habits ?? [],
      remindersEnabled: raw.remindersEnabled ?? false,
      reminderTime: raw.reminderTime ?? defaults.reminderTime,
      weeklyReminderTime: raw.weeklyReminderTime ?? defaults.weeklyReminderTime,
      createdAt: raw.createdAt ?? defaults.createdAt,
      updatedAt: raw.updatedAt ?? defaults.updatedAt,
    };
  } catch {
    return null;
  }
});

export async function saveHabitConfig(
  config: Omit<HabitConfig, "createdAt" | "updatedAt"> &
    Partial<Pick<HabitConfig, "createdAt" | "updatedAt">>,
): Promise<{ ok: true }> {
  const { accessToken, googleSub } = await requireAuth();
  const { configId } = await getFolders(accessToken, googleSub);
  const now = new Date().toISOString();
  const existing = await readHabitConfig();
  const final: HabitConfig = {
    ...emptyHabitConfig(),
    ...config,
    createdAt: existing?.createdAt ?? config.createdAt ?? now,
    updatedAt: now,
  };
  await upsertJson(accessToken, configId, CONFIG_FILE, final);
  revalidatePath("/dashboard");
  revalidatePath("/trackers");
  revalidatePath("/trackers/habits");
  return { ok: true };
}

export async function hasHabitConfig(): Promise<boolean> {
  const config = await readHabitConfig();
  return config != null;
}

/** Read a single day's log if present. Returns null if not yet logged. */
export const readHabitLog = cache(
  async (date: string): Promise<HabitDayLog | null> => {
    const { accessToken, googleSub } = await requireAuth();
    const { historyId } = await getFolders(accessToken, googleSub);
    const fileId = await findFile(accessToken, `${date}.json`, historyId);
    if (!fileId) return null;
    try {
      const raw = await readJson<Partial<HabitDayLog>>(accessToken, fileId);
      return {
        v: 1,
        date,
        done: raw.done ?? [],
        loggedAt: raw.loggedAt ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  },
);

/**
 * Read the last `days` days of logs (inclusive of today). Skips dates with
 * no log. Useful for streak math without forcing a directory listing.
 */
export const readHabitLogsLast = cache(
  async (days: number): Promise<HabitDayLog[]> => {
    const { accessToken, googleSub } = await requireAuth();
    const { historyId } = await getFolders(accessToken, googleSub);
    const out: HabitDayLog[] = [];
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
      const fileId = await findFile(accessToken, `${iso}.json`, historyId);
      if (!fileId) continue;
      try {
        const raw = await readJson<Partial<HabitDayLog>>(accessToken, fileId);
        out.push({
          v: 1,
          date: iso,
          done: raw.done ?? [],
          loggedAt: raw.loggedAt ?? new Date().toISOString(),
        });
      } catch {
        // skip unreadable
      }
    }
    return out;
  },
);
