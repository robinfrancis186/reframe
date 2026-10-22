// The clipboard workspace lives in IndexedDB: captured components embed fonts, styles and reference images, so a
// localStorage quota (~5 MB) fills after a few dozen captures. Reads stay synchronous through a cache hydrated before
// the app renders; writes are serialized so the latest workspace always wins.
const KEY = "reframe-workspace";
let cached: string | null = null;
let database: IDBDatabase | null = null;
let pending: string | null = null;
let writing = false;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("reframe", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = database!.transaction("kv", mode), request = run(tx.objectStore("kv"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || request.error);
  });
}

export async function hydrateWorkspace() {
  try {
    database = await open();
    const stored = await transaction<string | undefined>("readonly", store => store.get(KEY));
    if (typeof stored === "string") cached = stored;
    else {
      // One-time migration from the earlier localStorage workspace; the old copy is removed only after a durable write.
      const legacy = localStorage.getItem(KEY);
      if (legacy !== null) {
        await transaction("readwrite", store => store.put(legacy, KEY));
        cached = legacy;
        localStorage.removeItem(KEY);
      }
    }
  } catch {
    // IndexedDB can be unavailable (some private windows); fall back to localStorage.
    database = null;
    try { cached = localStorage.getItem(KEY); } catch { cached = null; }
  }
}

export function readWorkspace() {
  return cached;
}

async function flush() {
  if (writing) return;
  writing = true;
  try {
    while (pending !== null) {
      const value = pending;
      pending = null;
      await transaction("readwrite", store => store.put(value, KEY));
    }
  } catch (error) {
    window.dispatchEvent(new CustomEvent("reframe-storage-error", { detail: "Your clipboard could not be saved to browser storage. Download a backup before making more changes. " + ((error as Error)?.message || "") }));
  } finally {
    writing = false;
  }
}

/** Throws synchronously only on the localStorage fallback path, where quota errors are immediate. */
export function writeWorkspace(value: string) {
  if (!database) {
    localStorage.setItem(KEY, value);
    cached = value;
    return;
  }
  cached = value;
  pending = value;
  void flush();
}
