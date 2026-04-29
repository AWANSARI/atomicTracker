import { NextResponse } from "next/server";
import { verifyDispatchToken } from "@/lib/dispatch/token";
import { refreshGoogleAccessToken } from "@/lib/dispatch/refresh";
import {
  ensureAtomicTrackerLayout,
  findFile,
  listFolderChildren,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import {
  emptyMealPlannerConfig,
  type MealPlannerConfig,
} from "@/lib/tracker/meal-planner-types";
import {
  buildAdherenceSummary,
  buildMealPlannerPrompt,
} from "@/lib/tracker/meal-planner-prompt";
import { generateJson } from "@/lib/ai/generate";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";
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
import { fetchRecipeVideos } from "@/lib/youtube/lookup";
import type { AnalyticsDayLog } from "@/lib/tracker/analytics-types";
import type { HabitConfig, HabitDayLog } from "@/lib/tracker/habit-types";
import type { SupplementConfig } from "@/lib/tracker/supplement-types";

/**
 * POST /api/dispatch/[token]
 *
 * The "external scheduler" endpoint. Used by Claude Code Routine (or any
 * cron-like external system) to trigger work without a live user session.
 *
 * Auth: the URL itself is the credential. The token is an AES-GCM blob
 * containing { sub, refresh_token, drive root id }. We decrypt → refresh
 * the Google access token → act on the user's Drive.
 *
 * No project-side state. The token *is* the state.
 *
 * Body actions:
 *   - "ping": validate the token + return a small fingerprint. Useful from
 *     the Settings UI "Test routine endpoint" button.
 *   - "generate-next-week": equivalent of /api/generate but called by the
 *     scheduler, not a logged-in user. The routine config carries the AI
 *     provider key in the request body.
 */

export const maxDuration = 60;

const APP_VERSION = "0.1.0";
const DISPATCH_MARKER_FILE = "tracker.dispatch.json";
const MEAL_PLANNER_CONFIG_FILE = "tracker.meal-planner.json";

type DispatchAction = "generate-next-week" | "ping";

type DispatchBody = {
  action?: DispatchAction;
  provider?: ProviderId;
  apiKey?: string;
  youtubeKey?: string;
  weekId?: string;
};

type DispatchMarker = {
  v: 1;
  createdAt: string;
  lastUsedAt?: string;
  rotatedAt?: string;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const verified = verifyDispatchToken(token);
  if (!verified.ok) {
    return NextResponse.json(
      { error: "Invalid dispatch token", reason: verified.reason },
      { status: 401 },
    );
  }
  const payload = verified.payload;

  let body: DispatchBody;
  try {
    body = (await req.json()) as DispatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action: DispatchAction = body.action ?? "generate-next-week";

  // Refresh the Google access token using the refresh token in the payload.
  let accessToken: string;
  try {
    const refreshed = await refreshGoogleAccessToken(payload.rt);
    accessToken = refreshed.accessToken;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "Failed to refresh Google access token. The user may have revoked OAuth or the refresh token has expired. Re-mint the dispatch token from Settings.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 401 },
    );
  }

  if (action === "ping") {
    return NextResponse.json({
      ok: true,
      sub: payload.sub.slice(0, 6) + "...",
      driveRootId: payload.drive,
      issuedAt: new Date(payload.iat * 1000).toISOString(),
    });
  }

  if (action !== "generate-next-week") {
    return NextResponse.json(
      { error: `Unsupported action: ${action}` },
      { status: 400 },
    );
  }

  // Validate provider + apiKey for generate-next-week.
  const provider = body.provider;
  const apiKey = body.apiKey;
  const youtubeKey = typeof body.youtubeKey === "string" ? body.youtubeKey : "";
  if (!provider || !PROVIDERS[provider]) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (typeof apiKey !== "string" || apiKey.length < 8) {
    return NextResponse.json({ error: "Invalid apiKey" }, { status: 400 });
  }

  // Fast-path Drive layout: ensureAtomicTrackerLayout will reuse the cached
  // user.json. We pass a fresh accessToken so the cache key is unique to this
  // dispatch request — no risk of cross-user leakage.
  const layout = await ensureAtomicTrackerLayout(accessToken, {
    googleSub: payload.sub,
    appVersion: APP_VERSION,
  });
  const configFolderId = layout.folderIds["config"];
  const mealsFolderId = layout.folderIds["history/meals"];
  if (!configFolderId || !mealsFolderId) {
    return NextResponse.json(
      { error: "Required Drive folders missing" },
      { status: 500 },
    );
  }

  // Read meal-planner config (no auth() — we use the dispatch-derived token).
  const mealPlannerConfigId = await findFile(
    accessToken,
    MEAL_PLANNER_CONFIG_FILE,
    configFolderId,
  );
  if (!mealPlannerConfigId) {
    return NextResponse.json(
      { error: "Meal planner is not configured yet — finish setup in the app first" },
      { status: 400 },
    );
  }
  const rawConfig = await readJson<Partial<MealPlannerConfig>>(
    accessToken,
    mealPlannerConfigId,
  );
  const defaults = emptyMealPlannerConfig();
  const config: MealPlannerConfig = {
    ...defaults,
    ...rawConfig,
    mealtimes: { ...defaults.mealtimes, ...(rawConfig.mealtimes ?? {}) },
    diets: rawConfig.diets ?? [],
    healthConditions: rawConfig.healthConditions ?? [],
    allergies: rawConfig.allergies ?? [],
    customAllergies: rawConfig.customAllergies ?? [],
    cuisines: rawConfig.cuisines ?? [],
    customCuisines: rawConfig.customCuisines ?? [],
    ingredients: rawConfig.ingredients ?? [],
    customIngredients: rawConfig.customIngredients ?? [],
    favoriteMeals: rawConfig.favoriteMeals ?? [],
    favoriteIngredients: rawConfig.favoriteIngredients ?? [],
    cookingDays: rawConfig.cookingDays ?? defaults.cookingDays,
    shoppingDay: rawConfig.shoppingDay ?? defaults.shoppingDay,
    shoppingTime: rawConfig.shoppingTime ?? defaults.shoppingTime,
    symptoms: Array.isArray(rawConfig.symptoms) ? rawConfig.symptoms : [],
    snacksEnabled:
      typeof rawConfig.snacksEnabled === "boolean" ? rawConfig.snacksEnabled : false,
    createdAt: rawConfig.createdAt ?? defaults.createdAt,
    updatedAt: rawConfig.updatedAt ?? defaults.updatedAt,
  };

  // Compute target week.
  let ws: Date;
  if (body.weekId) {
    const parsed = weekStartFromId(body.weekId);
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

  // Build adherence summary best-effort.
  const adherence = await buildAdherenceForDispatch(accessToken, layout.folderIds);

  const prompt = buildMealPlannerPrompt({
    config,
    recentHistory: [],
    weekStart,
    weekEnd: weekEndStr,
    adherence,
  });

  // AI call.
  let generated: { json: unknown; model: string };
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
      { error: "AI response did not match expected schema" },
      { status: 502 },
    );
  }

  for (const m of meals) {
    m.recipe_url = youtubeSearchUrl(m.youtube_query);
  }
  if (youtubeKey) {
    await Promise.all(
      meals.map(async (m) => {
        const videos = await fetchRecipeVideos(youtubeKey, m.youtube_query, 5);
        if (videos.length > 0) {
          m.recipe_video = videos[0];
          m.recipe_alternatives = videos.slice(1);
        }
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

  try {
    await upsertJson(accessToken, mealsFolderId, `${weekId}.draft.json`, plan);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Plan generated but Drive write failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    );
  }

  // Update marker's lastUsedAt — best-effort.
  try {
    const markerId = await findFile(
      accessToken,
      DISPATCH_MARKER_FILE,
      configFolderId,
    );
    if (markerId) {
      const prior = await readJson<Partial<DispatchMarker>>(
        accessToken,
        markerId,
      ).catch(() => null);
      const next: DispatchMarker = {
        v: 1,
        createdAt: prior?.createdAt ?? new Date().toISOString(),
        rotatedAt: prior?.rotatedAt,
        lastUsedAt: new Date().toISOString(),
      };
      await upsertJson(accessToken, configFolderId, DISPATCH_MARKER_FILE, next);
    }
  } catch {
    // ignore
  }

  const days = Array.from(new Set(meals.map((m) => m.day)));
  return NextResponse.json({
    ok: true,
    weekId,
    planSummary: {
      mealCount: meals.length,
      days,
    },
  });
}

/**
 * Best-effort adherence summary read with the dispatch-derived access token.
 * Mirrors the shape used by /api/generate but inlined here so dispatch doesn't
 * depend on server actions that require a live session.
 */
async function buildAdherenceForDispatch(
  accessToken: string,
  folderIds: Record<string, string>,
) {
  const configFolderId = folderIds["config"];
  const analyticsFolderId = folderIds["history/analytics"];
  const habitsFolderId = folderIds["history/habits"];
  const supplementsFolderId = folderIds["history/supplements"];

  // 28-day window, UTC.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 28);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const [analyticsLogs, habitLogs, supplementLogs, habitConfig, supplementConfig] =
    await Promise.all([
      readDailyLogs<AnalyticsDayLog>(accessToken, analyticsFolderId, cutoffIso),
      readDailyLogs<HabitDayLog>(accessToken, habitsFolderId, cutoffIso),
      readDailyLogs<{ date: string; taken?: Record<string, string> }>(
        accessToken,
        supplementsFolderId,
        cutoffIso,
      ),
      configFolderId
        ? readNamedJson<HabitConfig>(accessToken, "tracker.habits.json", configFolderId)
        : Promise.resolve(null),
      configFolderId
        ? readNamedJson<SupplementConfig>(
            accessToken,
            "tracker.supplements.json",
            configFolderId,
          )
        : Promise.resolve(null),
    ]);

  const habitNames: Record<string, string> = {};
  for (const h of habitConfig?.habits ?? []) habitNames[h.id] = h.name;
  const supplementNames: Record<string, string> = {};
  for (const s of supplementConfig?.supplements ?? []) supplementNames[s.id] = s.name;

  return buildAdherenceSummary({
    analytics: analyticsLogs,
    habitLogs: habitLogs.map((h) => ({ date: h.date, done: h.done ?? [] })),
    habitNames,
    supplementLogs: supplementLogs.map((s) => ({
      date: s.date,
      taken: s.taken ?? {},
    })),
    supplementNames,
  });
}

async function readDailyLogs<T extends { date: string }>(
  accessToken: string,
  folderId: string | undefined,
  cutoffIso: string,
): Promise<T[]> {
  if (!folderId) return [];
  try {
    const children = await listFolderChildren(accessToken, folderId);
    const recent = children.filter(
      (c) =>
        /^\d{4}-\d{2}-\d{2}\.json$/.test(c.name) && c.name >= `${cutoffIso}.json`,
    );
    const docs = await Promise.all(
      recent.map((c) =>
        readJson<T>(accessToken, c.id).catch(() => null as T | null),
      ),
    );
    const out: T[] = [];
    for (const d of docs) {
      if (d) out.push(d);
    }
    return out;
  } catch {
    return [];
  }
}

async function readNamedJson<T>(
  accessToken: string,
  name: string,
  parentId: string,
): Promise<T | null> {
  try {
    const fileId = await findFile(accessToken, name, parentId);
    if (!fileId) return null;
    return await readJson<T>(accessToken, fileId);
  } catch {
    return null;
  }
}
