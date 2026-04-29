/**
 * Built-in catalog of common supplements + medications, each with a
 * default TimingRule. The wizard uses this catalog as the chip multi-select
 * in step 1; the solver in supplement-rules.ts consumes the rules to place
 * each dose on the daily timeline.
 *
 * `id` is the catalog key — also stored on Supplement.catalogId so we can
 * upgrade a user's rules in-place if we ever revise them.
 */

import type { TimingRule } from "./supplement-types";

export type SupplementCatalogEntry = {
  id: string;
  name: string;
  defaultDose: string;
  /** Default times-per-day. Most are once daily. */
  timesPerDay: number;
  rule: TimingRule;
  /** One-line caveat shown beneath the chip in the wizard. */
  info: string;
};

export const SUPPLEMENT_CATALOG: SupplementCatalogEntry[] = [
  {
    id: "levothyroxine",
    name: "Levothyroxine",
    defaultDose: "50 mcg",
    timesPerDay: 1,
    rule: {
      hints: ["empty-stomach", "morning"],
      selfTags: ["thyroid"],
      gapMinutesFrom: [
        { tag: "calcium", minutes: 240 },
        { tag: "iron", minutes: 240 },
        { tag: "magnesium", minutes: 240 },
        { tag: "fiber-meal", minutes: 60 },
      ],
    },
    info: "Take 30-60 min before food; keep 4h from calcium, iron, magnesium.",
  },
  {
    id: "iron-bisglycinate",
    name: "Iron bisglycinate",
    defaultDose: "25 mg",
    timesPerDay: 1,
    rule: {
      hints: ["with-food"],
      selfTags: ["iron"],
      gapMinutesFrom: [
        { tag: "calcium", minutes: 120 },
        { tag: "tea-coffee", minutes: 120 },
        { tag: "thyroid", minutes: 240 },
        { tag: "magnesium", minutes: 120 },
      ],
    },
    info: "With food; avoid tea/coffee for 2h; keep 4h from thyroid med.",
  },
  {
    id: "vitamin-d3",
    name: "Vitamin D3",
    defaultDose: "2000 IU",
    timesPerDay: 1,
    rule: {
      hints: ["with-fat", "with-food"],
      selfTags: [],
    },
    info: "Fat-soluble — take with a meal containing fat.",
  },
  {
    id: "vitamin-b12",
    name: "Vitamin B12",
    defaultDose: "500 mcg",
    timesPerDay: 1,
    rule: {
      hints: ["any-time"],
      selfTags: [],
    },
    info: "Any time of day; sublingual absorbs without food.",
  },
  {
    id: "omega-3",
    name: "Omega-3 (fish oil)",
    defaultDose: "1000 mg",
    timesPerDay: 1,
    rule: {
      hints: ["with-fat", "with-food"],
      selfTags: [],
    },
    info: "With a meal containing fat — improves absorption, reduces burps.",
  },
  {
    id: "magnesium-glycinate",
    name: "Magnesium glycinate",
    defaultDose: "200 mg",
    timesPerDay: 1,
    rule: {
      hints: ["bedtime"],
      selfTags: ["magnesium"],
      gapMinutesFrom: [
        { tag: "iron", minutes: 120 },
        { tag: "thyroid", minutes: 240 },
      ],
    },
    info: "Bedtime — supports sleep; keep 4h from thyroid med.",
  },
  {
    id: "calcium",
    name: "Calcium",
    defaultDose: "500 mg",
    timesPerDay: 1,
    rule: {
      hints: ["with-food"],
      selfTags: ["calcium"],
      gapMinutesFrom: [
        { tag: "iron", minutes: 120 },
        { tag: "thyroid", minutes: 240 },
      ],
    },
    info: "With food; keep 2h from iron, 4h from thyroid med.",
  },
  {
    id: "vitamin-c",
    name: "Vitamin C",
    defaultDose: "500 mg",
    timesPerDay: 1,
    rule: {
      hints: ["any-time"],
      selfTags: ["vitamin-c"],
    },
    info: "Any time. Pairs well with iron to boost absorption.",
  },
  {
    id: "zinc",
    name: "Zinc",
    defaultDose: "15 mg",
    timesPerDay: 1,
    rule: {
      hints: ["with-food"],
      selfTags: [],
    },
    info: "With food to avoid nausea.",
  },
  {
    id: "multivitamin",
    name: "Multivitamin",
    defaultDose: "1 tablet",
    timesPerDay: 1,
    rule: {
      hints: ["with-food", "with-fat"],
      selfTags: [],
    },
    info: "With a meal containing fat — covers fat-soluble A/D/E/K.",
  },
  {
    id: "probiotics",
    name: "Probiotics",
    defaultDose: "10B CFU",
    timesPerDay: 1,
    rule: {
      hints: ["empty-stomach", "morning"],
      selfTags: [],
    },
    info: "Empty stomach in the morning — survives stomach acid better.",
  },
  {
    id: "ashwagandha",
    name: "Ashwagandha",
    defaultDose: "600 mg",
    timesPerDay: 1,
    rule: {
      hints: ["bedtime", "with-food"],
      selfTags: [],
    },
    info: "Adaptogen — bedtime with a small snack supports sleep & cortisol.",
  },
  {
    id: "inositol",
    name: "Inositol",
    defaultDose: "2 g",
    timesPerDay: 1,
    rule: {
      hints: ["empty-stomach", "morning"],
      selfTags: [],
    },
    info: "Empty stomach in the morning; supports insulin sensitivity.",
  },
  {
    id: "biotin",
    name: "Biotin",
    defaultDose: "5000 mcg",
    timesPerDay: 1,
    rule: {
      hints: ["any-time"],
      selfTags: [],
    },
    info: "Any time. Note: pause 48h before bloodwork (interferes with assays).",
  },
];

export function getCatalogEntry(id: string): SupplementCatalogEntry | undefined {
  return SUPPLEMENT_CATALOG.find((c) => c.id === id);
}
