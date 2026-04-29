import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  ensureFolder,
  uploadBinary,
} from "@/lib/google/drive";

/**
 * Per-dish photo upload endpoint for the prep check-in flow.
 *
 * Accepts a multipart form: { weekId, day, slot, file } where slot is
 * "breakfast" | "lunch" | "dinner". The image lands in
 *   /AtomicTracker/history/photos/{weekId}/{day}-{slot}-{ts}.{ext}
 * and we return the Drive fileId + webViewLink so the client can stash it
 * on the prep submission, which then goes into the Calendar description.
 */

export const maxDuration = 60;
const APP_VERSION = "0.1.0";

const VALID_SLOTS = new Set(["breakfast", "lunch", "dinner"]);
const VALID_DAYS = new Set([
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
]);

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — phone-camera-friendly

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const weekId = String(form.get("weekId") ?? "");
  const day = String(form.get("day") ?? "");
  const slot = String(form.get("slot") ?? "");
  const file = form.get("file");

  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    return NextResponse.json({ error: "Invalid weekId" }, { status: 400 });
  }
  if (!VALID_DAYS.has(day)) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }
  if (!VALID_SLOTS.has(slot)) {
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` },
      { status: 413 },
    );
  }

  const mime = file.type || "image/jpeg";
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${mime}` },
      { status: 415 },
    );
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });
  const photosRoot = layout.folderIds["history/photos"];
  if (!photosRoot) {
    return NextResponse.json(
      { error: "Drive folder /history/photos missing — re-bootstrap" },
      { status: 500 },
    );
  }
  const weekFolderId = await ensureFolder(
    session.accessToken,
    weekId,
    photosRoot,
  );

  const ext =
    mime === "image/png"
      ? "png"
      : mime === "image/webp"
        ? "webp"
        : mime === "image/heic" || mime === "image/heif"
          ? "heic"
          : "jpg";
  const ts = Date.now();
  const filename = `${day}-${slot}-${ts}.${ext}`;

  const buf = await file.arrayBuffer();
  let result: { id: string; webViewLink: string };
  try {
    result = await uploadBinary(
      session.accessToken,
      weekFolderId,
      filename,
      buf,
      mime,
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    fileId: result.id,
    viewUrl: result.webViewLink,
    name: filename,
  });
}
