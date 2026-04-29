import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  listFolderChildren,
  readJson,
  findFile,
  uploadBinary,
} from "@/lib/google/drive";
import { type MealPlan } from "@/lib/tracker/meal-planner-plan";
import { buildYearlyArchiveXlsx } from "@/lib/tracker/xlsx-archive";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

  // List all files in history/meals, filter to accepted plans for the given year.
  // Accepted plans match /^\d{4}-W\d{2}\.json$/ (no ".draft.json" suffix).
  const children = await listFolderChildren(session.accessToken, mealsFolderId);
  const accepted = children.filter((c) => /^\d{4}-W\d{2}\.json$/.test(c.name));

  // Read each file; keep plans whose weekStart falls in the requested year.
  const plans: MealPlan[] = [];
  const yearStr = String(year);
  for (const file of accepted) {
    let plan: MealPlan;
    try {
      plan = await readJson<MealPlan>(session.accessToken, file.id);
    } catch {
      // Skip unreadable or malformed files
      continue;
    }
    if (
      plan.status === "accepted" &&
      typeof plan.weekId === "string" &&
      plan.weekId.startsWith(yearStr)
    ) {
      plans.push(plan);
    }
  }

  if (plans.length === 0) {
    return NextResponse.json(
      { ok: false, reason: "no_plans", year },
      { status: 404 },
    );
  }

  // Build the XLSX workbook.
  let xlsxBytes: Uint8Array;
  try {
    xlsxBytes = await buildYearlyArchiveXlsx(plans);
  } catch (e) {
    return NextResponse.json(
      { error: `XLSX generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  // Upload (or overwrite) the archive file in Drive.
  const archiveName = `${year}.xlsx`;
  let driveFileId: string;
  let webViewLink: string;

  try {
    const existingFileId = await findFile(
      session.accessToken,
      archiveName,
      archiveFolderId,
    );

    if (existingFileId) {
      // Overwrite existing file using updateFile (PATCH media endpoint).
      // updateFile accepts string, but we need to send binary. Use the raw bytes
      // directly via a separate fetch call to the upload endpoint.
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&fields=id,webViewLink`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": XLSX_MIME,
          },
          body: xlsxBytes,
        },
      );
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Drive update failed (${res.status}): ${errBody}`);
      }
      const data = (await res.json()) as { id?: string; webViewLink?: string };
      driveFileId = data.id ?? existingFileId;
      webViewLink =
        data.webViewLink ??
        `https://drive.google.com/file/d/${driveFileId}/view`;
    } else {
      const result = await uploadBinary(
        session.accessToken,
        archiveFolderId,
        archiveName,
        xlsxBytes,
        XLSX_MIME,
      );
      driveFileId = result.id;
      webViewLink = result.webViewLink;
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Drive upload failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    year,
    planCount: plans.length,
    driveFileId,
    webViewLink,
    // Note: to auto-generate this archive on first accept of a new year,
    // call POST /api/archive with { year: previousYear } from the accept flow.
  });
}
