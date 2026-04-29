import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUpdates, sendMessage } from "@/lib/telegram/api";
import { verifyPairToken } from "@/lib/telegram/pair-token";

export const maxDuration = 60;

/**
 * Finalize Telegram pairing.
 *
 * Body: { botToken: string }. We poll getUpdates, look at the most recent
 * `/start <token>` messages, and accept the first one whose token verifies
 * AND whose payload.sub matches the authenticated user's googleSub. The
 * matching message's chat.id is returned to the client which then writes
 * it into the encrypted connectors envelope.
 *
 * The server never persists the bot token — it only flows through this call.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { botToken?: unknown };
  try {
    body = (await req.json()) as { botToken?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const botToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
  if (!botToken) {
    return NextResponse.json(
      { ok: false, reason: "botToken required" },
      { status: 400 },
    );
  }

  let updates;
  try {
    updates = await getUpdates(botToken, { timeout: 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }

  // Newest first — Telegram returns ascending update_id.
  const newestFirst = [...updates].reverse();
  for (const upd of newestFirst) {
    const msg = upd.message;
    if (!msg || typeof msg.text !== "string") continue;
    const text = msg.text.trim();
    if (!text.startsWith("/start")) continue;
    const parts = text.split(/\s+/);
    const candidate = parts[1];
    if (!candidate) continue;
    const verified = verifyPairToken(candidate);
    if (!verified) continue;
    if (verified.sub !== session.googleSub) continue;

    const chatId = msg.chat.id;
    const telegramUsername = msg.chat.username ?? msg.from?.username;

    // Acknowledge in the chat — fire-and-forget, errors don't fail pairing.
    try {
      await sendMessage(
        botToken,
        chatId,
        "Paired with AtomicTracker. You'll start receiving nudges here.",
      );
    } catch {
      // ignore — pairing succeeded, ack is best-effort
    }

    return NextResponse.json({
      ok: true,
      chatId,
      telegramUsername: telegramUsername ?? null,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      reason:
        "No matching /start message found. Tap Start in Telegram, then come back here within 10 minutes.",
    },
    { status: 200 },
  );
}
