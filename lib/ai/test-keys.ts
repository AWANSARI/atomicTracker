import "server-only";

import type { ProviderId } from "./providers";

/**
 * Test that an API key is valid by making the smallest possible call to the
 * provider. The key is held in memory only for the duration of this function
 * and is never written to disk. After the test the caller should drop its
 * reference to the key as well.
 */

export type TestResult = { ok: true } | { ok: false; error: string };

export async function testProviderKey(
  provider: ProviderId,
  apiKey: string,
): Promise<TestResult> {
  if (!apiKey) return { ok: false, error: "Empty key" };
  try {
    switch (provider) {
      case "anthropic":
        return await testAnthropic(apiKey);
      case "openai":
        return await testOpenAI(apiKey);
      case "gemini":
        return await testGemini(apiKey);
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── Anthropic ──────────────────────────────────────────────────────────────
// Tiny POST /v1/messages. ~$0.0001 per test. Fails fast on invalid key.

async function testAnthropic(apiKey: string): Promise<TestResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    }),
  });
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, error: "Invalid API key" };
  if (res.status === 403) return { ok: false, error: "Key is valid but lacks permissions for this model" };
  if (res.status === 429) return { ok: false, error: "Rate limited — try again in a moment" };
  const body = await safeText(res);
  return { ok: false, error: `${res.status} ${res.statusText}: ${body}` };
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────
// GET /v1/models is free and returns 200 for any valid key, 401 for invalid.

async function testOpenAI(apiKey: string): Promise<TestResult> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, error: "Invalid API key" };
  const body = await safeText(res);
  return { ok: false, error: `${res.status} ${res.statusText}: ${body}` };
}

// ─── Gemini ─────────────────────────────────────────────────────────────────
// GET /v1beta/models?key=KEY is free.

async function testGemini(apiKey: string): Promise<TestResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  if (res.ok) return { ok: true };
  if (res.status === 400 || res.status === 403) {
    return { ok: false, error: "Invalid API key" };
  }
  const body = await safeText(res);
  return { ok: false, error: `${res.status} ${res.statusText}: ${body}` };
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 200);
  } catch {
    return "(no body)";
  }
}
