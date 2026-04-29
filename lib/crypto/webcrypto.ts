/**
 * AES-GCM encryption helpers for at-rest data in the user's Drive.
 *
 * Works in both browser (WebCrypto) and Node 20+ (which exposes the same API
 * via `globalThis.crypto`). No "use server" or "use client" directive — both
 * environments are supported.
 *
 * Key derivation: PBKDF2-SHA256 over `passphrase + ":" + googleSub`,
 * 250k iterations. The salt is generated per-encryption and stored alongside
 * the ciphertext. The googleSub binds the key to the user's Google identity
 * so the same passphrase can't decrypt other users' data.
 */

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // 96 bits, the recommended GCM IV length

export type EncryptedEnvelope = {
  /** Algorithm identifier — bumped if we ever change parameters. */
  v: 1;
  /** Base64 ciphertext (includes 16-byte GCM tag at end). */
  ct: string;
  /** Base64 12-byte IV. */
  iv: string;
  /** Base64 16-byte salt used for the PBKDF2 derivation. */
  salt: string;
};

// ─── Typed byte helpers ────────────────────────────────────────────────────
//
// TypeScript 5.7+ tightened Uint8Array's buffer type. WebCrypto wants
// `Uint8Array<ArrayBuffer>` (not `<ArrayBufferLike>`). Constructing the
// underlying ArrayBuffer explicitly gives us the strict type for free.

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(length);
  const arr = new Uint8Array(buffer);
  crypto.getRandomValues(arr);
  return arr as Uint8Array<ArrayBuffer>;
}

function utf8(s: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const view = enc.encode(s);
  // Re-wrap into a fresh ArrayBuffer to satisfy the strict type
  const buffer = new ArrayBuffer(view.byteLength);
  const out = new Uint8Array(buffer);
  out.set(view);
  return out as Uint8Array<ArrayBuffer>;
}

async function deriveKey(
  passphrase: string,
  googleSub: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    utf8(`${passphrase}:${googleSub}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    /* extractable */ false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(
  plaintext: unknown,
  passphrase: string,
  googleSub: string,
): Promise<EncryptedEnvelope> {
  if (!passphrase) throw new Error("encryptJson: passphrase required");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, googleSub, salt);
  const data = utf8(JSON.stringify(plaintext));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return {
    v: 1,
    ct: bytesToBase64(new Uint8Array(ct)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
  };
}

export async function decryptJson<T = unknown>(
  envelope: EncryptedEnvelope,
  passphrase: string,
  googleSub: string,
): Promise<T> {
  if (envelope.v !== 1) throw new Error(`Unsupported envelope version: ${envelope.v}`);
  if (!passphrase) throw new Error("decryptJson: passphrase required");
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ct = base64ToBytes(envelope.ct);
  const key = await deriveKey(passphrase, googleSub, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/**
 * Verify a passphrase against a previously-stored verification envelope.
 * We encrypt a fixed string ("atomictracker:passphrase-check") on first setup
 * and re-decrypt it on subsequent sign-ins to confirm the passphrase is the
 * same one originally chosen.
 */
export const PASSPHRASE_CHECK_PLAINTEXT = "atomictracker:passphrase-check";

export async function verifyPassphrase(
  envelope: EncryptedEnvelope,
  passphrase: string,
  googleSub: string,
): Promise<boolean> {
  try {
    const decoded = await decryptJson<string>(envelope, passphrase, googleSub);
    return decoded === PASSPHRASE_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

// ─── base64 helpers ────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const buffer = new ArrayBuffer(s.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}
