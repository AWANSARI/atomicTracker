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
}

export async function loadPassphrase(): Promise<string | null> {
  const value = await withStore<unknown>("readonly", (s) => s.get(PASSPHRASE_KEY));
  return typeof value === "string" ? value : null;
}

export async function clearPassphrase(): Promise<void> {
  await withStore<undefined>("readwrite", (s) => s.delete(PASSPHRASE_KEY));
}
