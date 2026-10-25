import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { fork } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';
import { WebComponents } from '../server/web-components.js';
import { buildFeature } from '../server/features.js';
import { defaultBrandTheme } from '../src/branding.js';
import { prepareReplica, buildReplicaFeature } from '../server/replica.js';

test(
  'web embed validates and persists actions in another HTML app, then runs independently without Reframe',
  { timeout: 120000 },
  async () => {
    const store = await mkdtemp(path.join(tmpdir(), 'reframe-web-'));
    const manager = new WebComponents(store);
    let browser, host, standalone;
    try {
      const html =
        '<section><h2>Keep in touch</h2><label>Email<input type="email" required></label><button>Subscribe</button></section>';
      const feature = await buildFeature({ html, name: 'Newsletter' });
      feature.files['Component.tsx'] = 'throw Error("Imported source must never execute")';
      const item = { html, feature, name: 'Newsletter' };
      const prepared = await manager.prepare(item, defaultBrandTheme);
      const response = await fetch(prepared.url);
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors.*localhost/);
      assert.equal(
        await new Promise((resolve, reject) => {
          const req = request(prepared.url, { headers: { Host: 'attacker.example' } }, (res) => {
            res.resume();
            resolve(res.statusCode);
          });
          req.on('error', reject);
          req.end();
        }),
        403,
      );
      host = createServer((_req, res) =>
        res.end(
          `<html><title>Existing HTML app</title><h1>My existing website</h1><iframe title="Newsletter" src="${prepared.url}" style="width:100%;height:620px;border:0"></iframe></html>`,
        ),
      );
      await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const errors = [];
      const external = [];
      await context.route('**/*', (route) => {
        if (!['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) {
          external.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${host.address().port}`);
      const frame = page.frameLocator('iframe');
      await frame.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await frame.getByRole('alert').filter({ hasText: 'Email is required.' }).waitFor();
      await frame.getByRole('textbox', { name: 'Email' }).fill('real@example.test');
      await frame.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await frame.getByRole('button', { name: 'Email: real@example.test', exact: true }).waitFor();
      await page.reload();
      await frame.getByRole('button', { name: 'Email: real@example.test', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      const archive = unzipSync(await manager.archive(prepared.id));
      assert.ok(archive['reframe/runtime.mjs']);
      assert.ok(archive['dist/index.html']);
      assert.ok(
        Object.keys(archive).every(
          (file) => !file.startsWith('.reframe/') && !file.endsWith('.env'),
        ),
      );
      const exported = path.join(store, 'exported');
      await mkdir(exported);
      for (const [name, bytes] of Object.entries(archive)) {
        const file = path.join(exported, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes);
      }
      await manager.close();
      standalone = fork(path.join(exported, 'start.mjs'), [], {
        env: { PORT: '0' },
        execArgv: [],
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Standalone startup timed out')), 10000);
        standalone.once('message', (m) => {
          clearTimeout(timer);
          resolve(m.port);
        });
        standalone.once('exit', () => {
          clearTimeout(timer);
          reject(Error('Standalone exited'));
        });
      });
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.getByRole('textbox', { name: 'Email' }).fill('independent@example.test');
      await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await page
        .getByRole('button', { name: 'Email: independent@example.test', exact: true })
        .waitFor();
      assert.equal(
        JSON.parse(
          await readFile(path.join(exported, '.reframe/data', feature.spec.id + '.json'), 'utf8'),
        ).records.length,
        1,
      );
    } finally {
      if (standalone) await manager.stopChild(standalone);
      await browser?.close();
      if (host) await new Promise((resolve) => host.close(resolve));
      await manager.close();
      await rm(store, { recursive: true, force: true });
    }
  },
);

test(
  'captured website embed keeps navigation, forms and downloads working with the source blocked',
  { timeout: 60000 },
  async () => {
    const store = await mkdtemp(path.join(tmpdir(), 'reframe-site-embed-'));
    const manager = new WebComponents(store);
    let browser, host;
    try {
      const source = {
        url: 'https://source.example/',
        title: 'Portfolio',
        component: true,
        height: 700,
        html: '<nav><a href="/projects">Projects</a></nav><a class="cv" href="/cv.pdf" download="Resume.pdf">Download CV</a><form><label>Email<input name="email" type="email" required></label><button type="submit">Contact me</button></form>',
        css: '.cv{display:inline-flex;color:white;background:rgb(22,30,44);padding:12px 24px;border-radius:24px}',
        rootStyle: 'font-family:Arial',
        htmlClass: '',
      };
      const site = await prepareReplica(
        [
          source,
          {
            ...source,
            url: 'https://source.example/projects',
            html: '<h1>Projects</h1><a href="/">Home</a>',
          },
        ],
        {
          resource: async () => ({
            status: 200,
            headers: { 'content-type': 'application/pdf' },
            body: Buffer.from('%PDF-1.7\nFixture\n%%EOF'),
          }),
        },
      );
      const html = '<section>Portfolio</section>',
        feature = await buildReplicaFeature(html, 'Captured portfolio', site);
      const prepared = await manager.prepare(
        { html, feature, name: 'Captured portfolio' },
        defaultBrandTheme,
      );
      assert.equal(prepared.height, 732);
      host = createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(
          `<iframe title="My captured component" src="${prepared.url}" style="width:100%;height:750px;border:0"></iframe>`,
        );
      });
      await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ acceptDownloads: true });
      const blocked = [],
        errors = [];
      await context.route('**/*', (route) => {
        if (!['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) {
          blocked.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${host.address().port}`);
      const frame = page
        .frameLocator('iframe[title="My captured component"]')
        .frameLocator('iframe');
      assert.equal(
        await frame
          .getByRole('link', { name: 'Download CV' })
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        'rgb(22, 30, 44)',
      );
      await frame.getByRole('textbox', { name: 'Email', exact: true }).fill('visitor@example.test');
      await frame.getByRole('button', { name: 'Contact me' }).click();
      await frame.getByRole('status').filter({ hasText: 'Saved locally. Receipt' }).waitFor();
      await page.reload();
      await frame
        .getByRole('status')
        .filter({ hasText: 'Previous request saved locally.' })
        .waitFor();
      const download = page.waitForEvent('download');
      await frame.getByRole('link', { name: 'Download CV' }).click();
      assert.equal((await download).suggestedFilename(), 'Resume.pdf');
      await frame.getByRole('link', { name: 'Projects', exact: true }).click();
      await frame.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
      await frame.getByRole('link', { name: 'Home', exact: true }).click();
      await frame.getByRole('link', { name: 'Download CV' }).waitFor();
      assert.deepEqual(blocked, []);
      assert.deepEqual(errors, []);
      const address = prepared.url;
      await manager.stop(prepared.id);
      await assert.rejects(fetch(address));
      await assert.rejects(manager.archive(prepared.id), /Prepare/);
      await assert.rejects(
        manager.prepare({ html, feature }, defaultBrandTheme, { signal: AbortSignal.abort() }),
      );
      assert.equal(manager.busy, false);
    } finally {
      await browser?.close();
      if (host) await new Promise((resolve) => host.close(resolve));
      await manager.close();
      await rm(store, { recursive: true, force: true });
    }
  },
);
