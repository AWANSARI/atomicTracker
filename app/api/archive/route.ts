import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureAtomicTrackerLayout } from "@/lib/google/drive";
import { buildAndUploadYearlyArchive } from "@/lib/tracker/xlsx-archive";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { year?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const year = typeof body.year === "number" ? body.year : Number(body.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: "Missing or invalid year (expected integer e.g. 2025)" },
      { status: 400 },
    );
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });

  const mealsFolderId = layout.folderIds["history/meals"];
  const archiveFolderId = layout.folderIds["archive"];
  if (!mealsFolderId || !archiveFolderId) {
    return NextResponse.json(
      { error: "Drive folders missing — re-bootstrap from dashboard" },
      { status: 500 },
    );
  }

  let result;
  try {
    result = await buildAndUploadYearlyArchive(
      session.accessToken,
      year,
      mealsFolderId,
      archiveFolderId,
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: `Archive build/upload failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    );
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    year: result.year,
    planCount: result.planCount,
    fileId: result.driveFileId,
    driveFileId: result.driveFileId,
    webViewLink: result.webViewLink,
  });
}
