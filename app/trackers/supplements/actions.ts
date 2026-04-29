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
  emptySupplementConfig,
  type SupplementConfig,
} from "@/lib/tracker/supplement-types";

const APP_VERSION = "0.1.0";
const CONFIG_FILE = "tracker.supplements.json";

const requireAuth = cache(async () => {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    throw new Error("Not authenticated");
  }
  return { accessToken: session.accessToken, googleSub: session.googleSub };
});

async function getConfigFolderId(token: string, sub: string): Promise<string> {
  const layout = await ensureAtomicTrackerLayout(token, {
    googleSub: sub,
    appVersion: APP_VERSION,
  });
  const id = layout.folderIds["config"];
  if (!id) throw new Error("config folder missing");
  return id;
}

/**
 * Wrapped in React `cache()` so layout/page/actions sharing one render
 * make a single Drive roundtrip. Per-request scope only.
 */
export const readSupplementConfig = cache(
  async (): Promise<SupplementConfig | null> => {
    const { accessToken, googleSub } = await requireAuth();
    const configId = await getConfigFolderId(accessToken, googleSub);
    const fileId = await findFile(accessToken, CONFIG_FILE, configId);
    if (!fileId) return null;
    try {
      const raw = await readJson<Partial<SupplementConfig>>(accessToken, fileId);
      const defaults = emptySupplementConfig();
      return {
        ...defaults,
        ...raw,
        supplements: raw.supplements ?? [],
        createdAt: raw.createdAt ?? defaults.createdAt,
        updatedAt: raw.updatedAt ?? defaults.updatedAt,
      };
    } catch {
      return null;
    }
  },
);

export async function saveSupplementConfig(
  config: Omit<SupplementConfig, "createdAt" | "updatedAt"> &
    Partial<Pick<SupplementConfig, "createdAt" | "updatedAt">>,
): Promise<{ ok: true }> {
  const { accessToken, googleSub } = await requireAuth();
  const configId = await getConfigFolderId(accessToken, googleSub);
  const now = new Date().toISOString();
  const existing = await readSupplementConfig();
  const final: SupplementConfig = {
    ...emptySupplementConfig(),
    ...config,
    createdAt: existing?.createdAt ?? config.createdAt ?? now,
    updatedAt: now,
  };
  await upsertJson(accessToken, configId, CONFIG_FILE, final);
  revalidatePath("/trackers");
  revalidatePath("/trackers/supplements");
  return { ok: true };
}

export async function hasSupplementConfig(): Promise<boolean> {
  const config = await readSupplementConfig();
  return config != null && config.supplements.length > 0;
}
