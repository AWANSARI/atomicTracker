import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendMessage } from "@/lib/telegram/api";

export const maxDuration = 60;

/**
 * Send an outbound notification to a paired Telegram chat.
 * Body: { botToken: string; chatId: number; text: string }.
 *
 * Used by future nudge flows (e.g. after /api/accept the client can fire-and-
 * forget a notify call so the user gets a confirmation in Telegram). The bot
 * token is never persisted server-side — the caller decrypts and forwards it.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { botToken?: unknown; chatId?: unknown; text?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const botToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
  const chatId = typeof body.chatId === "number" ? body.chatId : NaN;
  const text = typeof body.text === "string" ? body.text : "";

  if (!botToken) {
    return NextResponse.json({ ok: false, error: "botToken required" }, { status: 400 });
  }
  if (!Number.isFinite(chatId)) {
    return NextResponse.json({ ok: false, error: "chatId required" }, { status: 400 });
  }
  if (!text || text.length > 4096) {
    return NextResponse.json(
      { ok: false, error: "text required (1-4096 chars)" },
      { status: 400 },
    );
  }

  try {
    await sendMessage(botToken, chatId, text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
