import "server-only";

/**
 * Dispatch token = encrypted-at-rest payload that contains everything the
 * /api/dispatch/[token] endpoint needs to act on the user's Drive without a
 * live session. The user installs this token into a Claude Code Routine
 * (or any external scheduler) so a Friday-evening tick auto-generates next
 * week's meal plan.
 *
 * Format: `<base64url(salt)>.<base64url(iv)>.<base64url(ciphertext+tag)>`
 *   - salt:        16 random bytes (per-token, used in PBKDF2)
 *   - iv:          12 random bytes (AES-GCM nonce)
 *   - ciphertext:  AES-256-GCM(JSON(payload)) with 16-byte auth tag appended
 *   - the AES key is derived from `AUTH_SECRET` via PBKDF2-SHA256 (250k iters)
 *
 * Why no expiry / blacklist? KISS — there's no project-side state to track
 * issued tokens. To rotate, the user mints a new token via Settings (changes
 * the salt → entirely different ciphertext). To fully revoke an outstanding
 * token, the user has to revoke their Google OAuth refresh token from the
 * Google Account security page. That's documented in the Settings UI.
 *
 * Security note: anyone holding the URL can act on the user's behalf.
 * The Settings page warns about this explicitly. We don't put the token
 * in any URL we send to the user (only render in their settings UI for them
 * to copy out themselves).
 */

import { randomBytes as nodeRandomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from "node:crypto";

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

export type DispatchPayload = {
  v: 1;
  /** Google OAuth `sub` (stable user id). */
  sub: string;
  /** Google OAuth refresh token — used to mint a fresh access token on dispatch. */
  rt: string;
  /** Cached AtomicTracker root folder id so dispatch skips re-finding it. */
  drive: string;
  /** Issued-at, seconds since epoch. Informational only — no expiry enforcement. */
  iat: number;
};

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 8) {
    throw new Error("AUTH_SECRET is not set or too short — dispatch tokens unavailable");
  }
  return s;
}

function deriveKey(salt: Buffer): Buffer {
  return pbkdf2Sync(getSecret(), salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256");
}

// ─── base64url helpers ─────────────────────────────────────────────────────
//
// Browser-friendly URL-safe base64 (RFC 4648 §5). Tokens go in URLs the user
// pastes into a routine config so we strip "+/=" to keep them clean.

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

// ─── sign / verify ─────────────────────────────────────────────────────────

export function signDispatchToken(payload: DispatchPayload): string {
  if (payload.v !== 1) throw new Error("signDispatchToken: only v=1 supported");
  if (!payload.sub || !payload.rt || !payload.drive) {
    throw new Error("signDispatchToken: payload is missing required fields");
  }
  const salt = nodeRandomBytes(SALT_BYTES);
  const iv = nodeRandomBytes(IV_BYTES);
  const key = deriveKey(salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Append GCM tag onto ciphertext so the wire format is one blob.
  const ctWithTag = Buffer.concat([ct, tag]);
  return [b64url(salt), b64url(iv), b64url(ctWithTag)].join(".");
}

export type VerifyResult =
  | { ok: true; payload: DispatchPayload }
  | { ok: false; reason: string };

export function verifyDispatchToken(token: string): VerifyResult {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "Empty token" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "Malformed token (expected 3 parts)" };
  }
  const [saltStr, ivStr, ctStr] = parts as [string, string, string];
  let salt: Buffer;
  let iv: Buffer;
  let ctWithTag: Buffer;
  try {
    salt = fromB64url(saltStr);
    iv = fromB64url(ivStr);
    ctWithTag = fromB64url(ctStr);
  } catch {
    return { ok: false, reason: "Token parts are not valid base64url" };
  }
  if (salt.length !== SALT_BYTES) return { ok: false, reason: "Bad salt length" };
  if (iv.length !== IV_BYTES) return { ok: false, reason: "Bad iv length" };
  if (ctWithTag.length < TAG_BYTES + 1) return { ok: false, reason: "Ciphertext too short" };

  const tag = ctWithTag.subarray(ctWithTag.length - TAG_BYTES);
  const ct = ctWithTag.subarray(0, ctWithTag.length - TAG_BYTES);

  let key: Buffer;
  try {
    key = deriveKey(salt);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Key derivation failed" };
  }

  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    // Auth tag mismatch — token was tampered or signed with a different secret
    return { ok: false, reason: "Authentication failed (token tampered or wrong secret)" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString("utf8"));
  } catch {
    return { ok: false, reason: "Decrypted payload is not JSON" };
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { v?: unknown }).v !== 1 ||
    typeof (parsed as { sub?: unknown }).sub !== "string" ||
    typeof (parsed as { rt?: unknown }).rt !== "string" ||
    typeof (parsed as { drive?: unknown }).drive !== "string" ||
    typeof (parsed as { iat?: unknown }).iat !== "number"
  ) {
    return { ok: false, reason: "Payload does not match DispatchPayload shape" };
  }
  return { ok: true, payload: parsed as DispatchPayload };
}
