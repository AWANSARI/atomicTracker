import "server-only";

/**
 * Minimal Telegram Bot API wrapper.
 *
 * All calls hit https://api.telegram.org/bot<token>/<method> with JSON bodies.
 * No third-party SDK — Telegram's HTTP API is small and stable.
 *
 * Bot tokens never leave the user's encrypted Drive envelope. The browser
 * decrypts client-side and passes the plaintext token in the request body
 * for one-shot calls; the server uses it in-memory and discards.
 */

const TELEGRAM_API = "https://api.telegram.org";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id?: number;
    chat: {
      id: number;
      type: string;
      username?: string;
      first_name?: string;
    };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
    text?: string;
    date: number;
  };
};

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

async function call<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (!botToken || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(botToken)) {
    throw new Error("Invalid bot token format");
  }
  const url = `${TELEGRAM_API}/bot${botToken}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  let json: TelegramResponse<T>;
  try {
    json = (await res.json()) as TelegramResponse<T>;
  } catch {
    throw new Error(`Telegram ${method}: non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok || !json.ok) {
    const desc = json.description ?? `HTTP ${res.status}`;
    throw new Error(`Telegram ${method}: ${desc}`);
  }
  if (json.result === undefined) {
    throw new Error(`Telegram ${method}: missing result`);
  }
  return json.result;
}

export async function getMe(
  botToken: string,
): Promise<{ id: number; username: string; first_name: string }> {
  const r = await call<{ id: number; username?: string; first_name?: string }>(
    botToken,
    "getMe",
  );
  return {
    id: r.id,
    username: r.username ?? "",
    first_name: r.first_name ?? "",
  };
}

export async function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  opts?: { parse_mode?: "Markdown" | "HTML" },
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts?.parse_mode) body.parse_mode = opts.parse_mode;
  await call<unknown>(botToken, "sendMessage", body);
}

export async function getUpdates(
  botToken: string,
  opts?: { offset?: number; timeout?: number },
): Promise<TelegramUpdate[]> {
  const body: Record<string, unknown> = {
    timeout: opts?.timeout ?? 0,
  };
  if (typeof opts?.offset === "number") body.offset = opts.offset;
  return call<TelegramUpdate[]>(botToken, "getUpdates", body);
}

/**
 * Optional: register a webhook URL the Telegram servers will POST updates to.
 * Not used in the current outbound-only flow — kept for a future Phase 3 where
 * we adopt OpenClaw or a similar gateway that owns the chatId index.
 */
export async function setWebhook(botToken: string, url: string): Promise<void> {
  await call<unknown>(botToken, "setWebhook", { url });
}

export async function deleteWebhook(botToken: string): Promise<void> {
  await call<unknown>(botToken, "deleteWebhook", {});
}
