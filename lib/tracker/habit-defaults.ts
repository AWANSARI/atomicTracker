import type { HabitCadence } from "./habit-types";

/**
 * Built-in suggested habits. Picked in step 1 of the wizard. Each item maps
 * 1:1 to a Habit with its `catalogId` set to the entry's `id`.
 *
 * Skewed toward the routine + nutrient + hormonal-balance persona this app
 * is being repositioned for (CLAUDE.md / PLAN.md): emphasis on whole-food
 * habits, sleep, hydration, and gentle daily activity.
 */
export type HabitCatalogEntry = {
  id: string;
  name: string;
  cadence: HabitCadence;
  tags?: string[];
};

export const HABIT_CATALOG: HabitCatalogEntry[] = [
  {
    id: "soaked-nuts",
    name: "Soaked nuts (almonds + walnuts)",
    cadence: "daily",
    tags: ["protein", "fats"],
  },
  {
    id: "seed-cycling",
    name: "Seed cycling (flax/pumpkin or sunflower/sesame)",
    cadence: "daily",
    tags: ["women", "hormonal"],
  },
  {
    id: "three-fruits",
    name: "3 servings of fruit",
    cadence: "daily",
    tags: ["vitamins"],
  },
  {
    id: "ginger-garlic",
    name: "Ginger / garlic in cooking",
    cadence: "daily",
    tags: ["thyroid", "anti-inflammatory"],
  },
  {
    id: "8-glasses-water",
    name: "8 glasses of water",
    cadence: "daily",
    tags: ["hydration"],
  },
  {
    id: "30-min-walk",
    name: "30-minute walk",
    cadence: "daily",
    tags: ["activity"],
  },
  {
    id: "sleep-7h",
    name: "Sleep at least 7 hours",
    cadence: "daily",
    tags: ["recovery"],
  },
  {
    id: "morning-sunlight",
    name: "10 min morning sunlight",
    cadence: "daily",
    tags: ["vitamin-d", "circadian"],
  },
  {
    id: "no-screens-bed",
    name: "No screens 30 min before bed",
    cadence: "daily",
    tags: ["sleep"],
  },
  {
    id: "warm-water-morning",
    name: "Warm water on waking",
    cadence: "daily",
    tags: ["digestion"],
  },
  {
    id: "weekly-fish",
    name: "Fish 2x this week",
    cadence: "weekly",
    tags: ["protein", "omega-3"],
  },
  {
    id: "strength-training",
    name: "Strength training 3x this week",
    cadence: "weekly",
    tags: ["activity"],
  },
];
