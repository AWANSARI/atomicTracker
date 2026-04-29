import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  upsertJson,
} from "@/lib/google/drive";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { buildSwapPrompt } from "@/lib/tracker/meal-planner-prompt";
import { generateJson } from "@/lib/ai/generate";
import { parseMealEnvelope } from "@/lib/tracker/meal-planner-validate";
import {
  youtubeSearchUrl,
  type Day,
  type MealPlan,
  type Slot,
  SLOTS,
} from "@/lib/tracker/meal-planner-plan";
import { fetchRecipeVideos } from "@/lib/youtube/lookup";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const VALID_DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    provider?: string;
    apiKey?: string;
    youtubeKey?: string;
    plan?: MealPlan;
    dayToSwap?: string;
    /** Optional: which slot to swap. Defaults to "dinner" for legacy clients. */
    slotToSwap?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider as ProviderId | undefined;
  const apiKey = body.apiKey;
  const youtubeKey = typeof body.youtubeKey === "string" ? body.youtubeKey : "";
  const plan = body.plan;
  const dayToSwap = body.dayToSwap as Day | undefined;
  const slotToSwap: Slot = SLOTS.includes(body.slotToSwap as Slot)
    ? (body.slotToSwap as Slot)
    : "dinner";

  if (!provider || !PROVIDERS[provider])
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  if (typeof apiKey !== "string" || apiKey.length < 8)
    return NextResponse.json({ error: "Invalid apiKey" }, { status: 400 });
  if (!plan || !Array.isArray(plan.meals))
    return NextResponse.json({ error: "Missing plan" }, { status: 400 });
  if (!dayToSwap || !VALID_DAYS.includes(dayToSwap))
    return NextResponse.json({ error: "Invalid dayToSwap" }, { status: 400 });

  const config = await readMealPlannerConfig();
  if (!config) {
    return NextResponse.json({ error: "Meal planner not configured" }, { status: 400 });
  }

  const prompt = buildSwapPrompt({
    config,
    recentHistory: [],
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    currentPlan: plan,
    dayToSwap,
    slotToSwap,
  });

  let generated;
  try {
    generated = await generateJson(provider, apiKey, prompt);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const newMeal = parseMealEnvelope(generated.json);
  if (!newMeal) {
    return NextResponse.json(
      { error: "AI swap response did not match schema", raw: generated.json },
      { status: 502 },
    );
  }
  if (newMeal.day !== dayToSwap) {
    newMeal.day = dayToSwap;
  }
  // Force the slot we asked for — the AI may omit or guess wrong.
  newMeal.slot = slotToSwap;
  newMeal.recipe_url = youtubeSearchUrl(newMeal.youtube_query);
  if (youtubeKey) {
    const videos = await fetchRecipeVideos(youtubeKey, newMeal.youtube_query, 5);
    if (videos.length > 0) {
      newMeal.recipe_video = videos[0];
      newMeal.recipe_alternatives = videos.slice(1);
    }
  }

  // Replace the matching (day, slot) entry. Legacy plans without slot are
  // treated as dinners — replace them when slotToSwap === "dinner".
  const updatedMeals = plan.meals.map((m) =>
    m.day === dayToSwap && (m.slot ?? "dinner") === slotToSwap ? newMeal : m,
  );
  const modifiedByDay: Partial<Record<Day, string>> = {
    ...(plan.modifiedByDay ?? {}),
  };
  if (plan.status === "accepted") {
    modifiedByDay[dayToSwap] = new Date().toISOString();
  }
  const updatedPlan: MealPlan = {
    ...plan,
    generatedBy: { provider, model: generated.model },
    meals: updatedMeals,
    modifiedByDay,
  };

  // Save back to Drive
  try {
    const layout = await ensureAtomicTrackerLayout(session.accessToken, {
      googleSub: session.googleSub,
      appVersion: APP_VERSION,
    });
    const mealsFolderId = layout.folderIds["history/meals"];
    if (!mealsFolderId) throw new Error("history/meals missing");
    const filename =
      plan.status === "accepted" ? `${plan.weekId}.json` : `${plan.weekId}.draft.json`;
    await upsertJson(session.accessToken, mealsFolderId, filename, updatedPlan);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Swap succeeded but Drive write failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        plan: updatedPlan,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, plan: updatedPlan });
}
