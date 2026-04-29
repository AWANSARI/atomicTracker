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

/** Build a grocery list from a meal plan. One row per (day, ingredient). */
export function buildGroceryRows(plan: MealPlan): GroceryRow[] {
  const rows: GroceryRow[] = [];
  for (const meal of plan.meals) {
    const recipe = meal.recipe_url ?? "";
    for (const ing of meal.ingredients) {
      rows.push({
        week: plan.weekId,
        day_added: meal.day,
        item: ing.name,
        qty: ing.qty,
        unit: ing.unit,
        category: "",
        walmart_url: walmartSearch(ing.name),
        amazon_url: amazonSearch(ing.name),
        doordash_url: doordashSearch(ing.name),
        recipe_link: recipe,
        status: "",
        purchased_at: "",
      });
    }
  }
  return rows;
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
