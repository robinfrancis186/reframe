import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import express from 'express';
import { chromium } from 'playwright';
import { LibraryStore, mountLibrary } from '../server/library-store.js';
import { ReferenceBrowser } from '../server/browser.js';
import { Thumbnails } from '../server/thumbnails.js';
import { themes } from '../src/model.ts';

const exec = promisify(execFile),
  root = process.cwd(),
  temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'reframe-benchmark-'))),
  results = [];
let listener, chromeServer, browser;
const reference = new ReferenceBrowser(),
  thumbs = new Thumbnails(temporary, reference);
async function rss(pid) {
  const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,ppid=,rss=']);
  const rows = stdout
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number)),
    ids = new Set([pid]);
  for (let pass = 0; pass < 10; pass++)
    for (const [id, parent] of rows) if (ids.has(parent)) ids.add(id);
  return rows.filter(([id]) => ids.has(id)).reduce((sum, row) => sum + row[2] * 1024, 0);
}
const sha = (value) => createHash('sha256').update(value).digest('hex');
try {
  const baseline = path.join(temporary, 'baseline');
  await mkdir(baseline);
  await exec('git', ['archive', 'HEAD', '-o', path.join(temporary, 'baseline.tar')]);
  await exec('tar', ['-xf', path.join(temporary, 'baseline.tar'), '-C', baseline]);
  await symlink(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'));
  const icon = 'data:image/png;base64,' + (await readFile('desktop/icon.png')).toString('base64');
  const image = await thumbs.get(icon, sha(icon));
  const font =
      'data:font/woff2;base64,' +
      (await readFile('public/fonts/inter/inter-latin-wght-normal.woff2')).toString('base64'),
    fontHash = sha(font);
  const styles =
    '@font-face{font-family:Benchmark;src:url("reframe-font:' +
    fontHash +
    '")}.card{font:16px Benchmark;padding:24px;background:#fff;border:1px solid #ccc;border-radius:12px;color:#222}' +
    Array.from(
      { length: 1200 },
      (_, n) => `.unused-${n}{margin:${n % 40}px;padding:2px;color:#123456}`,
    ).join('');
  function capture(n) {
    const html = `<article class="card"><h2>Component ${n}</h2><p>Reusable product card from a captured screen, with layout, typography and an action.</p><button>Choose component ${n}</button></article>`;
    const spec = {
      version: 1,
      id: 'rf_111111111111',
      name: 'Product card',
      fields: [],
      actions: [],
      website: {
        version: 1,
        pages: [
          {
            url: 'https://example.com/',
            title: 'Product',
            html,
            rootStyle: 'font-family:Benchmark',
            htmlClass: '',
            height: 240,
            viewport: 1280,
            component: true,
          },
        ],
        css: styles,
        attachments: [],
        warnings: [],
      },
    };
    return {
      id: 'bench-' + n,
      name: 'Product card ' + n,
      html,
      source: 'https://example.com/' + n,
      kind: 'article',
      capturedAt: '2026-10-23T00:00:00Z',
      evidence: 'Synthetic benchmark capture',
      referenceImage: image,
      feature: {
        version: 1,
        spec,
        sourceHash: 'a'.repeat(64),
        files: {
          'Component.tsx': 'export default function C(){return null}',
          'feature.json': '{}',
        },
        bytes: styles.length,
        builtAt: '2026-10-23T00:00:00Z',
        requirements: [],
      },
      theme: themes[0],
    };
  }
  const surfaces = {};
  for (const mode of ['baseline', 'current']) {
    const surface = path.join(temporary, mode + '-surface');
    await mkdir(surface);
    const source = mode === 'baseline' ? baseline : root;
    await writeFile(
      path.join(surface, 'index.html'),
      '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/main.tsx"></script>',
    );
    await writeFile(
      path.join(surface, 'main.tsx'),
      `import React from 'react';import{createRoot}from'react-dom/client';import Clipboard from ${JSON.stringify(path.join(source, 'src/Clipboard.tsx'))};import ${JSON.stringify(path.join(source, 'src/styles.css'))};import ${JSON.stringify(path.join(source, 'src/redesign.css'))};const root=createRoot(document.getElementById('root'));const render=items=>root.render(<Clipboard items={items} full onOpen={()=>{}} onDelete={()=>{}}/>);window.loadBenchmark=()=>fetch('/fixture').then(r=>r.json()).then(render);render([]);`,
    );
    await build({
      root: surface,
      configFile: false,
      envFile: false,
      logLevel: 'error',
      esbuild: { jsx: 'automatic' },
      resolve: {
        alias: {
          react: path.join(root, 'node_modules/react'),
          'react-dom': path.join(root, 'node_modules/react-dom'),
        },
      },
      build: { outDir: 'dist' },
    });
    surfaces[mode] = path.join(surface, 'dist');
  }
  for (const count of [150, 500, 1000]) {
    const library = new LibraryStore(path.join(temporary, 'data-' + count)),
      items = Array.from({ length: count }, (_, n) => capture(n));
    const compact = JSON.stringify({ version: 1, items, theme: themes[0] });
    await library.write({ baseRevision: 0, workspace: compact, fonts: { [fontHash]: font } });
    const index = await library.summaries(),
      summaryBytes = Buffer.byteLength(JSON.stringify(index));
    const timings = [];
    let revision = index.items[0].itemRevision;
    for (let n = 0; n < 25; n++) {
      const start = performance.now();
      const saved = await library.put({
        id: 'bench-0',
        baseRevision: revision,
        metadata: { name: 'Renamed ' + n },
      });
      revision = saved.itemRevision;
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    const run = {
      count,
      legacyCompactBytes: Buffer.byteLength(compact),
      summaryBytes,
      metadataSaveP95Ms: Math.round(timings[Math.floor(timings.length * 0.95)] * 100) / 100,
      metadataSourceBytesUploaded: 0,
    };
    for (const mode of count === 150 ? ['baseline', 'current'] : ['current']) {
      const app = express();
      mountLibrary(app, express, library, { thumbnail: (data, hash) => thumbs.get(data, hash) });
      app.get('/fixture', async (_req, res) => {
        if (mode === 'baseline') {
          const full = JSON.parse((await library.read()).workspace);
          res.json(full.items);
        } else res.json((await library.summaries()).items);
      });
      app.use(express.static(surfaces[mode]));
      listener = await new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
      });
      if (mode === 'current') {
        const http = [];
        for (let n = 0; n < 25; n++) {
          const start = performance.now();
          const response = await fetch(
            'http://127.0.0.1:' + listener.address().port + '/api/library/items/bench-0',
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ baseRevision: revision, metadata: { tags: ['bench-' + n] } }),
            },
          );
          const saved = await response.json();
          if (!response.ok) throw Error(saved.error);
          revision = saved.itemRevision;
          http.push(performance.now() - start);
        }
        http.sort((a, b) => a - b);
        run.metadataHttpP95Ms = Math.round(http[Math.floor(http.length * 0.95)] * 100) / 100;
      }
      chromeServer = await chromium.launchServer({ headless: true });
      browser = await chromium.connect(chromeServer.wsEndpoint());
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
        pid = chromeServer.process().pid;
      const coldStart = performance.now();
      await page.goto('http://127.0.0.1:' + listener.address().port);
      await page.getByRole('heading', { name: /Your (clipboard|Library)/ }).waitFor();
      await page.waitForLoadState('networkidle');
      const coldShellMs = Math.round(performance.now() - coldStart);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('HeapProfiler.collectGarbage');
      const initialHeap = (await cdp.send('Runtime.getHeapUsage')).usedSize,
        initialRSS = await rss(pid),
        start = performance.now();
      await page.evaluate(() => window.loadBenchmark());
      await page.locator('.clip-card').nth(23).waitFor();
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('.clip-card iframe')).every(
          (f) => f.contentDocument?.readyState === 'complete',
        ),
      );
      await page.evaluate(() =>
        Promise.all(
          Array.from(document.querySelectorAll('.clip-card iframe')).map(
            (f) => f.contentDocument?.fonts.ready,
          ),
        ),
      );
      const loaded = performance.now() - start;
      const countFrames = await page.locator('.clip-card iframe').count();
      await cdp.send('HeapProfiler.collectGarbage');
      const metrics = await cdp.send('Runtime.getHeapUsage'),
        finalRSS = await rss(pid);
      run[mode] = {
        coldShellMs,
        loadMs: Math.round(loaded),
        incrementalRendererHeapBytes: Math.max(0, metrics.usedSize - initialHeap),
        cardIframes: countFrames,
        rendererHeapBytes: metrics.usedSize,
        incrementalBrowserRSSBytes: Math.max(0, finalRSS - initialRSS),
      };
      await page.screenshot({ path: `/tmp/reframe-library-${mode}-${count}.png` });
      await browser.close();
      browser = null;
      await chromeServer.close();
      chromeServer = null;
      await new Promise((resolve) => listener.close(resolve));
      listener = null;
    }
    if (run.baseline)
      run.memoryReductionPercent =
        Math.round(
          (1 - run.current.incrementalBrowserRSSBytes / run.baseline.incrementalBrowserRSSBytes) *
            1000,
        ) / 10;
    results.push(run);
    console.log(JSON.stringify(run));
  }
  await mkdir('docs/evidence', { recursive: true });
  await writeFile(
    'docs/evidence/library-benchmark-2026-10-23.json',
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        method:
          'Isolated production Library surface; baseline HEAD 2f5bdde versus current, 24 visible cards. Library increments are measured after an empty Library shell has loaded; cold shell latency is reported separately. Process-tree RSS includes shared-page double counting; compare same-method deltas. Local filesystem metadata save times exclude HTTP latency; metadataHttpP95Ms separately measures 25 loopback PATCH requests. The separate cold-start JSON retains the first measurement including initial browser/app overhead.',
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await chromeServer?.close();
  if (listener) await new Promise((resolve) => listener.close(resolve));
  await thumbs.close();
  await reference.close();
  await rm(temporary, { recursive: true, force: true });
}
