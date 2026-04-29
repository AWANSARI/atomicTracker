import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureAtomicTrackerLayout, upsertJson } from "@/lib/google/drive";
import type { MealPlan } from "@/lib/tracker/meal-planner-plan";

export const maxDuration = 60;

const APP_VERSION = "0.1.0";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { weekId?: string; plan?: MealPlan };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { weekId, plan } = body;
  if (!weekId || typeof weekId !== "string") {
    return NextResponse.json({ error: "Missing weekId" }, { status: 400 });
  }
  if (!plan || typeof plan !== "object") {
    return NextResponse.json({ error: "Missing plan" }, { status: 400 });
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

  // Write to accepted file or draft file depending on status
  const filename =
    plan.status === "accepted" ? `${weekId}.json` : `${weekId}.draft.json`;

  try {
    await upsertJson(session.accessToken, mealsFolderId, filename, plan);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Drive write failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
