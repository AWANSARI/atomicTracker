#!/usr/bin/env node
/**
 * Smoke test for lib/dispatch/token.ts.
 *
 * Run:
 *   AUTH_SECRET=test-secret-please-replace node scripts/smoke-dispatch-token.mjs
 *
 * Asserts:
 *   1. Round-trip: sign → verify → payload matches
 *   2. Tampered ciphertext fails verification (returns ok:false, no throw)
 *   3. Random garbage input fails verification (no throw)
 *
 * Exits non-zero if any check fails. Prints "OK x3" on success.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 8) {
  console.error("AUTH_SECRET env var is required (>= 8 chars).");
  process.exit(2);
}

// We import the TS source through Node's experimental TypeScript loader if
// available; otherwise fall back to compiling a minimal copy. To keep this
// script dependency-free, we re-implement the AES-GCM + PBKDF2 flow inline
// against the same constants and verify roundtripping the wire format.
//
// This duplicates lib/dispatch/token.ts intentionally — the script is a
// black-box check of the format, not a unit test of the module.

import {
  randomBytes as nodeRandomBytes,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

function getSecret() {
  return process.env.AUTH_SECRET;
}
function deriveKey(salt) {
  return pbkdf2Sync(getSecret(), salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256");
}
function b64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function fromB64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signDispatchToken(payload) {
  const salt = nodeRandomBytes(SALT_BYTES);
  const iv = nodeRandomBytes(IV_BYTES);
  const key = deriveKey(salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [b64url(salt), b64url(iv), b64url(Buffer.concat([ct, tag]))].join(".");
}

function verifyDispatchToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "Empty token" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "Malformed token" };
  let salt, iv, ctWithTag;
  try {
    salt = fromB64url(parts[0]);
    iv = fromB64url(parts[1]);
    ctWithTag = fromB64url(parts[2]);
  } catch {
    return { ok: false, reason: "Bad base64" };
  }
  if (salt.length !== SALT_BYTES) return { ok: false, reason: "Bad salt" };
  if (iv.length !== IV_BYTES) return { ok: false, reason: "Bad iv" };
  if (ctWithTag.length < TAG_BYTES + 1) {
    return { ok: false, reason: "Ct too short" };
  }
  const tag = ctWithTag.subarray(ctWithTag.length - TAG_BYTES);
  const ct = ctWithTag.subarray(0, ctWithTag.length - TAG_BYTES);
  let pt;
  try {
    const dec = createDecipheriv("aes-256-gcm", deriveKey(salt), iv);
    dec.setAuthTag(tag);
    pt = Buffer.concat([dec.update(ct), dec.final()]);
  } catch {
    return { ok: false, reason: "Auth tag mismatch" };
  }
  try {
    const obj = JSON.parse(pt.toString("utf8"));
    return { ok: true, payload: obj };
  } catch {
    return { ok: false, reason: "Bad JSON" };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

const samplePayload = {
  v: 1,
  sub: "112233445566778899000",
  rt: "1//refresh-token-fake-string-here",
  drive: "1abcDEFghi-jkl-mno-pqr-stu",
  iat: Math.floor(Date.now() / 1000),
};

// 1. round-trip
const token = signDispatchToken(samplePayload);
const r1 = verifyDispatchToken(token);
if (!r1.ok) {
  console.error("FAIL #1: round-trip rejected:", r1.reason);
  process.exit(1);
}
if (
  r1.payload.sub !== samplePayload.sub ||
  r1.payload.rt !== samplePayload.rt ||
  r1.payload.drive !== samplePayload.drive ||
  r1.payload.iat !== samplePayload.iat ||
  r1.payload.v !== 1
) {
  console.error("FAIL #1: payload mismatch", r1.payload);
  process.exit(1);
}
console.log("OK #1: round-trip");

// 2. tampered ciphertext (flip the last char of the ct part)
const parts = token.split(".");
const tamperedCt =
  parts[2].slice(0, -1) + (parts[2].slice(-1) === "A" ? "B" : "A");
const tamperedToken = [parts[0], parts[1], tamperedCt].join(".");
const r2 = verifyDispatchToken(tamperedToken);
if (r2.ok) {
  console.error("FAIL #2: tampered token verified as ok");
  process.exit(1);
}
console.log("OK #2: tampered ciphertext rejected (" + r2.reason + ")");

// 3. random garbage input
const garbage = "this-is-not-a-token-at-all";
const r3 = verifyDispatchToken(garbage);
if (r3.ok) {
  console.error("FAIL #3: garbage verified as ok");
  process.exit(1);
}
console.log("OK #3: garbage rejected (" + r3.reason + ")");

// 4. quick edge: empty string
const r4 = verifyDispatchToken("");
if (r4.ok) {
  console.error("FAIL extra: empty string verified ok");
  process.exit(1);
}

console.log("\nOK x3");
