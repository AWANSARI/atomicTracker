"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ensureAtomicTrackerLayout } from "@/lib/google/drive";

const APP_VERSION = "0.1.0";

/**
 * Idempotently bootstrap the user's /AtomicTracker/ folder structure on Drive.
 * Reads /config/user.json fast-path if present; otherwise creates everything.
 * Safe to call on every dashboard load.
 */
export async function bootstrapDriveFolder() {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    throw new Error("Not authenticated");
  }
  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  revalidatePath("/dashboard");
  return {
    rootId: layout.rootId,
    folderCount: Object.keys(layout.folderIds).length,
    bootstrappedAt: layout.bootstrappedAt,
  };
}
