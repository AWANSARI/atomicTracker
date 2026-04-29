import "server-only";

/**
 * Minimal Google Drive REST client.
 *
 * Why not the `googleapis` package? It's ~100MB+ and slows Vercel cold starts
 * by 1-2s. We only need a handful of endpoints, so we hit them directly.
 *
 * Scope: drive.file — we can only see/touch files this app created.
 * If the user manually deletes our folder/files outside the app, the next
 * call to ensureFolder() will silently re-create them.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const ROOT_NAME = "AtomicTracker";

/**
 * The complete subfolder layout. Order matters: parents before children.
 * Mirrors PLAN.md §4.
 */
const SUBFOLDERS = [
  "config",
  "history",
  "history/meals",
  "history/chats",
  "history/photos",
  "grocery",
  "archive",
  "exports",
  "logs",
] as const;

export type FolderMap = Record<string, string>;

export type AtomicTrackerLayout = {
  rootId: string;
  folderIds: FolderMap;
  bootstrappedAt: string;
  appVersion: string;
};

// ─── HTTP helpers ───────────────────────────────────────────────────────────

class DriveError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: string) {
    super(`Drive API ${status}: ${message}`);
  }
}

async function driveJson<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new DriveError(res.statusText, res.status, body);
  }
  return res.json() as Promise<T>;
}

function escapeQ(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ─── Folder operations ──────────────────────────────────────────────────────

export async function findFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string | null> {
  const q = [
    `name = '${escapeQ(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const data = await driveJson<{ files: { id?: string }[] }>(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&pageSize=1`,
  );
  return data.files[0]?.id ?? null;
}

export async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const data = await driveJson<{ id?: string }>(
    accessToken,
    "/files?fields=id",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : undefined,
      }),
    },
  );
  if (!data.id) throw new Error("Drive createFolder: empty id in response");
  return data.id;
}

export async function ensureFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const existing = await findFolder(accessToken, name, parentId);
  return existing ?? createFolder(accessToken, name, parentId);
}

// ─── File operations ────────────────────────────────────────────────────────

export async function findFile(
  accessToken: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  const q = [
    `name = '${escapeQ(name)}'`,
    `'${parentId}' in parents`,
    "trashed = false",
  ].join(" and ");
  const data = await driveJson<{ files: { id?: string }[] }>(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&pageSize=1`,
  );
  return data.files[0]?.id ?? null;
}

export async function readFileText(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new DriveError(res.statusText, res.status, body);
  }
  return res.text();
}

export async function readJson<T>(
  accessToken: string,
  fileId: string,
): Promise<T> {
  const text = await readFileText(accessToken, fileId);
  return JSON.parse(text) as T;
}

export async function uploadFile(
  accessToken: string,
  parentId: string,
  name: string,
  content: string,
  mimeType = "application/json",
): Promise<string> {
  const boundary = "atb_" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    metadata + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    content + `\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new DriveError(res.statusText, res.status, errBody);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Drive uploadFile: empty id");
  return data.id;
}

export async function updateFile(
  accessToken: string,
  fileId: string,
  content: string,
  mimeType = "application/json",
): Promise<void> {
  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
      },
      body: content,
    },
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new DriveError(res.statusText, res.status, errBody);
  }
}

export async function upsertJson(
  accessToken: string,
  parentId: string,
  name: string,
  data: unknown,
): Promise<string> {
  const content = JSON.stringify(data, null, 2);
  const existing = await findFile(accessToken, name, parentId);
  if (existing) {
    await updateFile(accessToken, existing, content);
    return existing;
  }
  return uploadFile(accessToken, parentId, name, content);
}

/** Upsert raw text/CSV content. Like upsertJson but with custom mime. */
export async function upsertText(
  accessToken: string,
  parentId: string,
  name: string,
  content: string,
  mimeType: string,
): Promise<string> {
  const existing = await findFile(accessToken, name, parentId);
  if (existing) {
    await updateFile(accessToken, existing, content, mimeType);
    return existing;
  }
  return uploadFile(accessToken, parentId, name, content, mimeType);
}

export type DriveChild = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
};

/** List all immediate children (files + subfolders) of a folder. */
export async function listFolderChildren(
  accessToken: string,
  folderId: string,
): Promise<DriveChild[]> {
  const q = [`'${folderId}' in parents`, "trashed = false"].join(" and ");
  const data = await driveJson<{ files: DriveChild[] }>(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size)&pageSize=1000&spaces=drive`,
  );
  return data.files;
}

/** Stream raw bytes of a file. Returns ArrayBuffer; safe for binary content. */
export async function readFileBytes(
  accessToken: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new DriveError(res.statusText, res.status, body);
  }
  return res.arrayBuffer();
}

/**
 * Upload binary content (e.g. an image taken on a phone). Returns the
 * file ID and a webViewLink the user can open. The caller is expected to
 * pass an already-decoded ArrayBuffer or Uint8Array.
 *
 * drive.file scope: we own this file because we created it; we can set
 * permissions on it later if we want to surface it in a calendar event.
 */
export async function uploadBinary(
  accessToken: string,
  parentId: string,
  name: string,
  bytes: ArrayBuffer | Uint8Array,
  mimeType: string,
): Promise<{ id: string; webViewLink: string; webContentLink?: string }> {
  const boundary = "atb_" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType });

  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      metadata +
      `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(head.length + buf.length + tail.length);
  body.set(head, 0);
  body.set(buf, head.length);
  body.set(tail, head.length + buf.length);

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink,webContentLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([body]),
    },
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new DriveError(res.statusText, res.status, errBody);
  }
  const data = (await res.json()) as {
    id?: string;
    webViewLink?: string;
    webContentLink?: string;
  };
  if (!data.id) throw new Error("Drive uploadBinary: empty id");
  return {
    id: data.id,
    webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
    webContentLink: data.webContentLink,
  };
}

/** Delete (trash) a file. Drive's drive.file scope allows trashing files we created. */
export async function deleteFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 204 = success, 404 = already gone (treat as success)
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new DriveError(res.statusText, res.status, body);
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

/**
 * Idempotently create the AtomicTracker folder structure.
 * Cheap to call repeatedly because each ensureFolder is a list-then-maybe-create.
 *
 * Performance note: in the worst case this is ~2 API calls per subfolder
 * (8 subfolders × 2 = 16 calls ≈ 1-2s). After bootstrap, user.json caches
 * the folder IDs so subsequent loads skip this.
 */
export async function bootstrapAtomicTrackerFolder(
  accessToken: string,
): Promise<{ rootId: string; folderIds: FolderMap }> {
  const rootId = await ensureFolder(accessToken, ROOT_NAME);

  const folderIds: FolderMap = { "": rootId };
  for (const path of SUBFOLDERS) {
    const parts = path.split("/");
    let parentId = rootId;
    let cumulative = "";
    for (const part of parts) {
      cumulative = cumulative ? `${cumulative}/${part}` : part;
      if (folderIds[cumulative]) {
        parentId = folderIds[cumulative]!;
        continue;
      }
      const id = await ensureFolder(accessToken, part, parentId);
      folderIds[cumulative] = id;
      parentId = id;
    }
  }
  return { rootId, folderIds };
}

/**
 * Read /AtomicTracker/config/user.json if it exists, else null.
 * Used as a fast-path on dashboard load to avoid re-bootstrapping.
 */
export async function readAtomicTrackerLayout(
  accessToken: string,
): Promise<AtomicTrackerLayout | null> {
  const rootId = await findFolder(accessToken, ROOT_NAME);
  if (!rootId) return null;
  const configId = await findFolder(accessToken, "config", rootId);
  if (!configId) return null;
  const userJsonId = await findFile(accessToken, "user.json", configId);
  if (!userJsonId) return null;
  try {
    return await readJson<AtomicTrackerLayout>(accessToken, userJsonId);
  } catch {
    return null;
  }
}

/**
 * Full bootstrap + persist user.json with folder IDs and version metadata.
 * Idempotent: safe to call repeatedly.
 */
export async function ensureAtomicTrackerLayout(
  accessToken: string,
  options: { googleSub: string; appVersion: string; tz?: string; locale?: string },
): Promise<AtomicTrackerLayout> {
  // Fast path: user.json already exists AND covers every folder we currently
  // ship. If the SUBFOLDERS list grew since the cache was written (e.g. a new
  // `history/photos` folder was added in a later commit), fall through to the
  // full bootstrap so existing users automatically get the new folder.
  const existing = await readAtomicTrackerLayout(accessToken);
  if (existing && existing.folderIds["config"]) {
    const allKnown = SUBFOLDERS.every((p) => existing.folderIds[p]);
    if (allKnown) return existing;
  }

  const { rootId, folderIds } = await bootstrapAtomicTrackerFolder(accessToken);
  const layout: AtomicTrackerLayout = {
    rootId,
    folderIds,
    bootstrappedAt: existing?.bootstrappedAt ?? new Date().toISOString(),
    appVersion: options.appVersion,
  };
  const persisted = {
    ...layout,
    googleSub: options.googleSub,
    tz: options.tz,
    locale: options.locale,
  };
  const configId = folderIds["config"];
  if (!configId) throw new Error("config folder missing after bootstrap");
  await upsertJson(accessToken, configId, "user.json", persisted);
  return layout;
}

export { DriveError, ROOT_NAME, SUBFOLDERS };
