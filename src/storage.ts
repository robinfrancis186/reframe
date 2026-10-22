// The clipboard library is saved to disk by the local server (.reframe/library), so captures survive cleared browser
// data and are shared by every browser on this machine. IndexedDB keeps a local cache, so the app still opens and
// edits are kept if the server is unreachable; those edits sync on the next save. Reads stay synchronous through a
// cache hydrated before the app renders; writes are serialized so the latest workspace always wins.
// Embedded font files are stored once under their SHA-256 and referenced as "reframe-font:<hash>", both in the
// browser cache and on disk, so components captured from the same site share a single copy.
const KEY = "reframe-workspace", SYNC = "reframe-sync";
const FONT = /data:font\/(?:woff2|woff|ttf);base64,[A-Za-z0-9+/=]+/g, FONT_REF = /reframe-font:([a-f0-9]{64})/g;
export type SyncState = { state: "synced" | "saving" | "offline" | "conflict" | "browser-only"; revision: number; savedAt?: string | null; message?: string };
let cached: string | null = null;
let database: IDBDatabase | null = null;
let pending: string | null = null;
let writing = false;
let revision = 0;
let serverFonts = new Set<string>();
let status: SyncState = { state: "browser-only", revision: 0 };
const listeners = new Set<(state: SyncState) => void>();
const hashes = new Map<string, string>();

function setStatus(next: SyncState) { status = next; listeners.forEach(listener => listener(status)); }
export const syncStatus = () => status;
export function onSyncStatus(listener: (state: SyncState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

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
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init ? { ...init, headers: { "Content-Type": "application/json" } } : undefined);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Library request failed."), { status: response.status, data });
  return data;
}
async function sha256(text: string) {
  let hash = hashes.get(text);
  if (!hash) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    hashes.set(text, hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""));
  }
  return hash;
}
/** Replaces embedded fonts with references; returns the compact workspace and the fonts by hash. */
async function compact(value: string) {
  const fonts = new Map<string, string>();
  for (const font of new Set(value.match(FONT) || [])) fonts.set(await sha256(font), font);
  const byFont = new Map([...fonts].map(([hash, font]) => [font, hash]));
  for (const font of hashes.keys()) if (!byFont.has(font)) hashes.delete(font);
  return { workspace: value.replace(FONT, font => "reframe-font:" + byFont.get(font)), fonts };
}
// A missing font leaves its reference in place; the browser falls back instead of the workspace failing to load.
const inflate = (value: string, fonts: Record<string, string>) => value.replace(FONT_REF, (ref, hash) => fonts[hash] || ref);
async function localFonts(value: string) {
  const fonts: Record<string, string> = {};
  for (const hash of new Set([...value.matchAll(FONT_REF)].map(m => m[1]))) {
    const font = await transaction<string | undefined>("readonly", store => store.get("font:" + hash));
    if (typeof font === "string") fonts[hash] = font;
  }
  return fonts;
}

/** Saves the browser cache: compact workspace, each font once, and whether disk has caught up. */
async function cacheLocally(workspace: string, fonts: Map<string, string>, dirty: boolean) {
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const tx = database!.transaction("kv", "readwrite"), store = tx.objectStore("kv"), keep = new Map([...fonts].map(([hash, font]) => ["font:" + hash, font]));
    store.put(workspace, KEY);
    store.put({ revision, dirty }, SYNC);
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

async function upload(workspace: string, fonts: Map<string, string>) {
  const send = (all: boolean) => api<{ revision: number; savedAt: string; fonts: string[] }>("/api/library", { method: "PUT", body: JSON.stringify({ baseRevision: revision, workspace, fonts: Object.fromEntries([...fonts].filter(([hash]) => all || !serverFonts.has(hash))) }) });
  // 422 means the server lacks a font this browser assumed it had; resend them all once.
  const result = await send(false).catch(error => { if ((error as { status?: number }).status === 422) return send(true); throw error; });
  revision = result.revision; serverFonts = new Set(result.fonts);
  return result;
}

export async function hydrateWorkspace() {
  let local: string | null = null, localSync = { revision: 0, dirty: false };
  try {
    database = await open();
    const stored = await transaction<string | undefined>("readonly", store => store.get(KEY));
    const sync = await transaction<{ revision: number; dirty: boolean } | undefined>("readonly", store => store.get(SYNC));
    if (typeof stored === "string") { local = inflate(stored, await localFonts(stored)); localSync = sync || { revision: 0, dirty: true }; }
    else {
      // One-time migration from the earlier localStorage workspace; the old copy is removed only after a durable write.
      const legacy = localStorage.getItem(KEY);
      if (legacy !== null) {
        const { workspace, fonts } = await compact(legacy);
        await cacheLocally(workspace, fonts, true);
        local = legacy; localSync = { revision: 0, dirty: true };
        localStorage.removeItem(KEY);
      }
    }
  } catch {
    // IndexedDB can be unavailable (some private windows); fall back to localStorage.
    database = null;
    try { local = localStorage.getItem(KEY); } catch { local = null; }
  }
  let server: { revision: number; savedAt: string | null; workspace: string | null; fonts: Record<string, string> } | null = null;
  try { server = await api("/api/library"); } catch { server = null; }
  if (!server) {
    cached = local; revision = localSync.revision;
    setStatus({ state: "offline", revision, message: "The library is open from this browser. Changes save to disk when the Reframe server is reachable." });
    if (localSync.dirty) retryLater();
    return;
  }
  serverFonts = new Set(Object.keys(server.fonts));
  if (server.workspace === null || (local && localSync.dirty && localSync.revision === server.revision)) {
    // Disk is empty (first run), or this browser has edits made on top of the latest disk version: send them.
    cached = local; revision = server.revision;
    if (local) { pending = local; void flush(); } else setStatus({ state: "synced", revision, savedAt: server.savedAt });
    return;
  }
  if (local && localSync.dirty) {
    // Unsynced browser edits conflict with a newer disk version. Disk wins; the browser copy is kept as a version.
    try { const { workspace, fonts } = await compact(local); await api("/api/library/history", { method: "POST", body: JSON.stringify({ workspace, fonts: Object.fromEntries(fonts), reason: "browser copy" }) }); }
    catch { /* The disk version still loads; the browser copy remains in IndexedDB until the next save. */ }
  }
  revision = server.revision;
  cached = inflate(server.workspace, server.fonts);
  try { const { workspace, fonts } = await compact(cached); await cacheLocally(workspace, fonts, false); } catch { /* The cache is optional. */ }
  setStatus({ state: "synced", revision, savedAt: server.savedAt });
}

export function readWorkspace() {
  return cached;
}

let retry: ReturnType<typeof setTimeout> | undefined;
function retryLater() {
  if (retry) return;
  retry = setTimeout(() => { retry = undefined; if (status.state === "offline" && cached !== null && pending === null) { pending = cached; void flush(); } }, 30000);
}

async function flush() {
  if (writing) return;
  writing = true;
  try {
    while (pending !== null) {
      const value = pending;
      pending = null;
      const { workspace, fonts } = await compact(value);
      let cachedLocally = false;
      try { await cacheLocally(workspace, fonts, true); cachedLocally = !!database; }
      catch { /* Disk remains the durable copy; a failed browser cache is reported only if disk also fails. */ }
      if (status.state === "conflict") continue;
      setStatus({ ...status, state: "saving" });
      try {
        const result = await upload(workspace, fonts);
        if (cachedLocally) await transaction("readwrite", store => store.put({ revision, dirty: false }, SYNC)).catch(() => {});
        setStatus({ state: "synced", revision, savedAt: result.savedAt });
      } catch (error) {
        const failure = error as { status?: number; message: string };
        if (failure.status === 409) {
          setStatus({ state: "conflict", revision, message: failure.message });
          window.dispatchEvent(new CustomEvent("reframe-storage-error", { detail: failure.message + " Your latest change is kept in this browser and will be saved as a separate version." }));
        } else if (failure.status) {
          setStatus({ state: "offline", revision, message: failure.message });
          window.dispatchEvent(new CustomEvent("reframe-storage-error", { detail: "Your library could not be saved to disk: " + failure.message }));
        } else {
          setStatus({ state: "offline", revision, message: "The Reframe server is unreachable. Changes are kept in this browser and save to disk when it returns." });
          if (!cachedLocally) window.dispatchEvent(new CustomEvent("reframe-storage-error", { detail: "Your library could not be saved. Download a backup before making more changes." }));
          retryLater();
        }
      }
    }
  } finally {
    writing = false;
  }
}

/** Throws synchronously only when neither browser storage nor disk can take the change. */
export function writeWorkspace(value: string) {
  if (!database) {
    try { localStorage.setItem(KEY, value); } catch (error) { if (status.state !== "synced") throw error; }
  }
  cached = value;
  pending = value;
  void flush();
}

// Changes saved elsewhere (browser-extension captures, another tab) are picked up while this tab has no unsaved
// change of its own: a small revision check every few seconds, and at once when the tab is shown or focused again.
const watchers = new Set<(workspace: string) => void>();
let polling: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  if (writing || pending !== null || status.state !== "synced") return;
  try {
    const { revision: latest } = await api<{ revision: number }>("/api/library/revision");
    if (latest <= revision) return;
    const server = await api<{ revision: number; savedAt: string | null; workspace: string | null; fonts: Record<string, string> }>("/api/library");
    if (!server.workspace || server.revision <= revision || writing || pending !== null) return;
    revision = server.revision; serverFonts = new Set(Object.keys(server.fonts));
    cached = inflate(server.workspace, server.fonts);
    try { const { workspace, fonts } = await compact(cached); await cacheLocally(workspace, fonts, false); } catch { /* The cache is optional. */ }
    setStatus({ state: "synced", revision, savedAt: server.savedAt });
    watchers.forEach(watch => watch(cached!));
  } catch { /* The next check retries. */ }
}
export function onLibraryChange(listener: (workspace: string) => void) {
  watchers.add(listener);
  if (!polling) {
    polling = setInterval(() => void refresh(), 4000);
    window.addEventListener("focus", () => void refresh());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refresh(); });
  }
  return () => { watchers.delete(listener); };
}

export type LibraryVersion = { id: string; reason: string; revision: number | null; savedAt: string; items: number };
export const listVersions = () => api<LibraryVersion[]>("/api/library/history");
/** Makes a kept version current on disk (the current one is kept too), then reloads the app with it. */
export async function restoreVersion(id: string) {
  const result = await api<{ revision: number; savedAt: string; workspace: string; fonts: Record<string, string> }>("/api/library/restore", { method: "POST", body: JSON.stringify({ id, baseRevision: revision }) });
  revision = result.revision;
  const { workspace, fonts } = await compact(inflate(result.workspace, result.fonts));
  await cacheLocally(workspace, fonts, false).catch(() => {});
  location.reload();
}
