import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { LibraryStore } from '../server/library-store.js';
import { Projects } from '../server/projects.js';
import { themes } from '../src/model.ts';
import { build } from 'vite';
import express from 'express';
import { chromium } from 'playwright';
import { ReferenceBrowser } from '../server/browser.js';
import { exportComponentCode } from '../server/code-export.js';
import { reviewedExport, proposeExportNames } from '../server/export-workflow.js';
import { validateVariants } from '../server/capture-variants.js';

const fixture = `<!doctype html><style>body{margin:0;background:#eee;font:16px Arial}.card{width:800px;padding:20px;background:white;border-radius:12px}.unused-class{color:red}.card button{padding:8px}.card button:hover{background:rgb(220,230,250)}.card button:focus{outline:3px solid blue}[hidden]{display:none}@media(max-width:1000px){.card{width:600px}}@media(max-width:600px){.card{width:340px}}@keyframes pulse{from{opacity:.9}to{opacity:1}}.badge{animation:pulse 2s infinite}</style><section class="card" id="demo"><h2>Project settings</h2><div role="tablist"><button role="tab" aria-controls="overview" aria-selected="true">Overview</button><button role="tab" aria-controls="details" aria-selected="false">Details</button></div><div id="overview" role="tabpanel">Overview panel</div><div id="details" role="tabpanel" hidden>Details panel</div><details><summary>Shipping</summary><p>Delivery information</p></details><button aria-expanded="false" aria-haspopup="menu" aria-controls="menu">Choose action</button><div role="menu" id="menu" hidden><button role="menuitem">One</button><button role="menuitem">Two</button></div><div aria-roledescription="carousel"><p aria-roledescription="slide">First slide</p><p aria-roledescription="slide" hidden>Second slide</p><button aria-label="Previous slide">Previous</button><button aria-label="Next slide">Next</button></div><span class="badge">Ready</span></section>`;

test(
  'responsive capture verifies the same tree, exports real React interactions and does not invent breakpoints',
  { timeout: 180000 },
  async () => {
    const browser = new ReferenceBrowser({
      resource: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.from(fixture),
      }),
    });
    let dir, context, server, installedServer;
    try {
      const { id } = await browser.create();
      await browser.act({ id, action: 'navigate', url: 'https://example.com' });
      await browser.act({ id, action: 'pick', x: 3, y: 3 });
      const captured = await browser.act({ id, action: 'capture', variants: true }),
        item = captured.items[0];
      assert.equal(item.captureVariants.length, 9);
      assert.equal(browser.tabs.get(id).page.viewportSize().width, 1280);
      assert.deepEqual(
        [...new Set(item.captureVariants.map((v) => v.width))].sort(),
        [1280, 390, 768],
      );
      const faithful = exportComponentCode(item),
        clean = exportComponentCode(item, { mode: 'clean' });
      assert.ok(clean.patterns.includes('tabs'));
      assert.ok(clean.patterns.includes('dropdown'));
      assert.ok(clean.patterns.includes('carousel'));
      assert.ok(clean.patterns.includes('accordion'));
      assert.doesNotMatch(clean.files[`${clean.name}.tsx`], new RegExp(clean.scope + '-\\d+\\b'));
      assert.match(clean.css, /@media\(max-width:1000px\)/);
      assert.match(clean.css, /@media\(max-width:600px\)/);
      assert.doesNotMatch(clean.css, /max-width:767|unused-class/);
      assert.match(clean.css, new RegExp('@keyframes ' + clean.scope + '-pulse'));
      assert.ok(faithful.files[`${faithful.name}.tsx`].includes('export default function'));
      dir = await realpath(await mkdtemp(path.join(tmpdir(), 'clean-export-runtime-')));
      for (const [name, text] of Object.entries(clean.files))
        await writeFile(path.join(dir, name), text);
      await writeFile(
        path.join(dir, 'index.html'),
        '<div id="root"></div><script type="module" src="/main.tsx"></script>',
      );
      await writeFile(
        path.join(dir, 'main.tsx'),
        `import React from 'react';import{createRoot}from'react-dom/client';import C from './${clean.name}';createRoot(document.getElementById('root')!).render(<C/>);`,
      );
      await build({
        root: dir,
        configFile: false,
        logLevel: 'error',
        esbuild: { jsx: 'automatic' },
        resolve: {
          alias: {
            react: path.resolve('node_modules/react'),
            'react-dom': path.resolve('node_modules/react-dom'),
          },
        },
      });
      const app = express();
      app.use(express.static(path.join(dir, 'dist')));
      server = await new Promise((resolve) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      });
      context = await chromium.launch({ headless: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.stack || e.message));
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.waitForLoadState('networkidle');
      assert.deepEqual(errors, [], await page.locator('body').innerText());

      await page.getByRole('tab', { name: 'Details', exact: true }).click();
      assert.ok(await page.getByRole('tabpanel').filter({ hasText: 'Details panel' }).isVisible());
      await page.getByRole('tab', { name: 'Details', exact: true }).press('ArrowLeft');
      assert.equal(
        await page
          .getByRole('tab', { name: 'Overview', exact: true })
          .getAttribute('aria-selected'),
        'true',
      );
      await page.getByText('Shipping', { exact: true }).click();
      assert.ok(await page.getByText('Delivery information', { exact: true }).isVisible());
      const menu = page.getByRole('button', { name: 'Choose action', exact: true });
      await menu.click();
      assert.ok(await page.getByRole('menu').isVisible());
      await menu.press('ArrowDown');
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      await page.getByRole('button', { name: 'Next slide', exact: true }).click();
      assert.ok(await page.getByText('Second slide', { exact: true }).isVisible());
      assert.ok(!(await page.getByText('First slide', { exact: true }).isVisible()));
      for (const width of [390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.locator('[data-captured-root]').isVisible());
      }
      assert.deepEqual(errors, []);
      const review = await reviewedExport(item, {
        mode: 'clean',
        browser,
        resource: browser.resource,
      });
      assert.equal(review.variants.length, 9);
      assert.ok(
        review.variants.every((v) => Number.isFinite(v.score) && Number.isFinite(v.faithful)),
      );
      console.log('Measured export variants:', JSON.stringify(review.variants));
      const library = new LibraryStore(path.join(dir, 'library-state'));
      await library.add({ ...item, theme: themes[0] }, { theme: themes[0] });
      const saved = (await library.summaries()).items[0];
      const reopened = await new LibraryStore(path.join(dir, 'library-state')).item(saved.id);
      assert.equal(reopened.captureVariants.length, 9);
      assert.equal(reopened.feature.spec.id, item.feature.spec.id);
      const projectRoot = path.join(dir, 'Demo App');
      await mkdir(projectRoot);
      await writeFile(
        path.join(projectRoot, 'App.tsx'),
        'export default function App(){return <main><section></section></main>}',
      );
      await writeFile(
        path.join(projectRoot, 'package.json'),
        JSON.stringify({
          type: 'module',
          dependencies: { react: '19' },
          devDependencies: { vite: '6' },
          scripts: { dev: 'vite' },
        }),
      );
      const projects = new Projects(path.join(dir, 'project-state')),
        project = await projects.connect(projectRoot),
        targets = await projects.targets(project.id, 'App.tsx');
      const plan = await projects.plan({
        projectId: project.id,
        file: 'App.tsx',
        pointId: targets.points[0].id,
        hash: targets.hash,
        html: reopened.html,
        name: 'ReframeCapturedSettings',
        feature: reopened.feature,
      });
      await projects.apply(plan.id);
      assert.equal(await readFile(path.join(projectRoot, 'App.tsx'), 'utf8'), plan.after);
      const installed = await import(
        pathToFileURL(
          path.join(projectRoot, 'reframe/features', reopened.feature.spec.id, 'website.mjs'),
        ).href
      );
      await writeFile(
        path.join(projectRoot, 'index.html'),
        '<div id="root"></div><script type="module" src="/main.tsx"></script>',
      );
      await writeFile(
        path.join(projectRoot, 'main.tsx'),
        "import React from 'react';import{createRoot}from'react-dom/client';import App from './App';createRoot(document.getElementById('root')!).render(<App/>);",
      );
      await build({
        root: projectRoot,
        configFile: false,
        envFile: false,
        logLevel: 'error',
        esbuild: { jsx: 'automatic' },
        resolve: {
          alias: {
            react: path.resolve('node_modules/react'),
            'react-dom': path.resolve('node_modules/react-dom'),
          },
        },
      });
      const destination = express(),
        handler = installed.featureHandler(reopened.feature.spec, path.join(dir, 'requests.json'));
      destination.use((req, res, next) =>
        req.url.startsWith('/api/reframe/') ? handler(req, res) : next(),
      );
      destination.use(express.static(path.join(projectRoot, 'dist')));
      installedServer = createServer(destination);
      await new Promise((resolve) => installedServer.listen(0, '127.0.0.1', resolve));
      await page.goto('http://127.0.0.1:' + installedServer.address().port);
      const integrated = page.frameLocator('iframe');
      await integrated.getByRole('tab', { name: 'Details', exact: true }).click();
      assert.ok(
        await integrated.getByRole('tabpanel').filter({ hasText: 'Details panel' }).isVisible(),
      );
      assert.ok(
        !(await integrated.getByRole('tabpanel').filter({ hasText: 'Overview panel' }).isVisible()),
      );
      await integrated.getByRole('tab', { name: 'Details', exact: true }).press('ArrowLeft');
      assert.equal(
        await integrated
          .getByRole('tab', { name: 'Overview', exact: true })
          .getAttribute('aria-selected'),
        'true',
      );
      await integrated.getByText('Shipping', { exact: true }).click();
      assert.ok(await integrated.getByText('Delivery information', { exact: true }).isVisible());
      const installedMenu = integrated.getByRole('button', { name: 'Choose action', exact: true });
      await installedMenu.click();
      assert.ok(await integrated.getByRole('menu').isVisible());
      await installedMenu.press('ArrowDown');
      await page.keyboard.press('Escape');
      assert.equal(await installedMenu.getAttribute('aria-expanded'), 'false');
      await integrated.getByRole('button', { name: 'Next slide', exact: true }).click();
      assert.ok(await integrated.getByText('Second slide', { exact: true }).isVisible());
      assert.ok(!(await integrated.getByText('First slide', { exact: true }).isVisible()));
      assert.deepEqual(errors, []);
    } finally {
      if (installedServer) await new Promise((resolve) => installedServer.close(resolve));
      if (server) await new Promise((resolve) => server.close(resolve));
      await context?.close();
      await browser.close();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  },
);

test('AI assist accepts only bounded naming proposals; no returned code can be applied', async () => {
  const item = {
    feature: {
      spec: {
        website: {
          pages: [{ component: true, html: '<button data-rf-rendered="0">Buy</button>' }],
        },
      },
    },
  };
  const result = await proposeExportNames(item, {
    decide: async () => ({ reason: 'Name the action', names: [{ id: '0', name: 'buy-button' }] }),
  });
  assert.equal(result.names[0], 'buy-button');
  await assert.rejects(
    proposeExportNames(item, {
      decide: async () => ({ reason: 'Bad', names: [{ id: '0', name: 'x;fetch(secret)' }] }),
    }),
    /invalid class/,
  );
  await assert.rejects(
    proposeExportNames(item, {
      decide: async () => ({ reason: 'Wrong node', names: [{ id: '99', name: 'button' }] }),
    }),
    /invalid class/,
  );
  assert.throws(() => validateVariants([{ width: 1, state: 'default' }]), /Invalid/);
});
