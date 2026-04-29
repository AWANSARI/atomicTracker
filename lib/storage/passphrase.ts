"use client";

/**
 * Browser-only IndexedDB wrapper for caching the user's encryption passphrase.
 *
 * The passphrase never leaves the browser. It's stored in IndexedDB so it
 * survives page reloads but stays scoped to this origin.
 *
 * Trade-off: if the user clears site data or switches devices, they re-enter
 * the passphrase. That's intentional — passphrase = something they know.
 */

const DB_NAME = "atomictracker";
const DB_VERSION = 1;
const STORE = "kv";
const PASSPHRASE_KEY = "passphrase";

/**
 * Window event fired whenever the passphrase changes (set or cleared).
 * Other Settings sections subscribe so they unlock/lock immediately
 * without a page reload — see `subscribePassphrase` below.
 */
export const PASSPHRASE_CHANGED_EVENT = "atomictracker:passphrase-changed";

function dispatchChange(): void {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(PASSPHRASE_CHANGED_EVENT));
    } catch {
      // Swallow — environment without CustomEvent support, save still succeeded.
    }
  }
}

/**
 * Subscribe to passphrase-changed events. Returns an unsubscribe function.
 * Safe to call from React useEffect — the listener is a no-op outside the browser.
 */
export function subscribePassphrase(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PASSPHRASE_CHANGED_EVENT, callback);
  return () => window.removeEventListener(PASSPHRASE_CHANGED_EVENT, callback);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function savePassphrase(passphrase: string): Promise<void> {
  await withStore<IDBValidKey>("readwrite", (s) => s.put(passphrase, PASSPHRASE_KEY));
  dispatchChange();
}

export async function loadPassphrase(): Promise<string | null> {
  const value = await withStore<unknown>("readonly", (s) => s.get(PASSPHRASE_KEY));
  return typeof value === "string" ? value : null;
}

export async function clearPassphrase(): Promise<void> {
  await withStore<undefined>("readwrite", (s) => s.delete(PASSPHRASE_KEY));
  dispatchChange();
}
