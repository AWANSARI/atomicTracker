import "server-only";

import { signDispatchToken, type DispatchPayload } from "@/lib/dispatch/token";
import { setWebhook, deleteWebhook } from "@/lib/telegram/api";

/**
 * Telegram chat-command surface lives at /api/telegram/webhook/[token].
 *
 * The token is a dispatch-style AES-GCM blob with the user's googleSub +
 * refresh token (so the webhook can read Drive without a session) PLUS the
 * bot token + paired chat id (so the webhook can reply via the user's bot
 * without re-decrypting connectors.enc.json — which it can't, since the
 * passphrase only lives in the user's browser).
 *
 * Trade-off: anyone who obtains this URL can act on the user's behalf via
 * their bot. Webhooks are POST-only and Telegram normally only fans them
 * out to its own infrastructure, so the URL never appears in logs anyone
 * else sees. To rotate, re-pair the bot from Settings.
 */

const APP_BASE = process.env.AUTH_URL || "https://atomictracker.vercel.app";

export type WebhookSetupArgs = {
  googleSub: string;
  refreshToken: string;
  driveRootId: string;
  botToken: string;
  chatId: number;
};

/**
 * Mint a webhook token, register it on the user's bot, and return the URL.
 * Idempotent — calling again replaces the prior webhook.
 */
export async function setupTelegramWebhook(
  args: WebhookSetupArgs,
): Promise<{ url: string; webhookToken: string }> {
  const payload: DispatchPayload = {
    v: 1,
    sub: args.googleSub,
    rt: args.refreshToken,
    drive: args.driveRootId,
    iat: Math.floor(Date.now() / 1000),
    bt: args.botToken,
    chat: args.chatId,
  };
  const webhookToken = signDispatchToken(payload);
  const url = `${APP_BASE}/api/telegram/webhook/${encodeURIComponent(webhookToken)}`;
  await setWebhook(args.botToken, url);
  return { url, webhookToken };
}

/** Unregister the bot's webhook. Used on disconnect. */
export async function teardownTelegramWebhook(botToken: string): Promise<void> {
  try {
    await deleteWebhook(botToken);
  } catch {
    // best-effort; if the bot is unreachable there's nothing useful to do
  }
}
