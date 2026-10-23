import { chromium } from 'playwright';
import { createServer, request as localRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateReplica } from './replica.js';
import { featureHandler } from './features/website.mjs';
import { reuseReport } from '../src/reuse-report.js';

let busy = false;
export async function checkReuse(item, { signal } = {}) {
  if (busy) throw new Error('Another source-blocked check is running.');
  const site = validateReplica(item?.feature?.spec?.website);
  busy = true;
  let server, proxy, browser, context, timer;
  const blocked = new Set(),
    errors = [],
    views = [],
    downloads = [];
  const stop = () => void browser?.close().catch(() => {});
  try {
    signal?.throwIfAborted();
    const spec = { id: 'rf_000000000001', website: site };
    // GET-only test: no forms, writes, credentials or source-site requests are permitted.
    const handler = featureHandler(spec, 'unused-read-only-check');
    server = createServer((req, res) => {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      void handler(req, res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    proxy = createServer((req, res) => {
      try {
        const target = new URL(req.url);
        if (target.origin !== origin || !['GET', 'HEAD'].includes(req.method)) {
          blocked.add(target.href);
          res.writeHead(403);
          res.end();
          return;
        }
        const upstream = localRequest(target, { method: req.method }, (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        });
        upstream.on('error', () => {
          res.writeHead(502);
          res.end();
        });
        res.on('close', () => upstream.destroy());
        upstream.end();
      } catch {
        res.writeHead(403);
        res.end();
      }
    });
    proxy.on('connect', (_req, socket) => socket.destroy());
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      proxy: { server: `http://127.0.0.1:${proxy.address().port}` },
      args: [
        '--proxy-bypass-list=<-loopback>',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ],
    });
    signal?.addEventListener('abort', stop, { once: true });
    timer = setTimeout(stop, 45000);
    context = await browser.newContext({
      serviceWorkers: 'block',
      acceptDownloads: true,
      permissions: [],
    });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    await context.route('**/*', async (route) => {
      const req = route.request();
      if (new URL(req.url()).origin !== origin || !['GET', 'HEAD'].includes(req.method())) {
        blocked.add(req.url());
        await route.abort();
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => errors.push(e.message));
    for (let index = 0; index < site.pages.length; index++) {
      for (const width of [1280, 390]) {
        signal?.throwIfAborted();
        await page.setViewportSize({ width, height: 900 });
        await page.goto(
          `${origin}/api/reframe/${spec.id}/site/${index ? 'page-' + (index + 1) : 'index'}.html`,
        );
        const assets = await page.evaluate(async () => {
          const images = Array.from(document.images);
          images.forEach((img) => {
            img.loading = 'eager';
          });
          await Promise.race([
            Promise.all(images.map((img) => img.decode().catch(() => {}))),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ]);
          await document.fonts.ready;
          return {
            images: images.length,
            brokenImages: images.filter((img) => !img.complete || !img.naturalWidth).length,
            failedFonts: Array.from(document.fonts).filter((font) => font.status === 'error')
              .length,
          };
        });
        views.push({ page: index, width, ...assets });
      }
      for (const link of await page.locator('a[download][href^="download-"]').all()) {
        const href = await link.getAttribute('href');
        const attachment = site.attachments[Number(href.match(/\d+/)[0])];
        const pending = page.waitForEvent('download');
        await link.click();
        const download = await pending,
          file = await download.path();
        const bytes = await readFile(file);
        downloads.push({
          name: attachment.name,
          bytes: bytes.length,
          match: bytes.equals(Buffer.from(attachment.base64, 'base64')),
        });
      }
    }
    const report = reuseReport({ feature: { spec: { website: site } } });
    return {
      passed:
        report.selfContained &&
        !blocked.size &&
        !errors.length &&
        views.every((v) => !v.brokenImages && !v.failedFonts) &&
        downloads.every((d) => d.match),
      checkedAt: new Date().toISOString(),
      digest: createHash('sha256').update(JSON.stringify(site)).digest('hex'),
      views,
      downloads,
      blocked: [...blocked].slice(0, 40),
      errors,
      scope:
        'All external network requests blocked. HTML images and font loading checked at 1280px and 390px; visible bundled PDF downloads verified at 390px. Forms, custom actions and destination integration are not tested here.',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    for (const s of [server, proxy])
      if (s) {
        s.closeAllConnections();
        await new Promise((resolve) => s.close(resolve));
      }
    busy = false;
  }
}
