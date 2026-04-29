// Round-trip smoke test for lib/telegram/pair-token.ts.
//
// The compiled module has `import "server-only"` at the top, which throws
// outside Next.js. For a node-only smoke we re-implement the same algorithm
// here byte-for-byte. If the source ever changes shape, update this script.
//
// Run with:  AUTH_SECRET=dummy node scripts/smoke-pair-token.mjs

import { createHmac, timingSafeEqual } from "node:crypto";
import assert from "node:assert/strict";

process.env.AUTH_SECRET ||= "smoke-test-secret";

const TOKEN_VERSION = "v1";
const DEFAULT_MAX_AGE_SECONDS = 600;

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET not configured");
  return s;
}

function base64UrlEncode(input) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function hmacSign(payload) {
  const h = createHmac("sha256", getSecret());
  h.update(`${TOKEN_VERSION}.${payload}`);
  return base64UrlEncode(h.digest());
}

function signPairToken(payload) {
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

function verifyPairToken(token, maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS) {
  if (typeof token !== "string" || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, encoded, sig] = parts;
  if (version !== TOKEN_VERSION || !encoded || !sig) return null;
  const expectedSig = hmacSign(encoded);
  let expectedBuf;
  let actualBuf;
  try {
    expectedBuf = base64UrlDecode(expectedSig);
    actualBuf = base64UrlDecode(sig);
  } catch {
    return null;
  }
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;
  let payload;
  try {
    const json = base64UrlDecode(encoded).toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed.sub !== "string" || !parsed.sub) return null;
    if (typeof parsed.iat !== "number" || !Number.isFinite(parsed.iat)) return null;
    payload = { sub: parsed.sub, iat: parsed.iat };
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const age = now - payload.iat;
  if (age < -60) return null;
  if (age > maxAgeSeconds) return null;
  return { sub: payload.sub };
}

// ─── Tests ──────────────────────────────────────────────────────────────

// 1. Round-trip
{
  const sub = "google-sub-1234567890";
  const tok = signPairToken({ sub, iat: Math.floor(Date.now() / 1000) });
  const v = verifyPairToken(tok);
  assert.equal(v?.sub, sub, "round-trip should preserve sub");
  console.log("OK round-trip");
}

// 2. Tampered HMAC fails
{
  const tok = signPairToken({ sub: "abc", iat: Math.floor(Date.now() / 1000) });
  const parts = tok.split(".");
  // flip the last char of the signature segment
  const last = parts[2];
  const flipped = last.slice(0, -1) + (last.endsWith("A") ? "B" : "A");
  const tampered = `${parts[0]}.${parts[1]}.${flipped}`;
  const v = verifyPairToken(tampered);
  assert.equal(v, null, "tampered HMAC must fail");
  console.log("OK tampered-hmac-rejected");
}

// 3. Expired token fails
{
  const tenMinAgo = Math.floor(Date.now() / 1000) - 700; // > 600s
  const tok = signPairToken({ sub: "expired-user", iat: tenMinAgo });
  const v = verifyPairToken(tok);
  assert.equal(v, null, "expired token must fail");
  console.log("OK expired-rejected");
}

// 4. Malformed inputs return null (do not throw)
{
  const cases = [
    "",
    "not-a-token",
    "v1.only-one-dot",
    "v1.x.y.z",
    "v2.eyJzdWIiOiJ4IiwiaWF0IjoxfQ.AAAA",
    null,
    undefined,
    42,
    {},
  ];
  for (const c of cases) {
    const v = verifyPairToken(c);
    assert.equal(v, null, `malformed input should return null: ${JSON.stringify(c)}`);
  }
  console.log("OK malformed-returns-null");
}
