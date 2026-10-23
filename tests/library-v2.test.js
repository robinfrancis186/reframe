import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LibraryStore } from '../server/library-store.js';
import { themes } from '../src/model.ts';
const item = (id = 'a') => ({
  id,
  name: 'Reference ' + id,
  source: 'https://example.com/',
  html: '<button>Choose ' + id + '</button>',
  kind: 'button',
  capturedAt: '2026-10-23T00:00:00Z',
  evidence: 'Fixture',
  tags: ['saved'],
  collections: ['Client'],
  theme: themes[0],
});
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('v2 migration preserves legacy workspace, fonts and histories; repeats safely after interruption', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'library-migration-'));
  try {
    const font = 'data:font/woff2;base64,QQ==',
      hash = sha(font),
      workspace = JSON.stringify({
        version: 1,
        theme: themes[0],
        items: [{ ...item(), css: 'url("reframe-font:' + hash + '")' }],
      });
    const legacy = JSON.stringify({ revision: 3, savedAt: '2026-10-23', workspace });
    await mkdir(path.join(dir, 'library/fonts'), { recursive: true });
    await mkdir(path.join(dir, 'library/history'));
    await writeFile(path.join(dir, 'library/fonts', hash), font);
    await writeFile(path.join(dir, 'library/workspace.json'), legacy);
    await writeFile(
      path.join(dir, 'library/history/old.json'),
      JSON.stringify({ id: 'old', revision: 1, savedAt: '2026-10-22', reason: 'save', workspace }),
    );
    const library = new LibraryStore(dir),
      atomic = library.atomic.bind(library);
    library.atomic = async (file, text) => {
      if (file.endsWith('/index.json')) throw Error('Simulated interrupted migration');
      return atomic(file, text);
    };
    await assert.rejects(library.index(), /interrupted/);
    assert.equal(await readFile(path.join(dir, 'library/workspace.json'), 'utf8'), legacy);
    const recovered = new LibraryStore(dir),
      index = await recovered.summaries();
    assert.equal(index.items.length, 1);
    assert.equal(index.items[0]._summary, true);
    assert.equal(index.items[0].html, '');
    assert.equal((await recovered.item('a')).css, 'url("' + font + '")');
    assert.equal(
      await readFile(path.join(dir, 'library/workspace.v1.backup.json'), 'utf8'),
      legacy,
    );
    assert.equal((await recovered.listHistory()).length, 1);
    await recovered.restore({ id: 'old', baseRevision: 3 });
    assert.equal((await recovered.index()).revision, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('metadata updates leave source bytes untouched and independent edits coexist; same-item conflicts stay recoverable', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'library-incremental-'));
  try {
    const library = new LibraryStore(dir);
    const a = await library.put({ item: item(), baseRevision: 0 }),
      b = await library.put({ item: item('b'), baseRevision: 0 });
    const before = (await library.index()).items.find((e) => e.id === 'a'),
      file = path.join(library.objects, before.body + '.json');
    const original = await readFile(file, 'utf8'),
      mtime = (await stat(file)).mtimeMs,
      objects = await readdir(library.objects);
    await Promise.all([
      library.put({
        id: 'a',
        metadata: { name: 'Renamed', tags: ['client'] },
        baseRevision: a.itemRevision,
      }),
      library.put({
        id: 'b',
        metadata: { collections: ['New collection'] },
        baseRevision: b.itemRevision,
      }),
    ]);
    assert.equal(await readFile(file, 'utf8'), original);
    assert.equal((await stat(file)).mtimeMs, mtime);
    assert.deepEqual(await readdir(library.objects), objects);
    await assert.rejects(
      library.put({ id: 'a', metadata: { name: 'Stale' }, baseRevision: 1 }),
      (e) => e.status === 409,
    );
    assert.equal((await library.item('a')).name, 'Renamed');
    assert.deepEqual((await library.item('b')).collections, ['New collection']);
    const current = await library.index(),
      atomic = library.atomic.bind(library);
    library.atomic = async (file, text) => {
      if (file.endsWith('/index.json')) throw Error('Interrupted commit');
      return atomic(file, text);
    };
    await assert.rejects(
      library.put({ item: { ...item(), html: '<button>Changed</button>' }, baseRevision: 2 }),
      /Interrupted commit/,
    );
    assert.equal((await new LibraryStore(dir).index()).revision, current.revision);
    assert.match((await library.item('a')).html, /Choose/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('replaying the same saved operation is idempotent and rejects invalid metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'library-replay-'));
  try {
    const library = new LibraryStore(dir),
      op = { item: item(), baseRevision: 0, operationId: 'same-operation' };
    const first = await library.put(op),
      again = await library.put(op);
    assert.equal(first.revision, again.revision);
    await assert.rejects(
      library.put({ id: 'a', baseRevision: 1, metadata: { tags: ['Not normalized!'] } }),
      /Invalid/,
    );
    await assert.rejects(
      library.put({ id: 'a', baseRevision: 1, metadata: { html: '<script>' } }),
      /Invalid/,
    );
    assert.equal((await library.summaries()).items.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
