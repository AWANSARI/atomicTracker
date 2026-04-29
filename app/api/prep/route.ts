import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";
import { addMinutes, createEvent, localDateTime } from "@/lib/google/calendar";
import { readMealPlannerConfig } from "@/app/trackers/meal-planner/actions";
import {
  type Day,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const VALID_DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_OFFSETS: Record<Day, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};
// Mon-Fri offsets, used for breakfast/lunch scheduling
const WEEKDAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    weekId?: string;
    prepped?: string[];
    breakfast?: string;
    lunch?: string;
    timezone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const weekId = body.weekId;
  const prepped = (body.prepped ?? []).filter((d): d is Day =>
    VALID_DAYS.includes(d as Day),
  );
  const breakfast = (body.breakfast ?? "").trim();
  const lunch = (body.lunch ?? "").trim();
  const timezone =
    typeof body.timezone === "string" && body.timezone ? body.timezone : "UTC";

  if (!weekId) {
    return NextResponse.json({ error: "Missing weekId" }, { status: 400 });
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const mealsFolderId = layout.folderIds["history/meals"];
  if (!mealsFolderId) {
    return NextResponse.json(
      { error: "Drive folders missing — re-bootstrap from dashboard" },
      { status: 500 },
    );
  }

  const planFileId = await findFile(
    session.accessToken,
    `${weekId}.json`,
    mealsFolderId,
  );
  if (!planFileId) {
    return NextResponse.json(
      { error: "No accepted plan for this week" },
      { status: 404 },
    );
  }
  const plan = await readJson<MealPlan>(session.accessToken, planFileId).catch(
    () => null,
  );
  if (!plan) {
    return NextResponse.json({ error: "Couldn't read plan" }, { status: 500 });
  }

  const config = await readMealPlannerConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Meal planner config missing" },
      { status: 400 },
    );
  }

  // Build the calendar events
  const weekStartDate = new Date(plan.weekStart + "T00:00:00Z");
  const events: { name: string; ok: boolean; htmlLink?: string; error?: string }[] = [];

  // 1. Dinner events for prepped days
  for (const day of prepped) {
    const meal = plan.meals.find((m) => m.day === day);
    if (!meal) continue;
    const dayDate = new Date(weekStartDate);
    dayDate.setUTCDate(weekStartDate.getUTCDate() + DAY_OFFSETS[day]);
    const start = localDateTime(dayDate, config.mealtimes.dinner, timezone);
    const end = localDateTime(
      dayDate,
      addMinutes(config.mealtimes.dinner, 60),
      timezone,
    );
    try {
      const ev = await createEvent(session.accessToken, {
        summary: `🍽️ ${meal.name}`,
        description: [
          `${meal.cuisine} · ${meal.calories} kcal`,
          `Macros — P ${meal.macros.protein_g}g / C ${meal.macros.carbs_g}g / F ${meal.macros.fat_g}g / Fib ${meal.macros.fiber_g}g`,
          "",
          meal.health_notes,
          "",
          `Ingredients:`,
          ...meal.ingredients.map((i) => `  • ${i.qty} ${i.unit} ${i.name}`),
          "",
          `Instructions: ${meal.instructions}`,
          ...(meal.recipe_url ? ["", `Recipe video: ${meal.recipe_url}`] : []),
        ].join("\n"),
        start,
        end,
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 30 }],
        },
        ...(meal.recipe_url
          ? { source: { title: "Recipe video", url: meal.recipe_url } }
          : {}),
      });
      events.push({ name: `${day} · ${meal.name}`, ok: true, htmlLink: ev.htmlLink });
    } catch (e) {
      events.push({
        name: `${day} · ${meal.name}`,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 2. Breakfast events Mon-Fri (if provided)
  if (breakfast) {
    for (const day of WEEKDAYS) {
      const dayDate = new Date(weekStartDate);
      dayDate.setUTCDate(weekStartDate.getUTCDate() + DAY_OFFSETS[day]);
      const start = localDateTime(dayDate, config.mealtimes.breakfast, timezone);
      const end = localDateTime(
        dayDate,
        addMinutes(config.mealtimes.breakfast, 30),
        timezone,
      );
      try {
        const ev = await createEvent(session.accessToken, {
          summary: `☕ ${breakfast}`,
          description: "Breakfast — scheduled via AtomicTracker prep check-in.",
          start,
          end,
          reminders: { useDefault: false },
        });
        events.push({ name: `${day} · breakfast`, ok: true, htmlLink: ev.htmlLink });
      } catch (e) {
        events.push({
          name: `${day} · breakfast`,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // 3. Lunch events Mon-Fri (if provided)
  if (lunch) {
    for (const day of WEEKDAYS) {
      const dayDate = new Date(weekStartDate);
      dayDate.setUTCDate(weekStartDate.getUTCDate() + DAY_OFFSETS[day]);
      const start = localDateTime(dayDate, config.mealtimes.lunch, timezone);
      const end = localDateTime(
        dayDate,
        addMinutes(config.mealtimes.lunch, 30),
        timezone,
      );
      try {
        const ev = await createEvent(session.accessToken, {
          summary: `🥗 ${lunch}`,
          description: "Lunch — scheduled via AtomicTracker prep check-in.",
          start,
          end,
          reminders: { useDefault: false },
        });
        events.push({ name: `${day} · lunch`, ok: true, htmlLink: ev.htmlLink });
      } catch (e) {
        events.push({
          name: `${day} · lunch`,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // 4. Save prep state to /history/meals/{weekId}-prep.json
  try {
    await upsertJson(session.accessToken, mealsFolderId, `${weekId}-prep.json`, {
      v: 1,
      weekId,
      prepped,
      breakfast: breakfast || undefined,
      lunch: lunch || undefined,
      submittedAt: new Date().toISOString(),
      timezone,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Calendar events created but prep.json write failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        events,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, events });
}
