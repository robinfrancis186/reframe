import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { parse } from '@babel/parser';
import { WorkingPreviews } from '../server/previews.js';
import { buildFeature, inspectFeature } from '../server/features.js';
import { BrowserTests } from '../server/testing.js';
import { defaultBrandTheme } from '../src/branding.js';
const html =
  '<section><h2>Preview newsletter</h2><label>Email<input type="email" aria-label="Email" required></label><button>Save subscriber</button><button>Search subscribers</button></section>';
test(
  'disposable generated UI runs real backend, preserves reload state and cleans up without using imported code',
  { timeout: 90000 },
  async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'reframe-preview-')),
      manager = new WorkingPreviews(folder, 'http://localhost:5173');
    let session;
    try {
      const feature = await buildFeature({ html, name: 'Preview newsletter' });
      feature.files['Component.tsx'] = 'throw new Error("Untrusted code must not run")';
      session = await manager.start({ item: { html, feature }, theme: defaultBrandTheme });
      const response = await fetch(session.url);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
      assert.match(
        response.headers.get('content-security-policy'),
        /frame-ancestors http:\/\/localhost:5173/,
      );
      assert.equal((await fetch(session.url + 'feature.json')).status, 404);
      const endpoint = session.url + 'api/reframe/' + feature.spec.id;
      assert.equal(
        (await fetch(endpoint, { headers: { Origin: 'https://evil.example' } })).status,
        403,
      );
      assert.equal(
        await new Promise((resolve, reject) => {
          const req = request(endpoint, { headers: { Host: 'evil.example' } }, (res) => {
            res.resume();
            resolve(res.statusCode);
          });
          req.on('error', reject);
          req.end();
        }),
        403,
      );
      const runner = new BrowserTests(),
        result = await runner.run(
          {
            target: session.id,
            viewport: 'mobile',
            allowWrites: true,
            steps: [
              { action: 'fill', by: 'label', name: 'Email', value: 'preview@example.com' },
              { action: 'click', by: 'button', name: 'Save subscriber', value: '' },
              {
                action: 'visible',
                by: 'text',
                name: '1 records · saved on this computer',
                value: '',
              },
            ],
          },
          { targets: manager.targets() },
        );
      assert.equal(result.status, 'passed', JSON.stringify(result.errors));
      assert.equal(result.steps.length, 3);
      const saved = await (await fetch(endpoint)).json();
      assert.equal(saved.records[0].values.field1, 'preview@example.com');
      const other = await manager.start({ item: { html, feature }, theme: defaultBrandTheme });
      assert.equal(
        (await (await fetch(other.url + 'api/reframe/' + feature.spec.id)).json()).records.length,
        0,
      );
      const stopURL = session.url;
      await manager.stop(session.id);
      assert.equal(manager.targets().length, 1);
      await assert.rejects(fetch(stopURL));
      await manager.close();
      assert.deepEqual(await readdir(path.join(folder, 'previews')), []);
    } finally {
      await manager.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
);
test(
  'preview source mismatch and cancellation fail cleanly; credential writes are refused',
  { timeout: 60000 },
  async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'reframe-preview-')),
      manager = new WorkingPreviews(folder, 'http://localhost:5173');
    try {
      const feature = await buildFeature({ html, name: 'Review' });
      await assert.rejects(
        manager.start({
          item: { html: html + '<p>changed</p>', feature },
          theme: defaultBrandTheme,
        }),
        /source changed/,
      );
      await assert.rejects(
        manager.start(
          { item: { html, feature }, theme: defaultBrandTheme },
          { signal: AbortSignal.abort() },
        ),
      );
      const session = await manager.start({ item: { html, feature }, theme: defaultBrandTheme });
      const response = await fetch(
        session.url + 'api/reframe/' + feature.spec.id + '/credentials',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'EXAMPLE_KEY', value: 'test-only' }),
        },
      );
      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /real credentials/);
    } finally {
      await manager.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
);

test('generated record, account and commerce controls cannot submit an enclosing host form', async () => {
  const feature = await buildFeature({
    html,
    name: 'Form-safe',
    spec: { ...inspectFeature(html), authRequired: true },
  });
  const { readFile } = await import('node:fs/promises');
  const sources = [
    feature.files['Component.tsx'],
    feature.files['Account.tsx'],
    await readFile(new URL('../server/features/Commerce.tsx', import.meta.url), 'utf8'),
  ];
  for (const source of sources) {
    let count = 0;
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'JSXOpeningElement' && node.name.name === 'button') {
        count++;
        assert.ok(
          node.attributes.some((a) => a.name?.name === 'type' && a.value?.value === 'button'),
        );
      }
      for (const [key, value] of Object.entries(node))
        if (key !== 'loc') {
          if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === 'object') walk(value);
        }
    }
    walk(parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] }));
    assert.ok(count > 0);
  }
});
