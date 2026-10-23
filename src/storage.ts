import { autoTags } from './library/organize.js';
import { componentReadiness, componentSignature } from './component-workflow.js';
import { themes, type ComponentItem, type Theme } from './model';

export type SyncState = {
  state: 'synced' | 'saving' | 'offline' | 'conflict' | 'browser-only';
  revision: number;
  savedAt?: string | null;
  message?: string;
};
type Index = {
  version: number;
  revision: number;
  savedAt?: string | null;
  theme: Theme;
  items: ComponentItem[];
};
type Operation = {
  key: string;
  order?: number;
  id?: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
};
let index: Index | null = null;
let database: IDBDatabase | null = null;
let running = false;
let operationOrder = 0;
let status: SyncState = { state: 'browser-only', revision: 0 };
const pending = new Map<string, Operation>();
const listeners = new Set<(state: SyncState) => void>();
const watchers = new Set<(workspace: string) => void>();
const details = new Map<string, ComponentItem>();
let detailBytes = 0;
let polling: ReturnType<typeof setInterval> | undefined;

function setStatus(next: SyncState) {
  status = next;
  listeners.forEach((fn) => fn(next));
}
export const syncStatus = () => status;
export function onSyncStatus(fn: (state: SyncState) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Resolve only after the queued Library writes receive a disk acknowledgement. */
export function waitForLibrarySave(): Promise<void> {
  if (!pending.size) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        finish(
          new Error('The capture is queued in this browser. Check Library sync before closing.'),
        ),
      35000,
    );
    const unsubscribe = onSyncStatus((next) => {
      if (next.state === 'synced' && !pending.size) finish();
      else if (['offline', 'conflict', 'browser-only'].includes(next.state))
        finish(
          new Error(
            'The capture is kept in this browser. Open Library to retry syncing or recover a conflict.',
          ),
        );
    });
    function finish(error?: Error) {
      clearTimeout(timer);
      unsubscribe();
      if (error) reject(error);
      else resolve();
    }
  });
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'Library request failed.'), {
      status: response.status,
    });
  return data;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('reframe', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function local<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  if (!database) return Promise.reject(new Error('Browser cache is unavailable.'));
  return new Promise((resolve, reject) => {
    const tx = database!.transaction('kv', mode),
      request = run(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || request.error);
  });
}
function workspace() {
  return JSON.stringify({ version: 1, items: index?.items || [], theme: index?.theme });
}
function announce() {
  watchers.forEach((fn) => fn(workspace()));
}
async function cacheIndex() {
  if (index) await local('readwrite', (s) => s.put(index, 'library-index-v2')).catch(() => {});
}
export function summary(item: ComponentItem): ComponentItem {
  if (item._summary) return item;
  return {
    id: item.id,
    name: item.name,
    html: '',
    source: item.source,
    kind: item.kind,
    capturedAt: item.capturedAt,
    evidence: item.evidence.slice(0, 1200),
    tags: item.tags,
    collections: item.collections,
    libraryId: item.libraryId,
    fidelity: item.fidelity,
    itemRevision: item.itemRevision || 0,
    contentHash: item.contentHash,
    _summary: true,
    signature: componentSignature(item, item.theme),
    automatic: autoTags(item),
    readiness: componentReadiness(item),
    hasFeature: !!item.feature,
    featureId: item.feature?.spec.id,
    hasCode: !!item.feature?.spec.website?.pages[0]?.component,
    actionsCount: item.feature?.spec.actions.length || 0,
    externalService: !!item.feature?.spec.actions.some((a) => a.operation === 'external'),
    thumbnail: undefined,
    searchExcerpt: item.html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 1000),
  };
}
function cacheDetail(item: ComponentItem) {
  const old = details.get(item.id);
  if (old) detailBytes -= JSON.stringify(old).length;
  details.delete(item.id);
  details.set(item.id, item);
  detailBytes += JSON.stringify(item).length;
  while (details.size > 5 || detailBytes > 6_000_000) {
    const id = details.keys().next().value!;
    detailBytes -= JSON.stringify(details.get(id)).length;
    details.delete(id);
  }
}
export async function loadItem(item: ComponentItem): Promise<ComponentItem> {
  if (!item._summary) return item;
  const cached = details.get(item.id);
  if (cached && cached.itemRevision === item.itemRevision) return cached;
  const pendingItem = [...pending.values()]
    .reverse()
    .find((op) => op.id === item.id && op.body.item)?.body.item as ComponentItem | undefined;
  if (pendingItem) return pendingItem;
  try {
    const full = await api<ComponentItem>('/api/library/items/' + encodeURIComponent(item.id));
    cacheDetail(full);
    await local('readwrite', (s) => s.put(full, 'detail:' + full.id)).catch(() => {});
    // Disk is authoritative; retain at most five offline full-package copies.
    const keys = await local('readonly', (s) => s.getAllKeys()).catch(() => []);
    for (const key of keys.filter(
      (k) => String(k).startsWith('detail:') && !details.has(String(k).slice(7)),
    ))
      await local('readwrite', (s) => s.delete(key)).catch(() => {});
    return full;
  } catch (error) {
    const localItem = await local<ComponentItem | undefined>('readonly', (s) =>
      s.get('detail:' + item.id),
    ).catch(() => undefined);
    if (localItem && localItem.itemRevision === item.itemRevision) return localItem;
    throw error;
  }
}
export const materialize = (items: ComponentItem[]) => Promise.all(items.map(loadItem));

export async function hydrateWorkspace() {
  try {
    database = await open();
  } catch {
    database = null;
  }
  index =
    (await local<Index | undefined>('readonly', (s) => s.get('library-index-v2')).catch(
      () => undefined,
    )) || null;
  const keys = await local('readonly', (s) => s.getAllKeys()).catch(() => []);
  const queued: Operation[] = [];
  for (const key of keys.filter((k) => String(k).startsWith('operation:'))) {
    const operation = await local<Operation>('readonly', (s) => s.get(key));
    queued.push(operation);
  }
  for (const operation of queued.sort((a, b) => (a.order || 0) - (b.order || 0))) {
    pending.set(operation.key, operation);
    operationOrder = Math.max(operationOrder, operation.order || 0);
  }
  try {
    const server = await api<Index>('/api/library/index');
    if (!server.revision && !pending.size) {
      let legacy = await local<string | undefined>('readonly', (s) =>
        s.get('reframe-workspace'),
      ).catch(() => undefined);
      if (!legacy)
        try {
          legacy = localStorage.getItem('reframe-workspace') || undefined;
        } catch {
          /* The server remains available. */
        }
      if (legacy) {
        const fonts: Record<string, string> = {};
        for (const [, hash] of legacy.matchAll(/reframe-font:([a-f0-9]{64})/g)) {
          const font = await local<string | undefined>('readonly', (s) =>
            s.get('font:' + hash),
          ).catch(() => undefined);
          if (font) fonts[hash] = font;
        }
        await api('/api/library', {
          method: 'PUT',
          body: JSON.stringify({ baseRevision: 0, workspace: legacy, fonts }),
        });
        index = await api<Index>('/api/library/index');
      } else index = server;
    } else index = server;
    // Offline edits remain separate records and are replayed against their original item revision.
    if (!index!.theme) index!.theme = themes[0];
    for (const op of pending.values()) applyOptimistic(op);
    await cacheIndex();
    setStatus({ state: 'synced', revision: index!.revision, savedAt: index!.savedAt });
    void flush();
  } catch (error) {
    setStatus({
      state: 'offline',
      revision: index?.revision || 0,
      message: (error as Error).message,
    });
  }
  if (!polling) {
    polling = setInterval(() => {
      if (pending.size) void flush();
      else void refresh();
    }, 4000);
    window.addEventListener('focus', () => void refresh());
  }
}
export function readWorkspace() {
  return index ? workspace() : null;
}
function applyOptimistic(op: Operation) {
  if (!index) return;
  if (op.path === '/api/library/settings') index.theme = op.body.theme as Theme;
  else if (op.method === 'DELETE') index.items = index.items.filter((i) => i.id !== op.id);
  else if (op.body.item)
    index.items = [
      summary(op.body.item as ComponentItem),
      ...index.items.filter((i) => i.id !== op.id),
    ];
  else if (op.body.metadata)
    index.items = index.items.map((i) =>
      i.id === op.id ? { ...i, ...(op.body.metadata as object) } : i,
    );
}
function enqueue(op: Operation) {
  op.order = operationOrder = Math.max(Date.now(), operationOrder + 1);
  pending.set(op.key, op);
  setStatus({ state: 'saving', revision: index?.revision || 0 });
  void local('readwrite', (s) => s.put(op, 'operation:' + op.key)).then(
    () => flush(),
    () => flush(),
  );
}
async function flush() {
  if (running || !pending.size) return;
  running = true;
  const conflicts: string[] = [];
  try {
    for (const op of [...pending.values()]) {
      if (conflicts.includes(op.id || 'settings')) continue;
      setStatus({ state: 'saving', revision: index?.revision || 0 });
      try {
        const result = await api<ComponentItem & { revision: number; savedAt: string }>(op.path, {
          method: op.method,
          body: JSON.stringify(op.body),
        });
        pending.delete(op.key);
        await local('readwrite', (s) => s.delete('operation:' + op.key)).catch(() => {});
        if (index) {
          index.revision = result.revision;
          index.savedAt = result.savedAt;
          if (op.method !== 'DELETE' && op.id && result._summary) {
            const remaining = [...pending.values()].filter((next) => next.id === op.id);
            index.items = [
              result,
              ...index.items.filter((i) => i.id !== op.id && i.id !== result.id),
            ];
            for (const next of remaining) {
              next.body.baseRevision = result.itemRevision;
              applyOptimistic(next);
              await local('readwrite', (s) => s.put(next, 'operation:' + next.key)).catch(() => {});
            }
          }
        }
      } catch (error) {
        const e = error as { status?: number; message: string };
        if (e.status === 409) {
          conflicts.push(op.id || 'settings');
          setStatus({ state: 'conflict', revision: index?.revision || 0, message: e.message });
        } else {
          setStatus({ state: 'offline', revision: index?.revision || 0, message: e.message });
          break;
        }
      }
    }
    if (!pending.size) {
      await refresh(true);
      setStatus({ state: 'synced', revision: index?.revision || 0, savedAt: index?.savedAt });
    } else if (conflicts.length)
      setStatus({
        state: 'conflict',
        revision: index?.revision || 0,
        message:
          'An item changed elsewhere. Your edits remain in this browser. Download a backup or save a conflicting item as a copy.',
      });
    await cacheIndex();
    announce();
  } finally {
    running = false;
  }
}
async function refresh(force = false) {
  if (!force && (running || pending.size)) return;
  try {
    const latest = await api<{ revision: number }>('/api/library/revision');
    if (!force && latest.revision === index?.revision) return;
    const next = await api<Index>('/api/library/index');
    if (!force && (running || pending.size)) return;
    if (!next.theme) next.theme = themes[0];
    index = next;
    await cacheIndex();
    announce();
    setStatus({ state: 'synced', revision: next.revision, savedAt: next.savedAt });
  } catch {
    /* Pending operations and the current view are retained. */
  }
}
/** Compatibility entry point: diff small summaries into individual mutations, never a whole-library upload. */
export function writeWorkspace(value: string) {
  if (!database && status.state === 'offline')
    throw new Error('Storage is unavailable; keep this window open and download a backup.');
  const state = JSON.parse(value) as { items: ComponentItem[]; theme: Theme };
  if (!index) index = { version: 2, revision: 0, theme: state.theme, items: [] };
  const before = new Map(index.items.map((i) => [i.id, i]));
  const operation = (item: ComponentItem, method: string, body: Record<string, unknown>) => {
    const key = crypto.randomUUID();
    enqueue({
      key,
      id: item.id,
      method,
      path: '/api/library/items/' + encodeURIComponent(item.id),
      body: { ...body, baseRevision: before.get(item.id)?.itemRevision || 0, operationId: key },
    });
  };
  for (const item of state.items) {
    const old = before.get(item.id);
    if (item === old || JSON.stringify(item) === JSON.stringify(old)) continue;
    if (item._summary && old) {
      const metadata: Record<string, unknown> = {};
      for (const key of ['name', 'tags', 'collections', 'theme'] as const)
        if (JSON.stringify(item[key]) !== JSON.stringify(old[key])) metadata[key] = item[key];
      if (Object.keys(metadata).length) operation(item, 'PATCH', { metadata });
    } else operation(item, 'PUT', { item });
  }
  const nextIds = new Set(state.items.map((i) => i.id));
  for (const old of before.values()) if (!nextIds.has(old.id)) operation(old, 'DELETE', {});
  if (JSON.stringify(index.theme) !== JSON.stringify(state.theme)) {
    const key = crypto.randomUUID();
    enqueue({
      key,
      method: 'PATCH',
      path: '/api/library/settings',
      body: { theme: state.theme, baseRevision: index.revision },
    });
  }
  index = { ...index, items: state.items.map(summary), theme: state.theme };
  void cacheIndex();
}
export function onLibraryChange(fn: (workspace: string) => void) {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}
export type LibraryVersion = {
  id: string;
  reason: string;
  revision: number | null;
  savedAt: string;
  items: number;
};
export const listVersions = () => api<LibraryVersion[]>('/api/library/history');
export async function restoreVersion(id: string) {
  if (pending.size) throw new Error('Save or back up pending edits before restoring a version.');
  await api('/api/library/restore', {
    method: 'POST',
    body: JSON.stringify({ id, baseRevision: index?.revision || 0 }),
  });
  await refresh(true);
  location.reload();
}

export function saveCaptured(item: ComponentItem, theme: Theme) {
  const key = crypto.randomUUID();
  enqueue({
    key,
    id: item.id,
    method: 'POST',
    path: '/api/library/captures',
    body: { item, theme },
  });
  if (index) {
    index.items = [summary(item), ...index.items.filter((i) => i.id !== item.id)];
    void cacheIndex();
  }
}

/** Keep local edits as new packages; the competing server revisions remain untouched. */
export async function recoverPendingCopies() {
  while (running) await new Promise((resolve) => setTimeout(resolve, 50));
  const operations = [...pending.values()];
  if (operations.some((op) => op.method === 'DELETE' || op.path === '/api/library/settings'))
    throw new Error('Back up pending edits before resolving deletion or settings conflicts.');
  const copies: Operation[] = [];
  for (const id of new Set(operations.map((op) => op.id).filter(Boolean))) {
    const edits = operations.filter((op) => op.id === id),
      candidate = [...edits].reverse().find((op) => op.body.item)?.body.item as
        ComponentItem | undefined;
    let full =
      candidate || (await api<ComponentItem>('/api/library/items/' + encodeURIComponent(id!)));
    for (const edit of edits)
      if (edit.body.metadata) full = { ...full, ...(edit.body.metadata as object) };
    const copy = {
      ...full,
      id: crypto.randomUUID(),
      name: full.name + ' (local copy)',
      itemRevision: 0,
      contentHash: undefined,
    };
    const key = crypto.randomUUID();
    copies.push({
      key,
      id: copy.id,
      method: 'PUT',
      path: '/api/library/items/' + copy.id,
      body: { item: copy, baseRevision: 0, operationId: key },
    });
  }
  await local('readwrite', (store) => {
    for (const op of operations) store.delete('operation:' + op.key);
    for (const op of copies) store.put(op, 'operation:' + op.key);
    return store.getAllKeys();
  });
  for (const op of operations) pending.delete(op.key);
  for (const op of copies) pending.set(op.key, op);
  index = await api<Index>('/api/library/index');
  for (const op of copies) {
    pending.set(op.key, op);
    applyOptimistic(op);
  }
  await cacheIndex();
  announce();
  await flush();
}
export function pendingBackup() {
  return JSON.stringify(
    { version: 1, kind: 'reframe-pending-edits', operations: [...pending.values()] },
    null,
    2,
  );
}
