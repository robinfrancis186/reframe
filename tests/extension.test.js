import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { LibraryStore, mountLibrary } from '../server/library-store.js';
import { ExtensionPairing, isExtensionRoute, mountExtension } from '../server/extension.js';
import { ReferenceBrowser } from '../server/browser.js';
import { isItem, themes } from '../src/model.ts';
import { snapshotSource } from '../extension/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test("the extension's capture code is generated from the reference browser's, and is up to date", async () => {
  assert.equal(
    await readFile(path.join(root, 'extension/generated/snapshot.js'), 'utf8'),
    snapshotSource(),
    'run npm run extension:build',
  );
  const manifest = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(
    manifest.permissions.sort(),
    ['activeTab', 'scripting', 'storage'],
    'no standing access to sites',
  );
  assert.deepEqual(
    manifest.host_permissions,
    ['http://localhost/*', 'http://127.0.0.1/*'],
    'it can only reach Reframe on this computer',
  );
});

test('pairing tokens are shown once, stored as a hash, and required with the extension origin', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pairing-'));
  try {
    const pairing = new ExtensionPairing(dir);
    assert.deepEqual(await pairing.status(), { paired: false });
    const { token } = await pairing.pair();
    assert.match(token, /^rfx_[\w-]{32}$/);
    const stored = await readFile(path.join(dir, 'extension.json'), 'utf8');
    assert.ok(!stored.includes(token), 'only the hash is stored');
    await pairing.verify('Bearer ' + token);
    await assert.rejects(pairing.verify('Bearer rfx_' + 'x'.repeat(32)), (e) => e.status === 401);
    await assert.rejects(pairing.verify(token), (e) => e.status === 401);
    const second = (await pairing.pair()).token;
    await assert.rejects(
      pairing.verify('Bearer ' + token),
      (e) => e.status === 401,
      'pairing again replaces the token',
    );
    await pairing.verify('Bearer ' + second);
    await pairing.revoke();
    await assert.rejects(pairing.verify('Bearer ' + second), (e) => e.status === 401);
    const req = (p, origin) => ({ path: p, headers: { origin } });
    assert.ok(
      isExtensionRoute(
        req('/api/extension/capture', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'),
      ),
    );
    assert.ok(
      !isExtensionRoute(
        req('/api/extension/pair', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'),
      ),
      'pairing stays app-only',
    );
    assert.ok(!isExtensionRoute(req('/api/extension/capture', 'https://evil.example')));
    assert.ok(
      !isExtensionRoute(req('/api/library', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop')),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Loads the real extension in Chrome for Testing (installed by `npx playwright install chromium`).
const testBrowser = existsSync(chromium.executablePath());
test(
  'the real extension picks an element on a page, captures it and saves it to the library',
  {
    skip: !testBrowser && 'Chrome for Testing is not installed (npx playwright install chromium)',
    timeout: 120000,
  },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'extension-e2e-')),
      store = path.join(dir, 'store'),
      extension = path.join(dir, 'extension');
    // A copy of the extension whose manifest also grants the fixture site, standing in for the toolbar click's activeTab.
    await cp(path.join(root, 'extension'), extension, { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
    manifest.host_permissions.push('<all_urls>');
    await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
    const fixture = `<!doctype html><html><head><title>Plans</title><style>html{font-size:10px}body{margin:0;background:#f3f1ec;font:1.6rem/1.5 Arial,sans-serif}.wrap .plan{width:320px;margin:40px;padding:2.4rem;background:#fff;border-radius:1.2rem;color:#1f2430}.plan h2{margin:0 0 .8rem;font-size:2.4rem}.plan .buy{display:inline-block;margin-top:1.2rem;padding:1rem 1.8rem;background:#2d5bd7;color:#fff;border-radius:.8rem;text-decoration:none}</style></head><body><div class="wrap"><section class="plan" id="plan"><div class="inner"><h2>Team plan</h2><p>Shared projects for five people.</p><a class="buy" id="buy" href="/checkout">Start trial</a></div></section></div></body></html>`;
    const library = new LibraryStore(store),
      pairing = new ExtensionPairing(store),
      reference = new ReferenceBrowser();
    const app = express();
    mountLibrary(app, express, library);
    mountExtension(app, express, {
      pairing,
      library,
      browser: reference,
      isItem,
      theme: themes[0],
      folder: extension,
    });
    // Stands in for Reframe's Library panel: the same one-click pairing messages as src/ExtensionPairing.tsx.
    app.get('/pair', (_req, res) =>
      res.type('html').send(`<!doctype html><title>Reframe</title><script>
    window.bridge=new Promise(r=>{addEventListener('message',e=>{if(e.data?.source==='reframe-picker'&&e.data.type==='ready')r(e.data.version)});postMessage({source:'reframe',type:'hello'},location.origin);});
    window.connect=async()=>{const {token}=await (await fetch('/api/extension/pair',{method:'POST'})).json();const reply=new Promise(r=>addEventListener('message',function l(e){if(e.data?.source==='reframe-picker'&&e.data.type==='paired'){removeEventListener('message',l);r(e.data)}}));postMessage({source:'reframe',type:'pair',token},location.origin);return reply;};
  </script>`),
    );
    app.use(express.json());
    app.use((error, _req, res, _next) =>
      res.status(error.status || 400).json({ error: error.message }),
    );
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const address = 'http://127.0.0.1:' + server.address().port;
    let context;
    try {
      context = await chromium.launchPersistentContext(path.join(dir, 'profile'), {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      await context.route('https://fixture.example/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: fixture }),
      );
      const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
      // One-click pairing: the page hands the extension a token, after the user confirms in the browser.
      const reframe = await context.newPage();
      await reframe.goto(address + '/pair');
      assert.equal(
        await reframe.evaluate(() => window.bridge),
        '0.1.0',
        'the extension announces itself to Reframe',
      );
      reframe.once('dialog', (dialog) => {
        assert.ok(dialog.message().includes('Reframe at ' + address));
        void dialog.dismiss();
      });
      assert.deepEqual(await reframe.evaluate(() => connect()), {
        source: 'reframe-picker',
        type: 'paired',
        ok: false,
        error: 'Connection cancelled in the browser.',
      });
      assert.equal(
        (await worker.evaluate(() => chrome.storage.local.get('token'))).token,
        undefined,
        'nothing is stored without confirmation',
      );
      reframe.once('dialog', (dialog) => void dialog.accept());
      assert.equal((await reframe.evaluate(() => connect())).ok, true);
      assert.equal(
        (await worker.evaluate(() => chrome.storage.local.get('server'))).server,
        address,
      );
      await reframe.close();
      const page = await context.newPage();
      await page.setViewportSize({ width: 1100, height: 700 });
      await page.goto('https://fixture.example/');
      const start = () =>
        worker.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ url: 'https://fixture.example/*' });
          return self.startPicker(tab);
        });
      assert.equal(await start(), true);
      // Hover outlines; clicking the link text selects the link and does not navigate; ↑ climbs past the same-size wrapper.
      await page.locator('#buy').hover();
      await page.locator('#buy').click();
      assert.equal(page.url(), 'https://fixture.example/', 'the page does not react while picking');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      // Wait for the save to land on disk.
      let state;
      for (let n = 0; n < 60; n++) {
        state = await library.read();
        if (state.workspace) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.ok(state.workspace, 'the capture reached the library');
      const [item] = JSON.parse(state.workspace).items;
      assert.equal(item.name, 'Team plan', 'named from its visible heading');
      assert.ok(isItem(item), 'saved in the shape the app loads');
      assert.match(
        item.feature.spec.website.pages[0].html,
        /^<div class="inner"[\s\S]*Team plan[\s\S]*Start trial/,
        '↑ from the link selects its container',
      );
      assert.equal(item.feature.spec.website.pages[0].rem, 10);
      assert.match(item.referenceImage, /^data:image\/jpeg;base64,/);
      assert.ok(item.fidelity?.score >= 85, `extension capture scored ${item.fidelity?.score}`);
      assert.equal((await pairing.status()).captures, 1);
      // Without a valid token the server refuses.
      const refused = await worker.evaluate(
        async (capture) => {
          const r = await fetch(capture.address + '/api/extension/capture', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + capture.token,
            },
            body: '{}',
          });
          return r.status;
        },
        { address, token: 'rfx_' + 'x'.repeat(32) },
      );
      assert.equal(refused, 401);
    } finally {
      await context?.close();
      await reference.close();
      server.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
