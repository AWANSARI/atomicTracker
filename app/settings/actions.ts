"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import type { EncryptedEnvelope } from "@/lib/crypto/webcrypto";
import { testProviderKey } from "@/lib/ai/test-keys";
import { testYouTubeKey } from "@/lib/youtube/lookup";
import type { ProviderId } from "@/lib/ai/providers";

const APP_VERSION = "0.1.0";
const CONNECTORS_FILE = "connectors.enc.json";

type Auth = { accessToken: string; googleSub: string };

async function requireAuth(): Promise<Auth> {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    throw new Error("Not authenticated");
  }
  return { accessToken: session.accessToken, googleSub: session.googleSub };
}

async function getConfigFolderId(token: string, sub: string): Promise<string> {
  const layout = await ensureAtomicTrackerLayout(token, {
    googleSub: sub,
    appVersion: APP_VERSION,
  });
  const id = layout.folderIds["config"];
  if (!id) throw new Error("config folder missing");
  return id;
}

// ─── Server actions ─────────────────────────────────────────────────────────

/** Return whether connectors.enc.json exists (no decryption). */
export async function hasConnectors(): Promise<boolean> {
  const { accessToken, googleSub } = await requireAuth();
  const configId = await getConfigFolderId(accessToken, googleSub);
  const fileId = await findFile(accessToken, CONNECTORS_FILE, configId);
  return fileId != null;
}

/** Read the encrypted connectors envelope (or null). Decryption happens client-side. */
export async function readConnectorEnvelope(): Promise<EncryptedEnvelope | null> {
  const { accessToken, googleSub } = await requireAuth();
  const configId = await getConfigFolderId(accessToken, googleSub);
  const fileId = await findFile(accessToken, CONNECTORS_FILE, configId);
  if (!fileId) return null;
  try {
    return await readJson<EncryptedEnvelope>(accessToken, fileId);
  } catch {
    return null;
  }
}

/**
 * Write the encrypted connectors envelope to /AtomicTracker/config/connectors.enc.json.
 * Server never sees plaintext — the envelope is already encrypted by the browser.
 */
export async function saveConnectorEnvelope(
  envelope: EncryptedEnvelope,
): Promise<{ ok: true }> {
  const { accessToken, googleSub } = await requireAuth();
  if (!envelope || envelope.v !== 1 || !envelope.ct || !envelope.iv || !envelope.salt) {
    throw new Error("Invalid envelope");
  }
  const configId = await getConfigFolderId(accessToken, googleSub);
  await upsertJson(accessToken, configId, CONNECTORS_FILE, envelope);
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Test a plaintext API key against the provider. The key is held in memory
 * for one HTTP call and dropped. We deliberately do NOT log it.
 */
export async function testKeyAction(
  provider: ProviderId,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  // Defensive: don't even let the auth check leak. Require a session first.
  await requireAuth();
  if (typeof apiKey !== "string" || apiKey.length < 8) {
    return { ok: false, error: "Key looks too short" };
  }
  const result = await testProviderKey(provider, apiKey);
  // Note: returning result is fine; the key is not echoed back.
  return result;
}

export async function testYouTubeKeyAction(
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAuth();
  if (typeof apiKey !== "string" || apiKey.length < 8) {
    return { ok: false, error: "Key looks too short" };
  }
  const ok = await testYouTubeKey(apiKey);
  return ok ? { ok: true } : { ok: false, error: "Invalid or unauthorized YouTube key" };
}
