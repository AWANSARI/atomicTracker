import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  upsertJson,
} from "@/lib/google/drive";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { buildMealPlannerPrompt } from "@/lib/tracker/meal-planner-prompt";
import { generateJson } from "@/lib/ai/generate";
import {
  isoDate,
  isoWeekId,
  nextWeekStart,
  weekEnd,
  youtubeSearchUrl,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
import { parseMeals } from "@/lib/tracker/meal-planner-validate";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";

// AI generation can take 5-15s; bump from 10s default to give Claude/OpenAI/Gemini headroom.
export const maxDuration = 60;

const APP_VERSION = "0.1.0";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { provider?: string; apiKey?: string };
  try {
    body = (await req.json()) as { provider?: string; apiKey?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider as ProviderId | undefined;
  const apiKey = body.apiKey;
  if (!provider || !PROVIDERS[provider]) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (typeof apiKey !== "string" || apiKey.length < 8) {
    return NextResponse.json({ error: "Invalid apiKey" }, { status: 400 });
  }

  // Read config
  const config = await readMealPlannerConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Meal planner is not configured yet" },
      { status: 400 },
    );
  }

  // Compute target week
  const ws = nextWeekStart();
  const we = weekEnd(ws);
  const weekId = isoWeekId(ws);
  const weekStart = isoDate(ws);
  const weekEndStr = isoDate(we);

  // TODO commit 7+: read recent history. For now, empty.
  const recentHistory: MealPlan[] = [];

  const prompt = buildMealPlannerPrompt({
    config,
    recentHistory,
    weekStart,
    weekEnd: weekEndStr,
  });

  // Call AI
  let generated;
  try {
    generated = await generateJson(provider, apiKey, prompt);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // Validate + normalize
  const meals = parseMeals(generated.json);
  if (!meals) {
    return NextResponse.json(
      {
        error: "AI response did not match expected schema",
        raw: typeof generated.json === "object" ? generated.json : String(generated.json).slice(0, 800),
      },
      { status: 502 },
    );
  }

  // Attach YouTube search URLs
  for (const m of meals) {
    m.recipe_url = youtubeSearchUrl(m.youtube_query);
  }

  const plan: MealPlan = {
    v: 1,
    weekId,
    weekStart,
    weekEnd: weekEndStr,
    generatedAt: new Date().toISOString(),
    generatedBy: { provider, model: generated.model },
    status: "draft",
    meals,
  };

  // Save draft to /AtomicTracker/history/meals/{weekId}.draft.json
  try {
    const layout = await ensureAtomicTrackerLayout(session.accessToken, {
      googleSub: session.googleSub,
      appVersion: APP_VERSION,
    });
    const mealsFolderId = layout.folderIds["history/meals"];
    if (!mealsFolderId) throw new Error("history/meals folder missing");
    await upsertJson(
      session.accessToken,
      mealsFolderId,
      `${weekId}.draft.json`,
      plan,
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: `Plan generated but Drive write failed: ${e instanceof Error ? e.message : String(e)}`,
        plan,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, plan });
}
