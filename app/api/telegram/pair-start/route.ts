import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { signPairToken } from "@/lib/telegram/pair-token";

export const maxDuration = 60;

/**
 * Issue a signed pair token for the user's current session and build a
 * Telegram deep-link the user can tap to deliver `/start <token>` to their
 * bot. Caller passes the saved bot username via `?username=<name>`.
 *
 * No persistence — the token is signed and short-lived (10 minutes). Pairing
 * is confirmed via /api/telegram/pair-confirm which polls getUpdates.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const usernameRaw = url.searchParams.get("username") ?? "";
  const username = usernameRaw.replace(/^@/, "").trim();
  if (!username || !/^[A-Za-z0-9_]{3,32}$/.test(username)) {
    return NextResponse.json(
      { ok: false, error: "Valid bot username required" },
      { status: 400 },
    );
  }

  const pairToken = signPairToken({
    sub: session.googleSub,
    iat: Math.floor(Date.now() / 1000),
  });
  const deepLinkUrl = `https://t.me/${username}?start=${encodeURIComponent(pairToken)}`;

  return NextResponse.json({ ok: true, pairToken, deepLinkUrl });
}
