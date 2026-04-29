import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  findFile,
  readJson,
  upsertJson,
} from "@/lib/google/drive";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";

type LogFile = {
  date: string;
  taken: Record<string, string>;
};

/**
 * POST /api/supplements/log
 * Body: { date: "YYYY-MM-DD", supplementId: string, takenAt: "HH:MM" | ISO }
 *
 * Appends to /AtomicTracker/history/supplements/{date}.json. Last write wins
 * per supplementId so retaps just overwrite.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { date?: string; supplementId?: string; takenAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date : "";
  const supplementId = typeof body.supplementId === "string" ? body.supplementId : "";
  const takenAt = typeof body.takenAt === "string" && body.takenAt ? body.takenAt : new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !supplementId) {
    return NextResponse.json(
      { error: "date (YYYY-MM-DD) and supplementId are required" },
      { status: 400 },
    );
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const folderId = layout.folderIds["history/supplements"];
  if (!folderId) {
    return NextResponse.json(
      { error: "history/supplements folder missing" },
      { status: 500 },
    );
  }

  const fileName = `${date}.json`;
  const fileId = await findFile(session.accessToken, fileName, folderId);
  let existing: LogFile = { date, taken: {} };
  if (fileId) {
    try {
      const raw = await readJson<Partial<LogFile>>(session.accessToken, fileId);
      existing = {
        date: raw.date ?? date,
        taken: raw.taken ?? {},
      };
    } catch {
      // corrupt file — overwrite
    }
  }
  existing.taken[supplementId] = takenAt;

  await upsertJson(session.accessToken, folderId, fileName, existing);

  return NextResponse.json({ ok: true, date, supplementId, takenAt });
}
