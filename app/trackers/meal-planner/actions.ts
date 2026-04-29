"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import {
  emptyMealPlannerConfig,
  type MealPlannerConfig,
} from "@/lib/tracker/meal-planner-types";

const APP_VERSION = "0.1.0";
const CONFIG_FILE = "tracker.meal-planner.json";

const requireAuth = cache(async () => {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    throw new Error("Not authenticated");
  }
  return { accessToken: session.accessToken, googleSub: session.googleSub };
});

async function getConfigFolderId(token: string, sub: string): Promise<string> {
  const layout = await ensureAtomicTrackerLayout(token, {
    googleSub: sub,
    appVersion: APP_VERSION,
  });
  const id = layout.folderIds["config"];
  if (!id) throw new Error("config folder missing");
  return id;
}

/**
 * Wrapped in React `cache()` so layout/page/actions sharing one render
 * make a single Drive roundtrip. Per-request scope only.
 */
export const readMealPlannerConfig = cache(async (): Promise<MealPlannerConfig | null> => {
  const { accessToken, googleSub } = await requireAuth();
  const configId = await getConfigFolderId(accessToken, googleSub);
  const fileId = await findFile(accessToken, CONFIG_FILE, configId);
  if (!fileId) return null;
  try {
    const raw = await readJson<Partial<MealPlannerConfig>>(accessToken, fileId);
    // Merge with defaults so older saved configs missing newer fields don't
    // produce undefined values that crash UI code (e.g. cookingDays.includes).
    const defaults = emptyMealPlannerConfig();
    return {
      ...defaults,
      ...raw,
      mealtimes: { ...defaults.mealtimes, ...(raw.mealtimes ?? {}) },
      diets: raw.diets ?? [],
      healthConditions: raw.healthConditions ?? [],
      allergies: raw.allergies ?? [],
      customAllergies: raw.customAllergies ?? [],
      cuisines: raw.cuisines ?? [],
      customCuisines: raw.customCuisines ?? [],
      ingredients: raw.ingredients ?? [],
      customIngredients: raw.customIngredients ?? [],
      favoriteMeals: raw.favoriteMeals ?? [],
      favoriteIngredients: raw.favoriteIngredients ?? [],
      cookingDays: raw.cookingDays ?? defaults.cookingDays,
      shoppingDay: raw.shoppingDay ?? defaults.shoppingDay,
      shoppingTime: raw.shoppingTime ?? defaults.shoppingTime,
      heightCm: raw.heightCm,
      weightKg: raw.weightKg,
      age: raw.age,
      sex: raw.sex,
      activityLevel: raw.activityLevel,
      goal: raw.goal,
      nutritionistNotes: raw.nutritionistNotes,
      symptoms: Array.isArray(raw.symptoms) ? raw.symptoms : [],
      snacksEnabled: typeof raw.snacksEnabled === "boolean" ? raw.snacksEnabled : false,
      createdAt: raw.createdAt ?? defaults.createdAt,
      updatedAt: raw.updatedAt ?? defaults.updatedAt,
    };
  } catch {
    return null;
  }
});

export async function saveMealPlannerConfig(
  config: Omit<MealPlannerConfig, "createdAt" | "updatedAt"> &
    Partial<Pick<MealPlannerConfig, "createdAt" | "updatedAt">>,
): Promise<{ ok: true }> {
  const { accessToken, googleSub } = await requireAuth();
  const configId = await getConfigFolderId(accessToken, googleSub);
  const now = new Date().toISOString();
  const existing = await readMealPlannerConfig();
  const final: MealPlannerConfig = {
    ...emptyMealPlannerConfig(),
    ...config,
    createdAt: existing?.createdAt ?? config.createdAt ?? now,
    updatedAt: now,
  };
  await upsertJson(accessToken, configId, CONFIG_FILE, final);
  revalidatePath("/dashboard");
  revalidatePath("/trackers/meal-planner");
  return { ok: true };
}

export async function hasMealPlannerConfig(): Promise<boolean> {
  const config = await readMealPlannerConfig();
  return config != null;
}

// ─── Favorites mutations ──────────────────────────────────────────────────
//
// Small focused server actions used by the plan card "heart" toggle and the
// Favorites manager on the meal-planner home. Each one reads the current
// config, mutates the favoriteMeals/favoriteIngredients array, and writes
// it back. They return the updated array so the client can reconcile state
// without a full re-fetch.

const norm = (s: string) => s.trim();

async function mutateFavorites(
  field: "favoriteMeals" | "favoriteIngredients",
  fn: (current: string[]) => string[],
): Promise<string[]> {
  const { accessToken, googleSub } = await requireAuth();
  const configId = await getConfigFolderId(accessToken, googleSub);
  const existing = await readMealPlannerConfig();
  if (!existing) {
    throw new Error("Meal planner not configured yet");
  }
  const current = existing[field] ?? [];
  const next = fn(current);
  const now = new Date().toISOString();
  const final: MealPlannerConfig = {
    ...existing,
    [field]: next,
    updatedAt: now,
  };
  await upsertJson(accessToken, configId, CONFIG_FILE, final);
  revalidatePath("/trackers/meal-planner");
  return next;
}

/**
 * Toggle a meal name in `favoriteMeals` — add if missing, remove if present.
 * Case-sensitive match on trimmed input. Returns the updated list.
 */
export async function toggleFavoriteMeal(name: string): Promise<string[]> {
  const v = norm(name);
  if (!v) throw new Error("Empty name");
  return mutateFavorites("favoriteMeals", (current) =>
    current.includes(v) ? current.filter((n) => n !== v) : [...current, v],
  );
}

export async function addFavoriteMeal(name: string): Promise<string[]> {
  const v = norm(name);
  if (!v) throw new Error("Empty name");
  return mutateFavorites("favoriteMeals", (current) =>
    current.includes(v) ? current : [...current, v],
  );
}

export async function removeFavoriteMeal(name: string): Promise<string[]> {
  const v = norm(name);
  if (!v) throw new Error("Empty name");
  return mutateFavorites("favoriteMeals", (current) =>
    current.filter((n) => n !== v),
  );
}

export async function addFavoriteIngredient(name: string): Promise<string[]> {
  const v = norm(name);
  if (!v) throw new Error("Empty name");
  return mutateFavorites("favoriteIngredients", (current) =>
    current.includes(v) ? current : [...current, v],
  );
}

export async function removeFavoriteIngredient(name: string): Promise<string[]> {
  const v = norm(name);
  if (!v) throw new Error("Empty name");
  return mutateFavorites("favoriteIngredients", (current) =>
    current.filter((n) => n !== v),
  );
}
