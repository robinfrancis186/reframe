import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import { themes } from '../src/model.ts';
import { LibraryStore, mountLibrary } from '../server/library-store.js';

const font = (text) => 'data:font/woff2;base64,' + Buffer.from(text).toString('base64');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const workspace = (names, fonts = []) =>
  JSON.stringify({
    version: 1,
    theme: themes[0],
    items: names.map((name, i) => ({
      id: 'id' + i,
      name,
      source: 'https://example.com',
      kind: 'section',
      capturedAt: '2026-10-23',
      evidence: 'Test',
      html: '<p>' + name + '</p>',
      css: fonts.map((f) => 'url("reframe-font:' + hash(f) + '")').join(),
    })),
  });

test('library store saves revisions to disk, rejects stale writes and keeps each font once', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'library-'));
  try {
    const library = new LibraryStore(dir),
      a = font('A'),
      b = font('B');
    assert.deepEqual(await library.read(), {
      revision: 0,
      savedAt: null,
      workspace: null,
      fonts: {},
    });
    const first = await library.write({
      baseRevision: 0,
      workspace: workspace(['Hero'], [a]),
      fonts: { [hash(a)]: a },
    });
    assert.equal(first.revision, 1);
    assert.deepEqual(first.fonts, [hash(a)]);
    const read = await library.read();
    assert.equal(read.revision, 1);
    assert.equal(read.fonts[hash(a)], a);
    assert.match(read.workspace, /Hero/);
    // A second component reusing the same font sends no font data; the stored copy is reused.
    assert.equal(
      (
        await library.write({
          baseRevision: 1,
          workspace: workspace(['Hero', 'Nav'], [a]),
          fonts: {},
        })
      ).revision,
      2,
    );
    await assert.rejects(
      library.write({ baseRevision: 1, workspace: workspace(['Stale']), fonts: {} }),
      (e) => e.status === 409 && e.revision === 2,
    );
    await assert.rejects(
      library.write({ baseRevision: 2, workspace: workspace(['X'], [b]), fonts: {} }),
      (e) => e.status === 422 && e.missing[0] === hash(b),
    );
    await assert.rejects(
      library.write({ baseRevision: 2, workspace: workspace(['X'], [b]), fonts: { [hash(a)]: b } }),
      /does not match/,
    );
    await assert.rejects(
      library.write({ baseRevision: 2, workspace: '{"items":"nope"}', fonts: {} }),
      /list of components/,
    );
    await assert.rejects(
      library.write({
        baseRevision: 2,
        workspace: workspace(['X']),
        fonts: { [hash('x')]: 'data:text/html,<script>' },
      }),
      /Invalid embedded font/,
    );
    assert.equal((await library.read()).revision, 2, 'rejected writes change nothing');
    // Fonts survive while a kept version references them, and are removed once none do.
    let revision = 2;
    for (let n = 0; n < 12; n++)
      revision = (
        await library.write({
          baseRevision: revision,
          workspace: workspace(['Plain ' + n]),
          fonts: {},
        })
      ).revision;
    assert.equal(revision, 14);
    const history = await library.listHistory();
    assert.equal(history.length, 10);
    assert.equal(history[0].items, 1);
    assert.deepEqual(
      await readdir(path.join(dir, 'library/fonts')),
      [],
      'unreferenced fonts are collected',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('kept browser copies and restores never lose the current library', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'library-'));
  try {
    const library = new LibraryStore(dir),
      a = font('A');
    await library.write({
      baseRevision: 0,
      workspace: workspace(['One'], [a]),
      fonts: { [hash(a)]: a },
    });
    await library.write({ baseRevision: 1, workspace: workspace(['One', 'Two']), fonts: {} });
    const kept = await library.keep({
      workspace: workspace(['Offline edit'], [a]),
      fonts: { [hash(a)]: a },
      reason: 'browser copy',
    });
    assert.equal(kept.history[0].reason, 'browser copy');
    assert.equal((await library.read()).revision, 2, 'a kept copy is not made current');
    const original = (await library.listHistory()).find((v) => v.revision === 1);
    await assert.rejects(
      library.restore({ id: original.id, baseRevision: 1 }),
      (e) => e.status === 409,
    );
    const restored = await library.restore({ id: original.id, baseRevision: 2 });
    assert.equal(restored.revision, 3);
    assert.match(restored.workspace, /One/);
    assert.doesNotMatch(restored.workspace, /Two/);
    assert.equal(restored.fonts[hash(a)], a);
    assert.ok(
      (await library.listHistory()).some((v) => v.reason === 'before restore' && v.items === 2),
      'the replaced library is kept',
    );
    await assert.rejects(
      library.restore({ id: '../../etc/passwd', baseRevision: 3 }),
      /Choose a saved version/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('library HTTP API accepts large libraries and reports conflicts as JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'library-'));
  const app = express();
  mountLibrary(app, express, new LibraryStore(dir));
  app.use(express.json({ limit: '8mb' }));
  app.use((error, _req, res, _next) =>
    res.status(error.status || 400).json({ error: error.message }),
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/library';
    const put = (body) =>
      fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const big = JSON.stringify({
      version: 1,
      theme: themes[0],
      items: Array.from({ length: 12 }, (_, i) => ({
        id: 'large-' + i,
        name: 'Large ' + i,
        html: '<p>' + 'x'.repeat(900000) + '</p>',
        source: 'https://example.com',
        kind: 'section',
        capturedAt: '2026-10-23',
        evidence: 'Large-library test',
      })),
    });
    const saved = await put({ baseRevision: 0, workspace: big, fonts: {} });
    assert.equal(saved.status, 200, 'bodies above the general 8 MB limit are accepted');
    const stale = await put({ baseRevision: 0, workspace: workspace(['Old']), fonts: {} });
    assert.equal(stale.status, 409);
    const body = await stale.json();
    assert.equal(body.revision, 1);
    assert.match(body.error, /another tab or browser/);
    assert.equal((await (await fetch(url)).json()).revision, 1);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('recapturing refreshes source while keeping the user name, labels, theme and identity', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'recapture-'));
  try {
    const library = new LibraryStore(dir),
      old = {
        id: 'kept',
        name: 'My button',
        source: 'https://example.com',
        html: '<button>Go</button>',
        kind: 'button',
        capturedAt: '2026-10-23',
        evidence: 'Fixture',
        tags: ['important'],
        collections: ['Client'],
        theme: { ...themes[1], name: 'Selected' },
      };
    await library.write({
      baseRevision: 0,
      workspace: JSON.stringify({ version: 1, items: [old], theme: themes[0] }),
      fonts: {},
    });
    await library.add(
      {
        ...old,
        id: 'new',
        name: 'Go',
        tags: undefined,
        collections: undefined,
        theme: undefined,
        evidence: 'Refreshed',
      },
      { theme: {} },
    );
    const [saved] = JSON.parse((await library.read()).workspace).items;
    for (const key of ['id', 'name', 'tags', 'collections', 'theme'])
      assert.deepEqual(saved[key], old[key]);
    assert.equal(saved.evidence, 'Refreshed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
