import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { generateChatReply, type ChatMessage } from "@/lib/ai/generate";
import { buildChatSystemPrompt } from "@/lib/tracker/meal-planner-prompt";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";
import type { MealPlan } from "@/lib/tracker/meal-planner-plan";

export const maxDuration = 60;

const MAX_HISTORY_MESSAGES = 12;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    provider?: string;
    apiKey?: string;
    plan?: MealPlan;
    history?: ChatMessage[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider as ProviderId | undefined;
  const apiKey = body.apiKey;
  const plan = body.plan ?? null;
  const history = Array.isArray(body.history) ? body.history : [];

  if (!provider || !PROVIDERS[provider])
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  if (typeof apiKey !== "string" || apiKey.length < 8)
    return NextResponse.json({ error: "Invalid apiKey" }, { status: 400 });
  if (history.length === 0 || history[history.length - 1]!.role !== "user") {
    return NextResponse.json(
      { error: "History must end with a user message" },
      { status: 400 },
    );
  }

  const config = await readMealPlannerConfig();
  if (!config) {
    return NextResponse.json({ error: "Meal planner not configured" }, { status: 400 });
  }

  // Trim history to last N messages to keep prompt size in check.
  const trimmedHistory = history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m): ChatMessage => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 4000),
    }));

  const systemPrompt = buildChatSystemPrompt({ config, currentPlan: plan });

  try {
    const result = await generateChatReply(
      provider,
      apiKey,
      systemPrompt,
      trimmedHistory,
    );
    return NextResponse.json({ ok: true, reply: result.reply, model: result.model });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
