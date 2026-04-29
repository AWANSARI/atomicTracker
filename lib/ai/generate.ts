import "server-only";

import type { ProviderId } from "./providers";

/**
 * Provider-agnostic generation entry point. Each provider gets the same prompt
 * and is asked to return JSON only. The plaintext API key is held in memory
 * for one HTTP call and dropped — no logging, no persistence.
 */

export type GenerateResult = {
  json: unknown;
  model: string;
};

export async function generateJson(
  provider: ProviderId,
  apiKey: string,
  prompt: string,
): Promise<GenerateResult> {
  switch (provider) {
    case "anthropic":
      return generateAnthropic(apiKey, prompt);
    case "openai":
      return generateOpenAI(apiKey, prompt);
    case "gemini":
      return generateGemini(apiKey, prompt);
  }
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

async function generateAnthropic(
  apiKey: string,
  prompt: string,
): Promise<GenerateResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`Anthropic ${res.status}: ${body}`);
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = data.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  return { json: parseJsonLoose(text), model: ANTHROPIC_MODEL };
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────

const OPENAI_MODEL = "gpt-4o-mini";

async function generateOpenAI(
  apiKey: string,
  prompt: string,
): Promise<GenerateResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`OpenAI ${res.status}: ${body}`);
  }
  const data = (await res.json()) as {
    choices: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices[0]?.message?.content?.trim() ?? "";
  return { json: parseJsonLoose(text), model: OPENAI_MODEL };
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.0-flash";

async function generateGemini(
  apiKey: string,
  prompt: string,
): Promise<GenerateResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`Gemini ${res.status}: ${body}`);
  }
  const data = (await res.json()) as {
    candidates: Array<{ content: { parts: Array<{ text?: string }> } }>;
  };
  const text =
    data.candidates[0]?.content.parts.map((p) => p.text).join("").trim() ?? "";
  return { json: parseJsonLoose(text), model: GEMINI_MODEL };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse JSON, tolerantly stripping ```json fences if a model added them. */
function parseJsonLoose(text: string): unknown {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(s);
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 400);
  } catch {
    return "(no body)";
  }
}
