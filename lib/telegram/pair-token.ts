import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed pair tokens used in the Telegram pairing handshake.
 *
 * Flow:
 *  1. User taps "Open Telegram to pair" — server signs a token tied to their
 *     `googleSub` and an issued-at timestamp, then redirects to
 *     https://t.me/{botUsername}?start={pairToken}
 *  2. Telegram's deep-link delivers `/start <pairToken>` to the bot.
 *  3. Server pulls the most recent /start message via getUpdates and verifies
 *     the token's HMAC + age + sub-match. If all three pass, the chatId is
 *     trusted to belong to the signed-in user.
 *
 * No persistence — tokens carry the proof inline. AUTH_SECRET is the HMAC key,
 * already required for NextAuth so always present.
 */

const TOKEN_VERSION = "v1";
const DEFAULT_MAX_AGE_SECONDS = 600; // 10 minutes

export type PairTokenPayload = {
  sub: string;
  iat: number;
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET not configured");
  }
  return secret;
}

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function hmacSign(payload: string): string {
  const h = createHmac("sha256", getSecret());
  h.update(`${TOKEN_VERSION}.${payload}`);
  return base64UrlEncode(h.digest());
}

/**
 * Sign a pair token. Output format: `${TOKEN_VERSION}.${b64url(payload)}.${b64url(hmac)}`.
 */
export function signPairToken(payload: PairTokenPayload): string {
  if (!payload || typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("signPairToken: payload.sub required");
  }
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
    throw new Error("signPairToken: payload.iat required");
  }
  const json = JSON.stringify({ sub: payload.sub, iat: Math.floor(payload.iat) });
  const encoded = base64UrlEncode(json);
  const sig = hmacSign(encoded);
  return `${TOKEN_VERSION}.${encoded}.${sig}`;
}

/**
 * Verify a pair token. Returns `{ sub }` on success or `null` on any failure
 * (malformed, tampered HMAC, expired, version mismatch). Never throws.
 */
export function verifyPairToken(
  token: unknown,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): { sub: string } | null {
  if (typeof token !== "string" || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, encoded, sig] = parts;
  if (version !== TOKEN_VERSION || !encoded || !sig) return null;

  const expectedSig = hmacSign(encoded);
  let expectedBuf: Buffer;
  let actualBuf: Buffer;
  try {
    expectedBuf = base64UrlDecode(expectedSig);
    actualBuf = base64UrlDecode(sig);
  } catch {
    return null;
  }
  if (expectedBuf.length !== actualBuf.length) return null;
  // timingSafeEqual requires equal-length buffers.
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

  let payload: PairTokenPayload;
  try {
    const json = base64UrlDecode(encoded).toString("utf8");
    const parsed = JSON.parse(json) as Partial<PairTokenPayload>;
    if (typeof parsed.sub !== "string" || !parsed.sub) return null;
    if (typeof parsed.iat !== "number" || !Number.isFinite(parsed.iat)) return null;
    payload = { sub: parsed.sub, iat: parsed.iat };
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const age = now - payload.iat;
  if (age < -60) return null; // future-dated; allow tiny clock skew
  if (age > maxAgeSeconds) return null;

  return { sub: payload.sub };
}
