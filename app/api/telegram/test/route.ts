import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMe } from "@/lib/telegram/api";

export const maxDuration = 60;

/**
 * Validate a BotFather token by calling Telegram's getMe.
 * Body: { botToken: string }. The token is held in memory for the call and
 * dropped — never logged, never persisted.
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
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const botToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "botToken required" }, { status: 400 });
  }

  try {
    const me = await getMe(botToken);
    if (!me.username) {
      return NextResponse.json(
        { ok: false, error: "Bot has no username — set one via BotFather first" },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      username: me.username,
      firstName: me.first_name,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
