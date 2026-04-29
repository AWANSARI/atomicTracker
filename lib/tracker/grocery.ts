import type { MealPlan } from "./meal-planner-plan";

/** One row in the grocery CSV. */
export type GroceryRow = {
  week: string;
  day_added: string;
  item: string;
  qty: string;
  unit: string;
  category: string;
  walmart_url: string;
  amazon_url: string;
  doordash_url: string;
  recipe_link: string;
  status: string;
  purchased_at: string;
};

/**
 * Order categories appear in the grocery list. Roughly matches a typical
 * supermarket walk: produce first, then proteins, dairy, grains, pantry,
 * spices, frozen at the end.
 */
const CATEGORY_ORDER: Record<string, number> = {
  produce: 1,
  protein: 2,
  dairy: 3,
  grain: 4,
  pantry: 5,
  spice: 6,
  frozen: 7,
  other: 8,
  "": 9,
};

/**
 * Aggregate ingredients across all meals into one row per (item, unit).
 * Quantities are summed when parsable; non-numeric quantities are
 * concatenated. The day_added column lists every day the ingredient was
 * referenced. Sorted by category (supermarket walk order) then item.
 */
export function buildGroceryRows(plan: MealPlan): GroceryRow[] {
  type Bucket = {
    item: string;
    unit: string;
    category: string;
    days: string[];
    numericTotal: number;
    nonNumeric: string[];
    walmart_url: string;
    amazon_url: string;
    doordash_url: string;
    recipeLinks: Set<string>;
  };
  const buckets = new Map<string, Bucket>();

  function key(name: string, unit: string): string {
    return `${name.toLowerCase().trim()}::${unit.toLowerCase().trim()}`;
  }

  for (const meal of plan.meals) {
    const recipe = meal.recipe_video?.url ?? meal.recipe_url ?? "";
    for (const ing of meal.ingredients) {
      const k = key(ing.name, ing.unit);
      let bucket = buckets.get(k);
      if (!bucket) {
        bucket = {
          item: ing.name,
          unit: ing.unit,
          category: ing.category ?? "other",
          days: [],
          numericTotal: 0,
          nonNumeric: [],
          walmart_url: walmartSearch(ing.name),
          amazon_url: amazonSearch(ing.name),
          doordash_url: doordashSearch(ing.name),
          recipeLinks: new Set(),
        };
        buckets.set(k, bucket);
      }
      if (!bucket.days.includes(meal.day)) bucket.days.push(meal.day);
      const num = parseQty(ing.qty);
      if (num !== null) {
        bucket.numericTotal += num;
      } else if (ing.qty.trim()) {
        bucket.nonNumeric.push(ing.qty.trim());
      }
      if (recipe) bucket.recipeLinks.add(recipe);
    }
  }

  const rows: GroceryRow[] = [];
  for (const b of buckets.values()) {
    const numericPart = b.numericTotal > 0 ? formatNumber(b.numericTotal) : "";
    const qtyParts = [numericPart, ...b.nonNumeric].filter(Boolean);
    const qty = qtyParts.length ? qtyParts.join(" + ") : "to taste";
    rows.push({
      week: plan.weekId,
      day_added: b.days.join(", "),
      item: b.item,
      qty,
      unit: b.unit,
      category: b.category,
      walmart_url: b.walmart_url,
      amazon_url: b.amazon_url,
      doordash_url: b.doordash_url,
      recipe_link: Array.from(b.recipeLinks).join(" | "),
      status: "",
      purchased_at: "",
    });
  }
  rows.sort((a, b) => {
    const ca = CATEGORY_ORDER[a.category] ?? 9;
    const cb = CATEGORY_ORDER[b.category] ?? 9;
    if (ca !== cb) return ca - cb;
    return a.item.toLowerCase().localeCompare(b.item.toLowerCase());
  });
  return rows;
}

/** Parse "200", "1/2", "1.5", "2-3" -> first number. Returns null if not numeric. */
function parseQty(qty: string): number | null {
  const trimmed = qty.trim();
  if (!trimmed) return null;
  // Fraction like "1/2"
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
  if (frac) {
    const a = parseInt(frac[1]!, 10);
    const b = parseInt(frac[2]!, 10);
    if (b > 0) return a / b;
  }
  // Mixed number "1 1/2"
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
  if (mixed) {
    const w = parseInt(mixed[1]!, 10);
    const a = parseInt(mixed[2]!, 10);
    const b = parseInt(mixed[3]!, 10);
    if (b > 0) return w + a / b;
  }
  // Range "2-3" -> take first number
  const range = /^(\d+(?:\.\d+)?)\s*-\s*\d+(?:\.\d+)?$/.exec(trimmed);
  if (range) return parseFloat(range[1]!);
  // Plain number "200" or "1.5"
  const num = parseFloat(trimmed);
  if (!isNaN(num) && /^[\d.]+$/.test(trimmed.replace(/\s/g, ""))) return num;
  return null;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** RFC 4180 CSV with header row. */
export function rowsToCsv(rows: GroceryRow[]): string {
  const headers: (keyof GroceryRow)[] = [
    "week",
    "day_added",
    "item",
    "qty",
    "unit",
    "category",
    "walmart_url",
    "amazon_url",
    "doordash_url",
    "recipe_link",
    "status",
    "purchased_at",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvField(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

function csvField(value: string): string {
  // Always quote — RFC 4180 says always-quote is valid and avoids edge cases.
  return `"${value.replace(/"/g, '""')}"`;
}

function walmartSearch(item: string): string {
  return `https://www.walmart.com/search?q=${encodeURIComponent(item)}`;
}

function amazonSearch(item: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(item)}&i=amazonfresh`;
}

function doordashSearch(item: string): string {
  return `https://www.doordash.com/search/store/grocery/?query=${encodeURIComponent(item)}`;
}
