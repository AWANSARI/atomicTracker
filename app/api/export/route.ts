import { NextResponse } from "next/server";
import JSZip from "jszip";
import { auth } from "@/auth";
import {
  ensureAtomicTrackerLayout,
  listFolderChildren,
  readFileBytes,
} from "@/lib/google/drive";

export const maxDuration = 60;
const APP_VERSION = "0.1.0";

const FOLDER_MIME = "application/vnd.google-apps.folder";

async function addFolderToZip(
  accessToken: string,
  folderId: string,
  zipFolder: JSZip,
): Promise<{ files: number; bytes: number }> {
  const children = await listFolderChildren(accessToken, folderId);
  let files = 0;
  let bytes = 0;
  for (const child of children) {
    if (child.mimeType === FOLDER_MIME) {
      const sub = zipFolder.folder(child.name);
      if (!sub) continue;
      const stats = await addFolderToZip(accessToken, child.id, sub);
      files += stats.files;
      bytes += stats.bytes;
    } else {
      // Skip Google-native docs (export needed). For now, we only have
      // JSON + CSV files we created; mimes are application/json + text/csv.
      try {
        const buf = await readFileBytes(accessToken, child.id);
        zipFolder.file(child.name, buf);
        files += 1;
        bytes += buf.byteLength;
      } catch (e) {
        // Best-effort: skip unreadable files
        zipFolder.file(
          `${child.name}.error.txt`,
          `Could not read file: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
  return { files, bytes };
}

export async function GET() {
  const session = await auth();
  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const layout = await ensureAtomicTrackerLayout(session.accessToken, {
    googleSub: session.googleSub,
    appVersion: APP_VERSION,
  });

  const zip = new JSZip();
  const root = zip.folder("AtomicTracker");
  if (!root) {
    return NextResponse.json({ error: "Failed to create zip" }, { status: 500 });
  }

  // Skip /exports folder to avoid nesting prior exports inside the new one
  const children = await listFolderChildren(session.accessToken, layout.rootId);
  const stats = { files: 0, bytes: 0 };
  for (const child of children) {
    if (child.name === "exports") continue;
    if (child.mimeType === FOLDER_MIME) {
      const sub = root.folder(child.name);
      if (!sub) continue;
      const s = await addFolderToZip(session.accessToken, child.id, sub);
      stats.files += s.files;
      stats.bytes += s.bytes;
    } else {
      try {
        const buf = await readFileBytes(session.accessToken, child.id);
        root.file(child.name, buf);
        stats.files += 1;
        stats.bytes += buf.byteLength;
      } catch {
        // ignore
      }
    }
  }

  // Add a small README
  root.file(
    "EXPORT-README.txt",
    [
      `AtomicTracker data export`,
      `Generated: ${new Date().toISOString()}`,
      `User: ${session.user?.email ?? "(unknown)"}`,
      `Files: ${stats.files}`,
      `Bytes: ${stats.bytes}`,
      ``,
      `This zip mirrors your /AtomicTracker folder on Google Drive at the time`,
      `of export, excluding the /exports subfolder itself.`,
      ``,
      `Files are JSON (config, plans, prep state) and CSV (grocery lists).`,
      `Open them with any text editor, Sheets/Excel, or jq.`,
    ].join("\n"),
  );

  let buffer: Uint8Array;
  try {
    buffer = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename = `atomictracker-export-${date}.zip`;

  // Wrap in a Blob to satisfy the BodyInit type checker (TS5.7 tightened
  // Uint8Array<ArrayBufferLike> handling). The Response will stream it normally.
  const blob = new Blob([buffer.buffer as ArrayBuffer], { type: "application/zip" });

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "X-AtomicTracker-Files": String(stats.files),
    },
  });
}
