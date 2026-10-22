// The clipboard workspace lives in IndexedDB: captured components embed fonts, styles and reference images, so a
// localStorage quota (~5 MB) fills after a few dozen captures. Reads stay synchronous through a cache hydrated before
// the app renders; writes are serialized so the latest workspace always wins.
// Embedded font files are stored once under their SHA-256 ("font:<hash>") and referenced from the workspace, so
// components captured from the same site share a single copy.
const KEY = "reframe-workspace";
const FONT = /data:font\/(?:woff2|woff|ttf);base64,[A-Za-z0-9+/=]+/g, FONT_REF = /reframe-font:([a-f0-9]{64})/g;
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
    if (typeof stored === "string") cached = await inflate(stored);
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

async function inflate(value: string) {
  const hashes = [...new Set([...value.matchAll(FONT_REF)].map(m => m[1]))];
  const fonts = new Map<string, string>();
  for (const hash of hashes) {
    const font = await transaction<string | undefined>("readonly", store => store.get("font:" + hash));
    if (typeof font === "string") fonts.set(hash, font);
  }
  // A missing font leaves its reference in place; the browser falls back instead of the workspace failing to load.
  return value.replace(FONT_REF, (ref, hash) => fonts.get(hash) || ref);
}
const hashes = new Map<string, string>();
async function sha256(text: string) {
  let hash = hashes.get(text);
  if (!hash) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    hashes.set(text, hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""));
  }
  return hash;
}
async function save(value: string) {
  const fonts = new Map<string, string>();
  for (const font of new Set(value.match(FONT) || [])) fonts.set(font, await sha256(font));
  for (const font of hashes.keys()) if (!fonts.has(font)) hashes.delete(font);
  const compact = value.replace(FONT, font => "reframe-font:" + fonts.get(font));
  await new Promise<void>((resolve, reject) => {
    const tx = database!.transaction("kv", "readwrite"), store = tx.objectStore("kv"), keep = new Map([...fonts].map(([font, hash]) => ["font:" + hash, font]));
    store.put(compact, KEY);
    // Write only new font files, and drop fonts no saved component references any more.
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const existing = new Set(keys.result.filter((key): key is string => typeof key === "string" && key.startsWith("font:")));
      for (const [key, font] of keep) if (!existing.has(key)) store.put(font, key);
      for (const key of existing) if (!keep.has(key)) store.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
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
      await save(value);
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
