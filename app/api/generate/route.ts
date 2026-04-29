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
  weekStartFromId,
  youtubeSearchUrl,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
import { parseMeals } from "@/lib/tracker/meal-planner-validate";
import { findFile } from "@/lib/google/drive";
import { fetchTopRecipeVideo } from "@/lib/youtube/lookup";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";

// AI generation can take 5-15s; bump from 10s default to give Claude/OpenAI/Gemini headroom.
export const maxDuration = 60;

const APP_VERSION = "0.1.0";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    provider?: string;
    apiKey?: string;
    youtubeKey?: string;
    weekId?: string;
    overwrite?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider as ProviderId | undefined;
  const apiKey = body.apiKey;
  const youtubeKey = typeof body.youtubeKey === "string" ? body.youtubeKey : "";
  const requestedWeekId = body.weekId;
  const overwrite = Boolean(body.overwrite);

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

  // Compute target week — either the explicitly requested one, or next week
  let ws: Date;
  if (requestedWeekId) {
    const parsed = weekStartFromId(requestedWeekId);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid weekId" }, { status: 400 });
    }
    ws = parsed;
  } else {
    ws = nextWeekStart();
  }
  const we = weekEnd(ws);
  const weekId = isoWeekId(ws);
  const weekStart = isoDate(ws);
  const weekEndStr = isoDate(we);

  // Check if a plan already exists for this week. If so and overwrite is not
  // set, return 409 with status info so the client can prompt for confirmation.
  const layoutPre = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const mealsFolderId = layoutPre.folderIds["history/meals"];
  let existingStatus: "draft" | "accepted" | null = null;
  if (mealsFolderId) {
    const acceptedId = await findFile(session.accessToken, `${weekId}.json`, mealsFolderId);
    if (acceptedId) existingStatus = "accepted";
    else {
      const draftId = await findFile(session.accessToken, `${weekId}.draft.json`, mealsFolderId);
      if (draftId) existingStatus = "draft";
    }
  }
  if (existingStatus && !overwrite) {
    return NextResponse.json(
      {
        error: "A plan already exists for this week",
        existingStatus,
        weekId,
      },
      { status: 409 },
    );
  }

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

  // Attach YouTube fallback search URL on every meal. If a YouTube key was
  // provided, also look up a specific top-result video for each meal's query.
  for (const m of meals) {
    m.recipe_url = youtubeSearchUrl(m.youtube_query);
  }
  if (youtubeKey) {
    await Promise.all(
      meals.map(async (m) => {
        const video = await fetchTopRecipeVideo(youtubeKey, m.youtube_query);
        if (video) m.recipe_video = video;
      }),
    );
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
