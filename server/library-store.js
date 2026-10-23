import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

// The clipboard library on disk, so captures survive cleared browser data and are shared by every browser on this
// machine. The workspace is the same compact JSON the browser caches: embedded fonts are replaced by
// "reframe-font:<sha256>" references and each font is stored once. Saves are revisioned: a save based on an older
// revision is rejected instead of overwriting changes made in another tab or browser. Previous versions are kept.
const FONT_REF = /reframe-font:([a-f0-9]{64})/g,
  HASH = /^[a-f0-9]{64}$/,
  FONT = /^data:font\/(?:woff2|woff|ttf);base64,[A-Za-z0-9+/=]+$/;
const MAX_WORKSPACE = 100_000_000,
  MAX_FONT = 2_000_000,
  HISTORY = 10;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const refs = (workspace) => new Set([...workspace.matchAll(FONT_REF)].map((m) => m[1]));

function inspect(workspace) {
  if (typeof workspace !== 'string' || workspace.length > MAX_WORKSPACE)
    throw fail('Library must be a JSON workspace under 100 MB.');
  let state;
  try {
    state = JSON.parse(workspace);
  } catch {
    throw fail('Library is not valid JSON.');
  }
  if (
    !state ||
    !Array.isArray(state.items) ||
    !state.items.every(
      (item) => item && typeof item.id === 'string' && typeof item.name === 'string',
    )
  )
    throw fail('Library must contain a list of components.');
  return state.items.length;
}

export class LibraryStore {
  constructor(store) {
    this.dir = path.join(store, 'library');
    this.fonts = path.join(this.dir, 'fonts');
    this.history = path.join(this.dir, 'history');
    this.queue = Promise.resolve();
  }
  // Writes run one at a time, so revision checks and font cleanup never interleave.
  serial(task) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }
  async atomic(file, content) {
    const temporary = `${file}.reframe-${randomUUID()}`;
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    }
  }
  async current() {
    try {
      return JSON.parse(await readFile(path.join(this.dir, 'workspace.json'), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return { revision: 0, savedAt: null, workspace: null };
      throw fail('The library file on disk could not be read. It has not been changed.', 500);
    }
  }
  async fontsFor(workspace) {
    const fonts = {};
    for (const hash of refs(workspace || ''))
      try {
        fonts[hash] = await readFile(path.join(this.fonts, hash), 'utf8');
      } catch {
        /* A missing font leaves its reference; previews fall back. */
      }
    return fonts;
  }
  async storedFonts() {
    try {
      return (await readdir(this.fonts)).filter((name) => HASH.test(name));
    } catch {
      return [];
    }
  }
  async read() {
    const current = await this.current();
    return { ...current, fonts: await this.fontsFor(current.workspace) };
  }
  async addFonts(fonts = {}) {
    if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts))
      throw fail('Invalid font list.');
    await mkdir(this.fonts, { recursive: true, mode: 0o700 });
    const stored = new Set(await this.storedFonts());
    for (const [hash, data] of Object.entries(fonts)) {
      if (
        !HASH.test(hash) ||
        typeof data !== 'string' ||
        data.length > MAX_FONT ||
        !FONT.test(data)
      )
        throw fail('Invalid embedded font.');
      if (createHash('sha256').update(data).digest('hex') !== hash)
        throw fail('Embedded font does not match its hash.');
      if (!stored.has(hash)) await this.atomic(path.join(this.fonts, hash), data);
    }
  }
  async requireFonts(workspace) {
    const stored = new Set(await this.storedFonts()),
      missing = [...refs(workspace)].filter((hash) => !stored.has(hash));
    if (missing.length)
      throw Object.assign(
        fail('Some fonts are missing on disk. Send them with the library.', 422),
        { missing },
      );
  }
  async snapshot(entry, reason) {
    if (!entry.workspace) return;
    await mkdir(this.history, { recursive: true, mode: 0o700 });
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    await this.atomic(
      path.join(this.history, id + '.json'),
      JSON.stringify({
        id,
        reason,
        revision: entry.revision,
        savedAt: entry.savedAt || new Date().toISOString(),
        items: inspect(entry.workspace),
        workspace: entry.workspace,
      }),
    );
    const files = (await readdir(this.history)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files.slice(0, Math.max(0, files.length - HISTORY)))
      await unlink(path.join(this.history, file));
  }
  async listHistory() {
    let files = [];
    try {
      files = (await readdir(this.history))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();
    } catch {}
    const list = [];
    for (const file of files) {
      try {
        const { id, reason, revision, savedAt, items } = JSON.parse(
          await readFile(path.join(this.history, file), 'utf8'),
        );
        list.push({ id, reason, revision, savedAt, items });
      } catch {}
    }
    return list;
  }
  // Fonts referenced by neither the current library nor a kept version are removed.
  async collect() {
    const keep = refs((await this.current()).workspace || '');
    let files = [];
    try {
      files = await readdir(this.history);
    } catch {}
    for (const file of files)
      if (file.endsWith('.json'))
        try {
          for (const hash of refs(await readFile(path.join(this.history, file), 'utf8')))
            keep.add(hash);
        } catch {}
    for (const hash of await this.storedFonts())
      if (!keep.has(hash)) await unlink(path.join(this.fonts, hash)).catch(() => {});
  }
  async commit(workspace, reason) {
    const previous = await this.current();
    await this.snapshot(previous, reason);
    const next = { revision: previous.revision + 1, savedAt: new Date().toISOString(), workspace };
    await this.atomic(path.join(this.dir, 'workspace.json'), JSON.stringify(next));
    // A small revision file lets open apps notice changes (e.g. extension captures) without reading the library.
    await this.atomic(
      path.join(this.dir, 'revision.json'),
      JSON.stringify({ revision: next.revision, savedAt: next.savedAt }),
    );
    await this.collect();
    return { revision: next.revision, savedAt: next.savedAt, fonts: await this.storedFonts() };
  }
  write({ baseRevision, workspace, fonts }) {
    return this.serial(async () => {
      inspect(workspace);
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      const current = await this.current();
      if (baseRevision !== current.revision)
        throw Object.assign(
          fail(
            'Your library changed in another tab or browser. Reload to see the latest version.',
            409,
          ),
          { revision: current.revision },
        );
      await this.addFonts(fonts);
      await this.requireFonts(workspace);
      return this.commit(workspace, 'save');
    });
  }
  async revision() {
    try {
      return JSON.parse(await readFile(path.join(this.dir, 'revision.json'), 'utf8'));
    } catch {
      const { revision, savedAt } = await this.current();
      return { revision, savedAt };
    }
  }
  /**
   * Adds one component on the server's side (browser extension captures), in the same compact form the app saves:
   * embedded fonts stored once by hash. A component with the same source and markup is replaced, not duplicated.
   */
  add(item, { theme }) {
    return this.serial(async () => {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      const current = await this.current(),
        state = current.workspace
          ? JSON.parse(current.workspace)
          : { version: 1, items: [], theme };
      const fonts = {};
      // Same reduction as the app's save: the replica's feature.json is recompiled from spec.website on install.
      const json = JSON.stringify({ ...item, theme: state.theme || theme }, function (key, value) {
        if (key === 'files' && this.spec?.website)
          return {
            ...value,
            'feature.json': JSON.stringify({
              ...this.spec,
              website: 'Recompiled from spec.website when installed.',
            }),
          };
        return value;
      }).replace(/data:font\/(?:woff2|woff|ttf);base64,[A-Za-z0-9+/=]+/g, (font) => {
        const hash = createHash('sha256').update(font).digest('hex');
        fonts[hash] = font;
        return 'reframe-font:' + hash;
      });
      const compact = JSON.parse(json);
      await this.addFonts(fonts);
      const existing = state.items.findIndex(
        (i) => i.source === compact.source && i.html === compact.html,
      );
      if (existing >= 0) compact.id = state.items[existing].id;
      state.items = [compact, ...state.items.filter((_, i) => i !== existing)];
      const workspace = JSON.stringify(state);
      inspect(workspace);
      return {
        ...(await this.commit(workspace, 'extension capture')),
        id: compact.id,
        replaced: existing >= 0,
      };
    });
  }
  // Keeps a version without making it current, e.g. unsynced browser changes that lost a conflict.
  keep({ workspace, fonts, reason = 'kept' }) {
    return this.serial(async () => {
      inspect(workspace);
      await this.addFonts(fonts);
      await this.requireFonts(workspace);
      await this.snapshot(
        { workspace, revision: null, savedAt: new Date().toISOString() },
        String(reason).slice(0, 40),
      );
      return { history: await this.listHistory() };
    });
  }
  restore({ id, baseRevision }) {
    return this.serial(async () => {
      if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id))
        throw fail('Choose a saved version.');
      const current = await this.current();
      if (baseRevision !== current.revision)
        throw Object.assign(
          fail('Your library changed in another tab or browser. Reload before restoring.', 409),
          { revision: current.revision },
        );
      let version;
      try {
        version = JSON.parse(await readFile(path.join(this.history, id + '.json'), 'utf8'));
      } catch {
        throw fail('That saved version no longer exists.', 404);
      }
      await this.requireFonts(version.workspace);
      const result = await this.commit(version.workspace, 'before restore');
      return {
        ...result,
        workspace: version.workspace,
        fonts: await this.fontsFor(version.workspace),
      };
    });
  }
}

export function mountLibrary(app, express, library) {
  const json = express.json({ limit: '110mb' });
  const handle = (action) => async (req, res, next) => {
    try {
      res.json(await action(req));
    } catch (error) {
      if (error.status === 409 || error.status === 422)
        return res
          .status(error.status)
          .json({ error: error.message, revision: error.revision, missing: error.missing });
      next(error);
    }
  };
  app.get(
    '/api/library',
    handle(() => library.read()),
  );
  app.put(
    '/api/library',
    json,
    handle((req) => library.write(req.body || {})),
  );
  app.get(
    '/api/library/revision',
    handle(() => library.revision()),
  );
  app.get(
    '/api/library/history',
    handle(() => library.listHistory()),
  );
  app.post(
    '/api/library/history',
    json,
    handle((req) => library.keep(req.body || {})),
  );
  app.post(
    '/api/library/restore',
    json,
    handle((req) => library.restore(req.body || {})),
  );
}
