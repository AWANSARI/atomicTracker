import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decode } from "@auth/core/jwt";
import { auth } from "@/auth";
import { ensureAtomicTrackerLayout } from "@/lib/google/drive";
import {
  setupTelegramWebhook,
  teardownTelegramWebhook,
} from "@/lib/telegram/webhook-setup";

export const maxDuration = 30;
const APP_VERSION = "0.1.0";

/**
 * POST /api/telegram/setup-webhook
 *
 * Installs the chat-command webhook on the user's bot.
 *
 * Body: { botToken: string, chatId: number, action?: "install" | "remove" }.
 *
 * The browser sends the bot token (decrypted client-side from
 * connectors.enc.json). The server reads the user's refresh token from the
 * NextAuth session cookie (NOT echoed to the client) and mints a webhook
 * token containing {sub, rt, drive, bt, chat}. Then calls Telegram's
 * setWebhook to register the URL on the bot.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { botToken?: unknown; chatId?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const botToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
  const chatId = typeof body.chatId === "number" ? body.chatId : 0;
  const action = body.action === "remove" ? "remove" : "install";

  if (!botToken) {
    return NextResponse.json({ error: "botToken required" }, { status: 400 });
  }
  if (action === "install" && !chatId) {
    return NextResponse.json(
      { error: "chatId required for install" },
      { status: 400 },
    );
  }

  if (action === "remove") {
    await teardownTelegramWebhook(botToken);
    return NextResponse.json({ ok: true, removed: true });
  }

  // Pull the refresh token out of the session JWT — it's not exposed via
  // auth() but we can decode the NextAuth cookie directly server-side.
  const cookieStore = await cookies();
  const sessionCookie =
    cookieStore.get("__Secure-authjs.session-token") ??
    cookieStore.get("authjs.session-token");
  if (!sessionCookie?.value) {
    return NextResponse.json(
      { error: "Session cookie missing — sign out and back in" },
      { status: 401 },
    );
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Server missing AUTH_SECRET" },
      { status: 500 },
    );
  }
  const decoded = await decode({
    token: sessionCookie.value,
    secret,
    salt: sessionCookie.name,
  }).catch(() => null);
  const refreshToken = (decoded as { refresh_token?: unknown } | null)
    ?.refresh_token;
  if (typeof refreshToken !== "string" || !refreshToken) {
    return NextResponse.json(
      { error: "No refresh token in session — sign out and back in" },
      { status: 401 },
    );
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });

  try {
    const { url } = await setupTelegramWebhook({
      googleSub: session.googleSub,
      refreshToken,
      driveRootId: layout.rootId,
      botToken,
      chatId,
    });
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
