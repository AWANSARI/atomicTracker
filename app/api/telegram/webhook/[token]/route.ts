import { NextResponse } from "next/server";
import { verifyDispatchToken } from "@/lib/dispatch/token";
import { refreshGoogleAccessToken } from "@/lib/dispatch/refresh";
import { sendMessage, type TelegramUpdate } from "@/lib/telegram/api";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
} from "@/lib/google/drive";
import {
  currentWeekStart,
  isoWeekId,
  nextWeekStart,
  type Day,
  type MealPlan,
} from "@/lib/tracker/meal-planner-plan";

/**
 * Telegram bot webhook.
 *
 * Telegram POSTs every message to /api/telegram/webhook/<token>. The token is
 * a dispatch-style encrypted blob carrying { sub, rt, drive, bt, chat } so we
 * can:
 *   1. Refresh the user's Google access token (rt → access)
 *   2. Read their Drive (sub + access)
 *   3. Reply on their bot (bt → sendMessage)
 *
 * Why not also call AI? The AI provider key lives encrypted in
 * connectors.enc.json keyed by the user's passphrase, which is in their
 * browser only. Server-side webhook can't decrypt → can't generate plans.
 * Commands here are READ-ONLY against Drive plus deep-links back to the PWA
 * for anything that needs AI.
 *
 * IMPORTANT: this handler must always return 200 to Telegram (even on errors)
 * — otherwise Telegram retries indefinitely. Errors are logged silently and
 * possibly nudged to the user via a friendly chat message.
 */

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const APP_BASE = process.env.AUTH_URL || "https://atomictracker.vercel.app";

const HELP_TEXT = [
  "AtomicTracker bot. Commands:",
  "",
  "/status — current week's plan",
  "/today — what's on the menu today",
  "/grocery — current grocery list",
  "/plan — open the planner (deep link)",
  "/help — this message",
  "",
  "Generate, swap, accept, etc. need your encryption passphrase, so they live in the web app.",
].join("\n");

const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> | { token: string } },
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  const token = decodeURIComponent(params.token);

  // ── Verify token ──────────────────────────────────────────────────────
  const verified = verifyDispatchToken(token);
  if (!verified.ok) {
    // Don't echo back to Telegram (we don't know which bot to use). Just 200.
    return NextResponse.json({ ok: true, ignored: "token-invalid" });
  }
  const { sub, rt, bt: botToken, chat: chatId } = verified.payload;
  if (!botToken || !chatId) {
    return NextResponse.json({ ok: true, ignored: "token-missing-bt-chat" });
  }

  // ── Parse incoming update ─────────────────────────────────────────────
  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true, ignored: "bad-json" });
  }
  const text = update.message?.text?.trim() ?? "";
  const incomingChat = update.message?.chat.id;

  // Drop messages from chats we didn't pair with — defense-in-depth
  if (incomingChat !== chatId) {
    return NextResponse.json({ ok: true, ignored: "wrong-chat" });
  }
  if (!text) {
    return NextResponse.json({ ok: true, ignored: "empty-text" });
  }

  // ── Route command ─────────────────────────────────────────────────────
  const command = text.split(/\s+/)[0]!.toLowerCase();
  const reply = await handleCommand(command, { sub, rt, botToken });

  if (reply) {
    try {
      await sendMessage(botToken, chatId, reply);
    } catch {
      // Best-effort — don't fail the webhook if Telegram is flaky
    }
  }
  return NextResponse.json({ ok: true });
}

async function handleCommand(
  command: string,
  ctx: { sub: string; rt: string; botToken: string },
): Promise<string | null> {
  switch (command) {
    case "/start":
    case "/help":
      return HELP_TEXT;
    case "/status":
      return await statusCommand(ctx);
    case "/today":
      return await todayCommand(ctx);
    case "/grocery":
      return await groceryCommand(ctx);
    case "/plan":
      return planLinkCommand();
    default:
      // Quietly ignore non-commands so the bot doesn't spam every casual message
      if (command.startsWith("/")) {
        return `Unknown command. Send /help.`;
      }
      return null;
  }
}

// ─── Drive read helpers (token-only, no session) ───────────────────────────

async function withDriveAccess<T>(
  ctx: { sub: string; rt: string },
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const refreshed = await refreshGoogleAccessToken(ctx.rt);
  return fn(refreshed.accessToken);
}

async function loadAcceptedPlan(
  accessToken: string,
  sub: string,
  weekId: string,
): Promise<MealPlan | null> {
  const layout = await ensureAtomicTrackerLayout(accessToken, {
    googleSub: sub,
    appVersion: APP_VERSION,
  });
  const mealsFolderId = layout.folderIds["history/meals"];
  if (!mealsFolderId) return null;
  const fileId = await findFile(accessToken, `${weekId}.json`, mealsFolderId);
  if (!fileId) return null;
  return await readJson<MealPlan>(accessToken, fileId).catch(() => null);
}

// ─── /status ───────────────────────────────────────────────────────────────

async function statusCommand(ctx: {
  sub: string;
  rt: string;
}): Promise<string> {
  try {
    return await withDriveAccess(ctx, async (accessToken) => {
      const currentId = isoWeekId(currentWeekStart());
      const nextId = isoWeekId(nextWeekStart());
      const [current, next] = await Promise.all([
        loadAcceptedPlan(accessToken, ctx.sub, currentId),
        loadAcceptedPlan(accessToken, ctx.sub, nextId),
      ]);

      const lines: string[] = [];
      lines.push(`📅 ${currentId} (this week)`);
      if (current) {
        lines.push(formatPlanSummary(current));
      } else {
        lines.push("  no accepted plan");
      }
      lines.push("");
      lines.push(`📅 ${nextId} (next week)`);
      if (next) {
        lines.push(formatPlanSummary(next));
      } else {
        lines.push("  no accepted plan");
      }
      lines.push("");
      lines.push(`Open: ${APP_BASE}/trackers/meal-planner`);
      return lines.join("\n");
    });
  } catch (e) {
    return `Couldn't read your plan: ${shortErr(e)}`;
  }
}

// ─── /today ───────────────────────────────────────────────────────────────

async function todayCommand(ctx: {
  sub: string;
  rt: string;
}): Promise<string> {
  try {
    return await withDriveAccess(ctx, async (accessToken) => {
      const today = new Date();
      const day = DAYS[(today.getUTCDay() + 6) % 7]!; // Mon=0..Sun=6
      const weekId = isoWeekId(currentWeekStart(today));
      const plan = await loadAcceptedPlan(accessToken, ctx.sub, weekId);
      if (!plan) {
        return `No accepted plan for this week. Open ${APP_BASE}/trackers/meal-planner to set one up.`;
      }
      const todayMeals = plan.meals.filter((m) => m.day === day);
      if (todayMeals.length === 0) {
        return `Nothing planned for ${day} this week (cheat day or empty).`;
      }
      const lines = [`🍽 ${day} (${plan.weekId})`, ""];
      for (const m of todayMeals) {
        const slot = (m as { slot?: string }).slot ?? "dinner";
        lines.push(`• ${slot}: ${m.name} — ${m.calories} kcal`);
      }
      return lines.join("\n");
    });
  } catch (e) {
    return `Couldn't read today: ${shortErr(e)}`;
  }
}

// ─── /grocery ─────────────────────────────────────────────────────────────

async function groceryCommand(ctx: {
  sub: string;
  rt: string;
}): Promise<string> {
  try {
    return await withDriveAccess(ctx, async (accessToken) => {
      const layout = await ensureAtomicTrackerLayout(accessToken, {
        googleSub: ctx.sub,
        appVersion: APP_VERSION,
      });
      const groceryFolderId = layout.folderIds["grocery"];
      if (!groceryFolderId) {
        return "Grocery folder not bootstrapped yet — open the app once.";
      }
      // Try this week's accepted week first, fall back to next
      const candidates = [
        isoWeekId(currentWeekStart()),
        isoWeekId(nextWeekStart()),
      ];
      for (const weekId of candidates) {
        const fileId = await findFile(
          accessToken,
          `${weekId}-list.json`,
          groceryFolderId,
        );
        if (!fileId) continue;
        const data = await readJson<{
          rows?: Array<{ item: string; qty: string; unit: string }>;
        }>(accessToken, fileId).catch(() => null);
        if (!data?.rows) continue;
        const rows = data.rows.slice(0, 25);
        const lines = [`🛒 Grocery for ${weekId}`, ""];
        for (const r of rows) {
          lines.push(`• ${r.qty} ${r.unit} ${r.item}`.trim());
        }
        if (data.rows.length > rows.length) {
          lines.push("", `…and ${data.rows.length - rows.length} more.`);
        }
        lines.push("", `Full CSV: ${APP_BASE}/trackers/meal-planner`);
        return lines.join("\n");
      }
      return "No grocery list saved yet. Accept a plan first.";
    });
  } catch (e) {
    return `Couldn't read grocery list: ${shortErr(e)}`;
  }
}

// ─── /plan deep-link ──────────────────────────────────────────────────────

function planLinkCommand(): string {
  return [
    "Generating plans needs your encryption passphrase, which only lives in your browser.",
    "",
    `Open ${APP_BASE}/trackers/meal-planner — your saved AI key will decrypt locally and the planner will run.`,
  ].join("\n");
}

// ─── helpers ──────────────────────────────────────────────────────────────

function formatPlanSummary(plan: MealPlan): string {
  const dayMap = new Map<Day, string[]>();
  for (const m of plan.meals) {
    const arr = dayMap.get(m.day) ?? [];
    arr.push(m.name);
    dayMap.set(m.day, arr);
  }
  const lines: string[] = [];
  for (const day of DAYS) {
    const meals = dayMap.get(day);
    if (!meals || meals.length === 0) {
      lines.push(`  ${day}: —`);
    } else {
      lines.push(`  ${day}: ${meals.join(", ")}`);
    }
  }
  return lines.join("\n");
}

function shortErr(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

/** Telegram also pings webhooks on GET sometimes — return 200 with help. */
export async function GET() {
  return NextResponse.json({ ok: true, info: "AtomicTracker webhook endpoint" });
}
