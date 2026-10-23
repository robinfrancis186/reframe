import { mkdir, readFile, readdir, rename, unlink, writeFile, copyFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { autoTags, validOrganisation } from '../src/library/organize.js';
import { collectAssets } from '../src/library/assets.js';
import { isItem, isTheme } from '../src/model.ts';
import { componentReadiness, componentSignature } from '../src/component-workflow.js';

const FONT_REF = /reframe-font:([a-f0-9]{64})/g;
const FONT = /data:font\/(?:woff2|woff|ttf);base64,[A-Za-z0-9+/=]+/g;
const HASH = /^[a-f0-9]{64}$/;
const HISTORY = 10;
const digest = (text) => createHash('sha256').update(text).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const refs = (text) => [...new Set([...String(text).matchAll(FONT_REF)].map((m) => m[1]))];
const metadataKeys = ['name', 'tags', 'collections', 'theme'];
const mediaPattern =
  /^data:(image\/(?:jpeg|png|webp)|font\/(?:woff2|woff|ttf));base64,([A-Za-z0-9+/=]+)$/;

function inspect(workspace) {
  if (typeof workspace !== 'string' || workspace.length > 100_000_000)
    throw fail('Library must be a JSON workspace under 100 MB.');
  let state;
  try {
    state = JSON.parse(workspace);
  } catch {
    throw fail('Library is not valid JSON.');
  }
  if (!state || !Array.isArray(state.items) || !state.items.every(isItem))
    throw fail('Library must contain a list of components.');
  if (new Set(state.items.map((i) => i.id)).size !== state.items.length)
    throw fail('Library component IDs must be unique.');
  return state;
}

/** Atomic manifests point at immutable item revisions; metadata never rewrites captured source. */
export class LibraryStore {
  constructor(store) {
    this.dir = path.join(store, 'library');
    this.fonts = path.join(this.dir, 'fonts');
    this.history = path.join(this.dir, 'versions');
    this.objects = path.join(this.dir, 'objects');
    this.media = path.join(this.dir, 'media');
    this.queue = Promise.resolve();
    this.ready = null;
  }
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
  async readJSON(file, missing) {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return missing;
      throw fail('The library file on disk could not be read. It has not been changed.', 500);
    }
  }
  async object(value) {
    const text = JSON.stringify(value),
      hash = digest(text),
      file = path.join(this.objects, hash + '.json');
    try {
      await writeFile(file, text, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    return hash;
  }
  async readObject(hash) {
    if (!HASH.test(hash)) throw fail('Invalid library object.', 500);
    const text = await readFile(path.join(this.objects, hash + '.json'), 'utf8');
    if (digest(text) !== hash)
      throw fail('Library content failed its integrity check. Restore a saved version.', 500);
    return JSON.parse(text);
  }
  async addFonts(fonts = {}) {
    if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts))
      throw fail('Invalid font list.');
    for (const [hash, data] of Object.entries(fonts)) {
      if (
        !HASH.test(hash) ||
        typeof data !== 'string' ||
        data.length > 2_000_000 ||
        !/^data:font\/(?:woff2|woff|ttf);base64,[A-Za-z0-9+/=]+$/.test(data)
      )
        throw fail('Invalid embedded font.');
      if (digest(data) !== hash) throw fail('Embedded font does not match its hash.');
      try {
        await writeFile(path.join(this.fonts, hash), data, { flag: 'wx', mode: 0o600 });
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
    }
  }
  async storedFonts() {
    try {
      return (await readdir(this.fonts)).filter((f) => HASH.test(f));
    } catch {
      return [];
    }
  }
  async requireFonts(text) {
    const stored = new Set(await this.storedFonts()),
      missing = refs(text).filter((hash) => !stored.has(hash));
    if (missing.length)
      throw Object.assign(
        fail('Some fonts are missing on disk. Send them with the library.', 422),
        { missing },
      );
  }
  async saveImage(data) {
    if (!data) return null;
    if (!mediaPattern.test(data) || data.length > 2_000_000) throw fail('Invalid component image.');
    const hash = digest(data);
    try {
      await writeFile(path.join(this.media, hash), data, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    return hash;
  }
  async entry(item, previous) {
    const text = JSON.stringify(item, function (key, value) {
        if (key === 'files' && this.spec?.website)
          return {
            ...value,
            'feature.json': JSON.stringify({
              ...this.spec,
              website: 'Recompiled from spec.website when installed.',
            }),
          };
        return value;
      }),
      fonts = {};
    const compact = JSON.parse(
      text.replace(FONT, (font) => {
        const hash = digest(font);
        fonts[hash] = font;
        return 'reframe-font:' + hash;
      }),
    );
    await this.addFonts(fonts);
    await this.requireFonts(JSON.stringify(compact));
    const assets = collectAssets([compact]),
      automatic = autoTags(item);
    const metadata = Object.fromEntries(
      metadataKeys.filter((k) => compact[k] !== undefined).map((k) => [k, compact[k]]),
    );
    if (metadata.theme?.logo)
      metadata.theme = {
        ...metadata.theme,
        logo: 'reframe-image:' + (await this.saveImage(metadata.theme.logo)),
      };
    const reference = await this.saveImage(compact.referenceImage);
    if (reference) compact.referenceImage = 'reframe-image:' + reference;
    for (const variant of compact.captureVariants || [])
      if (variant.referenceImage)
        variant.referenceImage = 'reframe-image:' + (await this.saveImage(variant.referenceImage));
    for (const key of metadataKeys) delete compact[key];
    delete compact._summary;
    delete compact.itemRevision;
    delete compact.contentHash;
    delete compact.thumbnail;
    return {
      id: item.id,
      name: item.name,
      ...metadata,
      source: item.source || '',
      kind: item.kind || '',
      capturedAt: item.capturedAt || '',
      evidence: String(item.evidence || '').slice(0, 1200),
      libraryId: item.libraryId,
      fidelity: item.fidelity,
      itemRevision: (previous?.itemRevision || 0) + 1,
      body: await this.object(compact),
      assets: await this.object(assets),
      imageHashes: [
        ...new Set(
          [...JSON.stringify({ compact, metadata }).matchAll(/reframe-image:([a-f0-9]{64})/g)].map(
            (m) => m[1],
          ),
        ),
      ],
      fontHashes: refs(JSON.stringify(compact) + JSON.stringify(metadata)),
      reference,
      signature: componentSignature(item, item.theme),
      automatic,
      readiness: componentReadiness(item),
      hasFeature: !!item.feature,
      hasCode: !!item.feature?.spec?.website?.pages?.[0]?.component,
      featureId: item.feature?.spec?.id,
      actionsCount: item.feature?.spec?.actions?.length || 0,
      externalService: !!item.feature?.spec?.actions?.some((a) => a.operation === 'external'),
      match: digest(String(item.source) + '\0' + String(item.html)),
    };
  }
  async ensure() {
    if (!this.ready)
      this.ready = this.migrate().catch((e) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }
  async migrate() {
    for (const folder of [this.dir, this.fonts, this.objects, this.media, this.history])
      await mkdir(folder, { recursive: true, mode: 0o700 });
    const index = await this.readJSON(path.join(this.dir, 'index.json'), null);
    if (index) {
      if (index.version !== 2 || !Array.isArray(index.items))
        throw fail('Unknown library format. No data was changed.', 500);
      let changed = false;
      for (const entry of index.items)
        if (!entry.signature) {
          const item = await this.detail(entry);
          entry.signature = componentSignature(item, item.theme);
          changed = true;
        }
      if (changed) await this.atomic(path.join(this.dir, 'index.json'), JSON.stringify(index));
      return;
    }
    const legacy = await this.readJSON(path.join(this.dir, 'workspace.json'), null);
    if (!legacy?.workspace) return;
    const convert = async (old) => {
      const state = inspect(old.workspace),
        items = [];
      for (const item of state.items) items.push(await this.entry(item));
      for (const entry of items) await this.readObject(entry.body);
      return {
        version: 2,
        revision: old.revision || 0,
        savedAt: old.savedAt,
        theme: state.theme,
        items,
      };
    };
    const current = await convert(legacy);
    let files = [];
    try {
      files = (await readdir(path.join(this.dir, 'history')))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .slice(-HISTORY);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    for (const file of files) {
      const old = await this.readJSON(path.join(this.dir, 'history', file), null);
      if (old?.workspace)
        await this.atomic(
          path.join(this.history, file),
          JSON.stringify({
            ...(await convert(old)),
            id: old.id || file.slice(0, -5),
            reason: old.reason || 'migrated',
          }),
        );
    }
    await copyFile(
      path.join(this.dir, 'workspace.json'),
      path.join(this.dir, 'workspace.v1.backup.json'),
    );
    // Only this final rename switches formats; interrupted migrations leave the v1 workspace authoritative.
    await this.atomic(path.join(this.dir, 'index.json'), JSON.stringify(current));
  }
  async index() {
    await this.ensure();
    return this.readJSON(path.join(this.dir, 'index.json'), {
      version: 2,
      revision: 0,
      savedAt: null,
      theme: null,
      items: [],
    });
  }
  summary(entry) {
    const { body, assets, fontHashes, imageHashes, reference, match, theme, ...meta } = entry;
    return {
      ...meta,
      html: '',
      _summary: true,
      contentHash: body,
      thumbnail: reference ? `/api/library/thumbnails/${reference}` : null,
    };
  }
  async summaries() {
    const index = await this.index();
    return { ...index, items: index.items.map((e) => this.summary(e)) };
  }
  async inflate(item) {
    let text = JSON.stringify(item);
    for (const hash of refs(text)) {
      const font = await readFile(path.join(this.fonts, hash), 'utf8');
      text = text.replaceAll('reframe-font:' + hash, font);
    }
    for (const [, hash] of [...text.matchAll(/reframe-image:([a-f0-9]{64})/g)]) {
      const data = await readFile(path.join(this.media, hash), 'utf8');
      text = text.replaceAll('reframe-image:' + hash, data);
    }
    return JSON.parse(text);
  }
  async detail(entry) {
    const body = await this.readObject(entry.body);
    return this.inflate({
      ...body,
      ...Object.fromEntries(
        metadataKeys.filter((k) => entry[k] !== undefined).map((k) => [k, entry[k]]),
      ),
      itemRevision: entry.itemRevision,
      contentHash: entry.body,
    });
  }
  async item(id) {
    const entry = (await this.index()).items.find((i) => i.id === id);
    if (!entry) throw fail('Component not found.', 404);
    return this.detail(entry);
  }
  async read() {
    const index = await this.index();
    if (!index.revision) return { revision: 0, savedAt: null, workspace: null, fonts: {} };
    const items = [];
    for (const entry of index.items) items.push(await this.detail(entry));
    const fonts = {};
    for (const hash of new Set(index.items.flatMap((e) => e.fontHashes)))
      fonts[hash] = await readFile(path.join(this.fonts, hash), 'utf8');
    return {
      revision: index.revision,
      savedAt: index.savedAt,
      workspace: JSON.stringify({ version: 1, items, theme: index.theme }),
      fonts,
    };
  }
  async snapshot(index, reason) {
    if (index.revision === 0) return;
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    await this.atomic(
      path.join(this.history, id + '.json'),
      JSON.stringify({ ...index, id, reason }),
    );
    const files = (await readdir(this.history)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files.slice(0, Math.max(0, files.length - HISTORY)))
      await unlink(path.join(this.history, file));
  }
  async commit(index, items, reason, theme = index.theme) {
    await this.snapshot(index, reason);
    const next = {
      version: 2,
      revision: index.revision + 1,
      savedAt: new Date().toISOString(),
      theme,
      items,
    };
    await this.atomic(path.join(this.dir, 'index.json'), JSON.stringify(next));
    return next;
  }
  async listHistory() {
    await this.ensure();
    const list = [];
    for (const file of (await readdir(this.history))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()) {
      const entry = await this.readJSON(path.join(this.history, file));
      list.push({
        id: entry.id,
        reason: entry.reason,
        revision: entry.revision,
        savedAt: entry.savedAt,
        items: entry.items.length,
      });
    }
    return list;
  }
  async collect() {
    const indexes = [await this.index()];
    for (const file of await readdir(this.history))
      if (file.endsWith('.json')) indexes.push(await this.readJSON(path.join(this.history, file)));
    const keep = new Set(indexes.flatMap((i) => i.items.flatMap((e) => e.fontHashes)));
    const legacy = await this.readJSON(path.join(this.dir, 'workspace.v1.backup.json'), null);
    if (legacy?.workspace) for (const hash of refs(legacy.workspace)) keep.add(hash);
    const objects = new Set(indexes.flatMap((i) => i.items.flatMap((e) => [e.body, e.assets]))),
      images = new Set(
        indexes.flatMap((i) =>
          i.items.flatMap((e) => e.imageHashes || [e.reference].filter(Boolean)),
        ),
      );
    for (const file of await readdir(this.objects))
      if (/^[a-f0-9]{64}\.json$/.test(file) && !objects.has(file.slice(0, -5)))
        await unlink(path.join(this.objects, file));
    for (const file of await readdir(this.media))
      if (HASH.test(file) && !images.has(file)) await unlink(path.join(this.media, file));
    for (const hash of await this.storedFonts())
      if (!keep.has(hash)) await unlink(path.join(this.fonts, hash));
  }
  write({ baseRevision, workspace, fonts }) {
    return this.serial(async () => {
      const state = inspect(workspace),
        current = await this.index();
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
      const entries = [];
      for (const item of state.items)
        entries.push(
          await this.entry(
            item,
            current.items.find((i) => i.id === item.id),
          ),
        );
      const next = await this.commit(current, entries, 'save', state.theme);
      await this.collect();
      return { revision: next.revision, savedAt: next.savedAt, fonts: await this.storedFonts() };
    });
  }
  /** @param {import('./contracts.js').SaveItem} request */
  put({ item, baseRevision, metadata, id, operationId }) {
    return this.serial(async () => {
      const index = await this.index(),
        previous = index.items.find((e) => e.id === (id || item?.id));
      if (operationId && previous?.operationId === operationId)
        return { ...this.summary(previous), revision: index.revision, savedAt: index.savedAt };
      if (baseRevision !== (previous?.itemRevision || 0))
        throw Object.assign(
          fail(
            'This component changed elsewhere. Your edit is kept locally; reload or save it as a copy.',
            409,
          ),
          { revision: previous?.itemRevision || 0 },
        );
      let next;
      if (metadata) {
        if (!previous) throw fail('Component not found.', 404);
        if (
          !metadata ||
          typeof metadata !== 'object' ||
          Object.keys(metadata).some((k) => !metadataKeys.includes(k)) ||
          (metadata.name !== undefined &&
            (typeof metadata.name !== 'string' ||
              !metadata.name.trim() ||
              metadata.name.length > 200)) ||
          !validOrganisation(metadata) ||
          (metadata.theme !== undefined && !isTheme(metadata.theme))
        )
          throw fail('Invalid component metadata.');
        next = { ...previous, ...metadata, itemRevision: previous.itemRevision + 1 };
        if (metadata.theme) {
          next.signature = componentSignature(await this.detail(previous), metadata.theme);
          if (metadata.theme.logo) {
            const hash = await this.saveImage(metadata.theme.logo);
            next.theme = { ...metadata.theme, logo: 'reframe-image:' + hash };
            next.imageHashes = [...new Set([...(previous.imageHashes || []), hash])];
          }
        }
      } else {
        if (!item || typeof item.id !== 'string' || typeof item.name !== 'string')
          throw fail('Invalid component.');
        next = await this.entry(item, previous);
      }
      next.operationId = operationId;
      const saved = await this.commit(
        index,
        [next, ...index.items.filter((e) => e.id !== next.id)],
        metadata ? 'metadata' : 'save',
      );
      return { ...this.summary(next), revision: saved.revision, savedAt: saved.savedAt };
    });
  }
  remove({ id, baseRevision }) {
    return this.serial(async () => {
      const index = await this.index(),
        item = index.items.find((e) => e.id === id);
      if (!item) return { revision: index.revision, savedAt: index.savedAt };
      if (baseRevision !== item.itemRevision)
        throw fail('This component changed elsewhere. Reload before deleting.', 409);
      const saved = await this.commit(
        index,
        index.items.filter((e) => e.id !== id),
        'delete',
      );
      return { revision: saved.revision, savedAt: saved.savedAt };
    });
  }
  preferences({ theme, baseRevision }) {
    return this.serial(async () => {
      const index = await this.index();
      if (baseRevision !== index.revision)
        throw fail('Library settings changed. Reload before updating them.', 409);
      const next = await this.commit(index, index.items, 'theme', theme);
      return { revision: next.revision, savedAt: next.savedAt };
    });
  }
  add(item, { theme }) {
    return this.serial(async () => {
      const index = await this.index(),
        match = digest(String(item.source) + '\0' + String(item.html)),
        previous = index.items.find((e) => e.match === match);
      const refreshed = { ...item, theme: item.theme || index.theme || theme };
      if (previous)
        for (const key of ['id', ...metadataKeys])
          if (previous[key] !== undefined) refreshed[key] = previous[key];
      if (refreshed.theme?.logo?.startsWith('reframe-image:'))
        refreshed.theme = (await this.inflate({ theme: refreshed.theme })).theme;
      const next = await this.entry(refreshed, previous),
        saved = await this.commit(
          index,
          [next, ...index.items.filter((e) => e.id !== next.id)],
          'extension capture',
          index.theme || theme,
        );
      return {
        revision: saved.revision,
        savedAt: saved.savedAt,
        id: next.id,
        name: next.name,
        replaced: !!previous,
      };
    });
  }
  async revision() {
    const { revision, savedAt } = await this.index();
    return { revision, savedAt };
  }
  keep({ workspace, fonts, reason = 'kept' }) {
    return this.serial(async () => {
      const state = inspect(workspace);
      await this.ensure();
      await this.addFonts(fonts);
      await this.requireFonts(workspace);
      const items = [];
      for (const item of state.items) items.push(await this.entry(item));
      await this.snapshot(
        {
          version: 2,
          revision: null,
          savedAt: new Date().toISOString(),
          theme: state.theme,
          items,
        },
        reason,
      );
      return { history: await this.listHistory() };
    });
  }
  restore({ id, baseRevision }) {
    return this.serial(async () => {
      if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id))
        throw fail('Choose a saved version.');
      const current = await this.index();
      if (baseRevision !== current.revision)
        throw fail('Your library changed in another tab or browser. Reload before restoring.', 409);
      const version = await this.readJSON(path.join(this.history, id + '.json'), null);
      if (!version) throw fail('That saved version no longer exists.', 404);
      for (const entry of version.items) {
        await this.readObject(entry.body);
        await this.requireFonts(entry.fontHashes.map((h) => 'reframe-font:' + h).join(' '));
      }
      const next = await this.commit(current, version.items, 'before restore', version.theme);
      const items = [];
      for (const entry of next.items) items.push(await this.detail(entry));
      const fonts = {};
      for (const hash of new Set(next.items.flatMap((e) => e.fontHashes)))
        fonts[hash] = await readFile(path.join(this.fonts, hash), 'utf8');
      return {
        revision: next.revision,
        savedAt: next.savedAt,
        workspace: JSON.stringify({ version: 1, items, theme: next.theme }),
        fonts,
      };
    });
  }
  async assets() {
    const index = await this.index(),
      result = { fonts: [], colors: [], icons: [], images: [] };
    for (const entry of index.items) {
      const assets = await this.readObject(entry.assets);
      for (const kind of Object.keys(result))
        for (const asset of assets[kind]) {
          const key =
            kind === 'fonts'
              ? [asset.family, asset.weight, asset.style, asset.src].join('|')
              : asset.hex || asset.svg || asset.src;
          const found = result[kind].find((a) => a.key === key),
            use = { id: entry.id, name: entry.name, site: entry.automatic.site };
          if (found) {
            found.usedBy.push(use);
            if (kind === 'colors') found.count += asset.count;
          } else if (result[kind].length < 300)
            result[kind].push({
              ...asset,
              key,
              usedBy: [use],
              ...(kind === 'fonts'
                ? {
                    src: asset.src.replace(/reframe-font:([a-f0-9]{64})/g, '/api/library/fonts/$1'),
                  }
                : {}),
            });
        }
    }
    return result;
  }
}

/** @param {{thumbnail?:(data:string,hash:string)=>Promise<string>}} options */
export function mountLibrary(app, express, library, options = {}) {
  const { thumbnail } = options;
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
    '/api/library/index',
    handle(() => library.summaries()),
  );
  app.get('/api/library/export', async (_req, res, next) => {
    try {
      const state = await library.read();
      res
        .set('Cache-Control', 'no-store')
        .attachment('reframe-library.json')
        .type('application/json')
        .send(state.workspace || JSON.stringify({ version: 1, items: [], theme: null }));
    } catch (e) {
      next(e);
    }
  });
  app.get(
    '/api/library/assets',
    handle(() => library.assets()),
  );
  app.post(
    '/api/library/captures',
    express.json({ limit: '12mb' }),
    handle(async (req) => {
      if (!isItem(req.body.item) || !isTheme(req.body.theme)) throw fail('Invalid capture.');
      const saved = await library.add(req.body.item, { theme: req.body.theme });
      const index = await library.index();
      return {
        ...library.summary(index.items.find((i) => i.id === saved.id)),
        revision: saved.revision,
        savedAt: saved.savedAt,
      };
    }),
  );
  app.get(
    '/api/library/items/:id',
    handle((req) => library.item(req.params.id)),
  );
  app.put(
    '/api/library/items/:id',
    express.json({ limit: '12mb' }),
    handle((req) => {
      if (!isItem(req.body.item) || req.body.item?.id !== req.params.id)
        throw fail('Component ID does not match.');
      return library.put(req.body);
    }),
  );
  app.patch(
    '/api/library/items/:id',
    express.json({ limit: '1mb' }),
    handle((req) => library.put({ ...req.body, id: req.params.id })),
  );
  app.delete(
    '/api/library/items/:id',
    express.json(),
    handle((req) => library.remove({ ...req.body, id: req.params.id })),
  );
  app.patch(
    '/api/library/settings',
    express.json({ limit: '1mb' }),
    handle((req) => {
      if (!isTheme(req.body.theme)) throw fail('Invalid theme.');
      return library.preferences(req.body);
    }),
  );
  app.get('/api/library/thumbnails/:hash', async (req, res, next) => {
    try {
      if (!HASH.test(req.params.hash)) throw fail('Invalid thumbnail.', 404);
      await library.ensure();
      const data = await readFile(path.join(library.media, req.params.hash), 'utf8');
      const image = thumbnail ? await thumbnail(data, req.params.hash) : data;
      const match = mediaPattern.exec(image);
      if (!match) throw fail('Invalid image.', 404);
      res
        .set('Content-Type', match[1])
        .set('Cache-Control', 'private, max-age=31536000, immutable')
        .send(Buffer.from(match[2], 'base64'));
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/library/fonts/:hash', async (req, res, next) => {
    try {
      if (!HASH.test(req.params.hash)) throw fail('Invalid font.', 404);
      await library.ensure();
      const data = await readFile(path.join(library.fonts, req.params.hash), 'utf8'),
        match = mediaPattern.exec(data);
      if (!match) throw fail('Invalid font.', 404);
      res
        .set('Content-Type', match[1])
        .set('Cache-Control', 'private, max-age=31536000, immutable')
        .send(Buffer.from(match[2], 'base64'));
    } catch (e) {
      next(e);
    }
  });
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
