import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  upsertJson,
} from "@/lib/google/drive";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import { buildRegeneratePrompt } from "@/lib/tracker/meal-planner-prompt";
import { generateJson } from "@/lib/ai/generate";
import { parseMeals } from "@/lib/tracker/meal-planner-validate";
import {
  youtubeSearchUrl,
  type Day,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";
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
    plan?: MealPlan;
    lockedDays?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider as ProviderId | undefined;
  const apiKey = body.apiKey;
  const plan = body.plan;
  const lockedDays = (body.lockedDays ?? []).filter((d): d is Day =>
    VALID_DAYS.includes(d as Day),
  );

  if (!provider || !PROVIDERS[provider])
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  if (typeof apiKey !== "string" || apiKey.length < 8)
    return NextResponse.json({ error: "Invalid apiKey" }, { status: 400 });
  if (!plan || !Array.isArray(plan.meals))
    return NextResponse.json({ error: "Missing plan" }, { status: 400 });

  const config = await readMealPlannerConfig();
  if (!config) {
    return NextResponse.json({ error: "Meal planner not configured" }, { status: 400 });
  }

  const prompt = buildRegeneratePrompt({
    config,
    recentHistory: [],
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    currentPlan: plan,
    lockedDays,
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

  const meals = parseMeals(generated.json);
  if (!meals) {
    return NextResponse.json(
      { error: "AI regenerate response did not match schema", raw: generated.json },
      { status: 502 },
    );
  }

  // Defensive: trust our locked meals over what the AI returned (paranoid copy-through)
  const finalMeals = meals.map((m) => {
    if (lockedDays.includes(m.day)) {
      const original = plan.meals.find((x) => x.day === m.day);
      if (original) return { ...original, locked: true };
    }
    return { ...m, recipe_url: youtubeSearchUrl(m.youtube_query) };
  });

  const updatedPlan: MealPlan = {
    ...plan,
    generatedAt: new Date().toISOString(),
    generatedBy: { provider, model: generated.model },
    meals: finalMeals,
  };

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
        error: `Regenerate succeeded but Drive write failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        plan: updatedPlan,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, plan: updatedPlan });
}
