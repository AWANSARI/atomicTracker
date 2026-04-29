import { NextResponse } from "next/server";
import { auth, getCurrentRefreshToken } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  upsertJson,
  readJson,
  findFile,
  deleteFile,
} from "@/lib/google/drive";
import { signDispatchToken } from "@/lib/dispatch/token";

/**
 * POST /api/dispatch/setup — mint a fresh dispatch token for the current user.
 *
 * The token is opaque to the user; they paste the URL containing it into a
 * Claude Code Routine (or any external scheduler) and the routine POSTs to
 * /api/dispatch/{token} on schedule. The token carries everything dispatch
 * needs (sub + refresh_token + drive root id) — no project-side state.
 *
 * Re-running mints a new token without invalidating older ones. To revoke,
 * the user must rotate their Google OAuth refresh token from Google account
 * security. Documented in the RoutineSection UI.
 */

export const maxDuration = 60;

const APP_VERSION = "0.1.0";
const DISPATCH_MARKER_FILE = "tracker.dispatch.json";

type DispatchMarker = {
  v: 1;
  createdAt: string;
  lastUsedAt?: string;
  /** Helpful for the Settings UI — shows when last rotated. */
  rotatedAt?: string;
};

export async function POST() {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Privileged read: dig the refresh_token out of the encrypted JWT cookie.
  // The auth() Session deliberately does not expose this.
  const refreshToken = await getCurrentRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        error:
          "No Google refresh token available. Sign out and sign back in (the OAuth refresh token is only issued on first consent).",
      },
      { status: 400 },
    );
  }

  // Get the Drive root id so dispatch doesn't have to re-find it on every call.
  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const configFolderId = layout.folderIds["config"];
  if (!configFolderId) {
    return NextResponse.json(
      { error: "Drive config folder missing — try reloading dashboard first" },
      { status: 500 },
    );
  }

  // Sign the token (AES-GCM, key derived from AUTH_SECRET).
  let token: string;
  try {
    token = signDispatchToken({
      v: 1,
      sub: session.googleSub,
      rt: refreshToken,
      drive: layout.rootId,
      iat: Math.floor(Date.now() / 1000),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  // Update the marker file in Drive — purely informational (so the user can
  // see "yes, I have a routine configured" by browsing /AtomicTracker/config/).
  try {
    const existingId = await findFile(
      session.accessToken,
      DISPATCH_MARKER_FILE,
      configFolderId,
    );
    let marker: DispatchMarker;
    if (existingId) {
      const prior = await readJson<Partial<DispatchMarker>>(
        session.accessToken,
        existingId,
      ).catch(() => null);
      marker = {
        v: 1,
        createdAt: prior?.createdAt ?? new Date().toISOString(),
        rotatedAt: new Date().toISOString(),
        lastUsedAt: prior?.lastUsedAt,
      };
    } else {
      marker = { v: 1, createdAt: new Date().toISOString() };
    }
    await upsertJson(
      session.accessToken,
      configFolderId,
      DISPATCH_MARKER_FILE,
      marker,
    );
  } catch {
    // Marker write is best-effort — token is still valid even if this fails.
  }

  // Build a user-facing dispatch URL using the request origin where possible.
  // The Claude Routine config will substitute the URL the user pastes in;
  // we still return a guess for convenience.
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? "https://atomictracker.vercel.app";
  const dispatchUrl = `${origin}/api/dispatch/${token}`;

  return NextResponse.json({
    ok: true,
    token,
    dispatchUrl,
    instructions: {
      schedule: "Friday 6:00 PM in your timezone",
      method: "POST",
      contentType: "application/json",
      sampleBody: {
        action: "generate-next-week",
        provider: "anthropic",
        apiKey: "sk-ant-…",
        youtubeKey: "(optional)",
      },
      pingBody: { action: "ping" },
      warning:
        "This URL contains an encrypted token that can act on your Drive on your behalf. Treat it like a password.",
    },
  });
}

/**
 * DELETE /api/dispatch/setup — drop the Drive-side marker file so the user's
 * record of "I have a routine configured" goes away. Does NOT invalidate any
 * outstanding token (KISS — see lib/dispatch/token.ts).
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const configFolderId = layout.folderIds["config"];
  if (!configFolderId) {
    return NextResponse.json({ ok: true });
  }

  try {
    const fileId = await findFile(
      session.accessToken,
      DISPATCH_MARKER_FILE,
      configFolderId,
    );
    if (fileId) {
      await deleteFile(session.accessToken, fileId);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
