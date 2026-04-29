"use server";

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

async function requireAuth() {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    throw new Error("Not authenticated");
  }
  return { accessToken: session.accessToken, googleSub: session.googleSub };
}

async function getConfigFolderId(token: string, sub: string): Promise<string> {
  const layout = await ensureAtomicTrackerLayout(token, {
    googleSub: sub,
    appVersion: APP_VERSION,
  });
  const id = layout.folderIds["config"];
  if (!id) throw new Error("config folder missing");
  return id;
}

export async function readMealPlannerConfig(): Promise<MealPlannerConfig | null> {
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
      createdAt: raw.createdAt ?? defaults.createdAt,
      updatedAt: raw.updatedAt ?? defaults.updatedAt,
    };
  } catch {
    return null;
  }
}

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
