import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { ReferenceBrowser } from '../server/browser.js';
import { Websites, websiteFiles, websiteURL, safeSiteCSS } from '../server/websites.js';
import { featureHandler } from '../server/features/website.mjs';
test('website compiler preserves local routes while stripping executable content and CSS escapes', () => {
  const page = {
    url: 'https://example.com/',
    title: 'A <title>',
    styles: [
      {
        id: 0,
        desktop: {
          color: 'rgb(10, 20, 30)',
          'background-image': 'url(http://127.0.0.1/private)',
          'font-family': '</style><script>alert(1)</script>',
        },
        mobile: { display: 'block' },
      },
    ],
    html: '<body data-rf-site="0"><script>alert(1)</script><style>bad</style><base href="https://evil.example"><a href="http://example.com/about#details" onclick="bad()">About</a><form action="/write"><input value="secret"><button>Save</button></form><iframe src="/private"></iframe><img src="javascript:bad()"><details><summary>More</summary>Details</details></body>',
  };
  const result = websiteFiles([
    page,
    { ...page, url: 'https://example.com/about', title: 'About' },
  ]);
  const html = result.files['index.html'];
  assert.match(html, /href="page-2.html#details"/);
  assert.match(html, /data-rf-site="0"/);
  assert.match(html, /<main/);
  assert.match(html, /<button[^>]*disabled/);
  assert.doesNotMatch(html, /<script|<iframe|<base|onclick|secret|url\(|<form|javascript:/);
  assert.match(html, /@media\(max-width:767px\)/);
  assert.match(html, /rgb\(10, 20, 30\)/);
  assert.equal(result.reports[0].forms, 1);
  assert.equal(safeSiteCSS('red;display:none'), '');
  assert.equal(safeSiteCSS('image-set("https://evil.example")'), '');
  assert.throws(() => websiteURL('https://another.example', 'https://example.com'), /exact origin/);
  assert.throws(() => websiteFiles(Array(9).fill(page)), /eight/);
});
test(
  'whole website capture reconstructs responsive pages, local navigation, persistence and cancellation',
  { timeout: 120000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reframe-websites-'));
    let server, runner;
    const source = new ReferenceBrowser({
      resource: async (raw) => {
        const u = new URL(raw);
        if (u.pathname === '/delayed.css') {
          await new Promise((r) => setTimeout(r, 200));
          return {
            status: 200,
            headers: { 'content-type': 'text/css' },
            body: Buffer.from('h1{font-style:italic}'),
          };
        }
        if (u.hostname === '127.0.0.1')
          return { status: 403, headers: {}, body: Buffer.from('blocked') };
        if (u.pathname === '/pixel.png')
          return {
            status: 200,
            headers: { 'content-type': 'image/png' },
            body: Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xoAAAAASUVORK5CYII=',
              'base64',
            ),
          };
        const about = u.pathname === '/about';
        return {
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: Buffer.from(
            `<html><head><title>${about ? 'About' : 'Home'}</title><link rel="stylesheet" href="/delayed.css"><style>body{margin:0;background:rgb(250,240,230);font-family:Arial}main{display:grid;grid-template-columns:1fr 1fr;padding:48px}h1{color:rgb(20,80,120);font-size:40px}@media(max-width:767px){main{display:block;padding:16px}h1{font-size:24px}}</style></head><body><nav><a href="/">Home</a><a href="/about">About</a><a href="https://elsewhere.example">External</a></nav><main><img src="/pixel.png" alt="Allowed asset"><img src="http://127.0.0.1/private" alt="Denied asset"><h1>${about ? 'About us' : 'Our product'}</h1><div><details id="details"><summary>Product details</summary><p>Local disclosure works</p></details><form><label>Email<input type="email" value="must-not-export@example.com"></label><button>Join</button></form></div></main><script>window.originalCode=true</script></body></html>`,
          ),
        };
      },
    });
    const manager = new Websites(root, source),
      events = [];
    try {
      const pkg = await manager.capture(
        { url: 'https://example.com', discover: true, maxPages: 2 },
        { onEvent: (e) => events.push(e) },
      );
      assert.equal(pkg.pages.length, 2);
      assert.deepEqual(pkg.assets, []);
      assert.match(pkg.files['index.html'], /src="data:image\/png;base64,/);
      assert.doesNotMatch(pkg.files['index.html'], /127\.0\.0\.1|Denied asset/);
      assert.doesNotMatch(pkg.pages[0].html, /<script|originalCode|must-not-export/);
      assert.deepEqual(
        events.map((e) => e.status),
        [
          'running',
          'complete',
          'running',
          'complete',
          'building local behavior and reviewing source',
        ],
      );
      assert.equal(source.tabs.size, 0);
      assert.equal((await manager.list())[0].id, pkg.id);
      assert.equal((await manager.get(pkg.id)).files['page-2.html'], pkg.files['page-2.html']);
      assert.doesNotMatch(pkg.files['index.html'], /originalCode|must-not-export/);
      const handler = featureHandler(pkg.item.feature.spec, path.join(root, 'submissions.json'));
      server = createServer((req, res) => handler(req, res));
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        runner = await chromium.launch({ headless: true, channel: 'chrome' });
      } catch {
        runner = await chromium.launch({ headless: true });
      }
      const page = await runner.newPage({ viewport: { width: 1280, height: 900 } });
      const url =
        'http://127.0.0.1:' +
        server.address().port +
        '/api/reframe/' +
        pkg.item.feature.spec.id +
        '/site/index.html';
      await page.route('https://example.com/**', (r) => r.abort());
      await page.goto(url);
      assert.equal(
        await page.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0),
        true,
      );
      assert.equal(
        await page.locator('h1').evaluate((el) => getComputedStyle(el).fontSize),
        '40px',
      );
      assert.equal(
        await page.locator('h1').evaluate((el) => getComputedStyle(el).fontStyle),
        'italic',
      );
      assert.equal(
        await page.locator('body>main').evaluate((el) => getComputedStyle(el).display),
        'grid',
      );
      assert.equal(await page.getByRole('button', { name: 'Join' }).isEnabled(), true);
      assert.equal(await page.evaluate(() => window.originalCode), undefined);
      await page.getByText('Product details', { exact: true }).click();
      assert.equal(await page.getByText('Local disclosure works').isVisible(), true);
      await page.getByRole('link', { name: 'About', exact: true }).click();
      assert.match(page.url(), /page-2.html$/);
      assert.equal(await page.getByRole('heading').innerText(), 'About us');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.locator('h1').evaluate((el) => getComputedStyle(el).fontSize),
        '24px',
      );
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const abort = new AbortController();
      abort.abort();
      await assert.rejects(
        manager.capture({ url: 'https://example.com' }, { signal: abort.signal }),
        /abort/i,
      );
      assert.equal(manager.running, false);
      const manual = await manager.capture({
        url: 'https://example.com',
        discover: false,
        maxPages: 1,
      });
      assert.equal(manual.pages.length, 1);
      assert.ok(manual.uncaptured.includes('https://example.com/about'));
      assert.equal((await manager.list()).length, 2);
      assert.equal(source.tabs.size, 0);
      assert.equal((await manager.list()).length, 2);
    } finally {
      await runner?.close();
      if (server) await new Promise((r) => server.close(r));
      await source.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
