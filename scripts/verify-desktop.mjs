import { _electron } from 'playwright';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readOnlyVolume } from '../desktop/portable.cjs';
const store = await mkdtemp(path.join(tmpdir(), 'reframe-ux-desktop-')),
  profile = await mkdtemp(path.join(tmpdir(), 'reframe-ux-electron-profile-'));
const executablePath = path.resolve(
  process.argv[2] || 'out/Reframe-darwin-arm64/Reframe.app/Contents/MacOS/Reframe',
);
const env = {
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  HOME: process.env.HOME,
  REFRAME_DESKTOP_TEST_STORE: store,
};
let app,
  page,
  base,
  demoUrl,
  ids = [];
const errors = [],
  start = performance.now(),
  timings = [],
  responses = [];
const observed = new WeakMap();
const tree = (root) => {
  const rows = execFileSync('/bin/ps', ['-Ao', 'pid=,ppid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((s) => s.trim().split(/\s+/).map(Number));
  const found = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows)
      if (found.has(ppid) && !found.has(pid)) {
        found.add(pid);
        changed = true;
      }
  }
  return [...found];
};
try {
  app = await _electron.launch({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    env,
    timeout: 60000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(60000);
  page.on('request', (r) => observed.set(r, performance.now()));
  page.on('response', (r) => {
    if (
      /\/api\/(features\/build|projects\/plan|browser\/tabs|browser\/action)$/.test(r.url()) &&
      r.request().method() === 'POST'
    )
      responses.push(
        (async () => {
          const body = await r.json();
          timings.push({
            endpoint: new URL(r.url()).pathname,
            ms: Math.round(performance.now() - observed.get(r.request())),
            reused: body.analysis?.reused ?? body.review?.analysis?.reused,
            status: r.status(),
          });
        })(),
      );
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForURL(/127\.0\.0\.1/);
  base = new URL(page.url()).origin;
  await page.getByRole('heading', { name: 'Good ideas deserve a new home.' }).waitFor();
  const homeReadyMs = Math.round(performance.now() - start);
  await assert.rejects(
    page.evaluate(() => window.reframeDesktop.retryStartup()),
    /Invalid recovery request/,
  );
  const screenshot = await page.locator('.home-main').screenshot();
  const ocrStarted = performance.now();
  const reconstructed = await page.request.post(base + '/api/reconstruct', {
    timeout: 45000,
    data: { engine: 'local', image: 'data:image/png;base64,' + screenshot.toString('base64') },
  });
  assert.equal(reconstructed.status(), 200);
  assert.equal((await reconstructed.json()).engine, 'macOS Vision OCR');
  const ocrMs = Math.round(performance.now() - ocrStarted);
  await page.getByRole('button', { name: 'New capture', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bring an idea in' });
  await dialog.getByRole('button', { name: 'HTML', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'HTML source', exact: true })
    .fill(
      '<section><h2>Desktop newsletter</h2><label>Email<input type="email" required></label><button>Subscribe</button></section>',
    );
  await dialog.getByRole('button', { name: 'Capture elements' }).click();
  await page
    .getByRole('textbox', { name: 'Component name', exact: true })
    .fill('Desktop newsletter');
  await page.getByRole('button', { name: 'Define behavior', exact: true }).click();
  await page.getByRole('combobox', { name: 'Behavior for Subscribe' }).selectOption('create');
  await page.getByRole('button', { name: 'Build working component' }).click();
  await page.getByRole('button', { name: 'Start working preview', exact: true }).click();
  const preview = page.frameLocator('iframe[title^="Working preview:"]');
  await preview.getByRole('textbox', { name: 'Email' }).waitFor();
  await preview.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await preview.getByRole('alert').filter({ hasText: 'Email is required.' }).waitFor();
  await preview.getByRole('textbox', { name: 'Email' }).fill('preview-only@example.test');
  await preview.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await preview
    .getByRole('button', { name: 'Email: preview-only@example.test', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Save working component' }).click();
  await page
    .locator('.component-journey')
    .getByText('Saved on this computer', { exact: true })
    .waitFor();
  assert.equal(await page.locator('.feature-builder').count(), 0);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Fit & install Desktop newsletter' }).click();
  await page.getByRole('button', { name: 'Use demo app', exact: true }).click();
  await page.getByRole('button', { name: 'Review installation', exact: true }).click();
  await page.getByRole('checkbox', { name: /Allow these files to be added or updated in/ }).check();
  await page.getByRole('button', { name: 'Install component', exact: true }).click();
  await page.getByRole('button', { name: 'Launch demo app', exact: true }).click();
  const link = page.getByRole('link', { name: 'Open demo app ↗' });
  await link.waitFor();
  demoUrl = await link.getAttribute('href');
  const demo = page.frameLocator('iframe[title="Installed demo app"]');
  await demo.getByRole('textbox', { name: 'Email' }).fill('desktop@example.test');
  await demo.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await demo.getByRole('button', { name: 'Email: desktop@example.test', exact: true }).waitFor();
  const frame = page.frames().find((f) => f.url() === demoUrl);
  await frame.goto(demoUrl);
  await demo.getByRole('button', { name: 'Email: desktop@example.test', exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/reframe-packaged-demo-flow.png', fullPage: true });
  // A second component exercises bundled Chromium and prevents default import-name collisions.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: /Browse & pick Pick a reference/ }).click();
  await page.getByRole('textbox', { name: 'Browser address' }).fill('https://example.com');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const sourceImage = page.getByRole('img', { name: /Interactive browser view of Example Domain/ });
  await sourceImage.waitFor({ timeout: 120000 });
  await page.getByRole('button', { name: 'Pick element', exact: true }).click();
  const box = await sourceImage.boundingBox();
  await sourceImage.click({ position: { x: box.width * 0.5, y: box.height * 0.33 } });
  await page.getByRole('button', { name: 'Save directly to Library' }).click();
  await page
    .locator('.browser-feedback')
    .filter({ hasText: 'Saved to Library, including the original reference image.' })
    .waitFor();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const captured = page.locator('.clip-card').filter({ hasNotText: 'Desktop newsletter' });
  assert.equal(await captured.count(), 1);
  await captured.getByRole('button', { name: /Fit & install/ }).click();
  await page.getByRole('button', { name: 'Use demo app', exact: true }).click();
  await page.getByRole('button', { name: 'Review installation', exact: true }).click();
  await page.getByRole('checkbox', { name: /Allow these files to be added or updated in/ }).check();
  await page.getByRole('button', { name: 'Install component', exact: true }).click();
  await page.getByRole('button', { name: 'Launch demo app', exact: true }).click();
  await page.getByRole('link', { name: 'Open demo app ↗' }).waitFor();
  demoUrl = await page.getByRole('link', { name: 'Open demo app ↗' }).getAttribute('href');
  const combined = page.frameLocator('iframe[title="Installed demo app"]');
  await combined
    .getByRole('button', { name: 'Email: desktop@example.test', exact: true })
    .waitFor();
  await combined
    .frameLocator('iframe')
    .getByText(/This domain is for use in documentation examples/)
    .waitFor();
  await page.locator('iframe[title="Installed demo app"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/reframe-packaged-two-components.png', fullPage: false });
  await Promise.all(responses);
  assert.equal(timings.find((t) => t.endpoint === '/api/projects/plan').reused, true);
  // Browser captures are reviewed for the first time during installation; fresh analysis is expected there.
  const security = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
    };
  });
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  assert.equal(await page.evaluate(() => typeof process), 'undefined');
  assert.deepEqual(errors, []);
  const library = await (await fetch(base + '/api/library/index')).json();
  const item = await (
    await fetch(
      base + '/api/library/items/' + library.items.find((i) => i.name === 'Desktop newsletter').id,
    )
  ).json();
  ids = tree(app.process().pid);
  await app.close();
  app = null;
  await assert.rejects(fetch(demoUrl));
  await assert.rejects(fetch(base + '/api/health'));
  const alive = ids.filter((pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(alive, []);
  const restartStarted = performance.now();
  app = await _electron.launch({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    env,
    timeout: 60000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  await page.waitForURL(/127\.0\.0\.1/);
  await page.getByRole('heading', { name: 'Good ideas deserve a new home.' }).waitFor();
  const restartHomeMs = Math.round(performance.now() - restartStarted);
  base = new URL(page.url()).origin;
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Use demo app', exact: true }).click();
  await page.getByRole('button', { name: 'Launch demo app', exact: true }).click();
  await page.getByRole('link', { name: 'Open demo app ↗' }).waitFor();
  const restarted = await page.getByRole('link', { name: 'Open demo app ↗' }).getAttribute('href');
  const records = await (await fetch(restarted + 'api/reframe/' + item.feature.spec.id)).json();
  assert.ok(JSON.stringify(records).includes('desktop@example.test'));
  assert.ok(!JSON.stringify(records).includes('preview-only@example.test'));
  const backendRow = execFileSync('/bin/ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8' })
    .split('\n')
    .find((row) => {
      const fields = row.trim().split(/\s+/);
      return Number(fields[1]) === app.process().pid && row.includes('/server/index.js');
    });
  assert.ok(backendRow, 'the packaged backend is an owned child');
  process.kill(Number(backendRow.trim().split(/\s+/)[0]), 'SIGTERM');
  await page.getByRole('heading', { name: 'Your work is still here.' }).waitFor();
  await page.screenshot({ path: '/tmp/reframe-packaged-recovery.png' });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('heading', { name: 'Good ideas deserve a new home.' }).waitFor();
  const recoveredLibrary = await (await fetch(base + '/api/library/index')).json();
  assert.equal(recoveredLibrary.items.length, library.items.length);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Use demo app', exact: true }).click();
  await page.getByRole('button', { name: 'Launch demo app', exact: true }).click();
  const recoveredDemo = await page
    .getByRole('link', { name: 'Open demo app ↗' })
    .getAttribute('href');
  const recoveredRecords = await (
    await fetch(recoveredDemo + 'api/reframe/' + item.feature.spec.id)
  ).json();
  assert.ok(JSON.stringify(recoveredRecords).includes('desktop@example.test'));
  // Exercise the packaged import bridge after moving backend modules into the archive.
  const incomingFolder = path.join(store, 'import-fixture');
  await mkdir(incomingFolder);
  await writeFile(
    path.join(incomingFolder, 'workspace.json'),
    JSON.stringify(await (await fetch(base + '/api/library')).json()),
  );
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, incomingFolder);
  const imported = await page.evaluate(() => window.reframeDesktop.importLibrary());
  assert.equal(imported.imported, library.items.length);
  assert.equal(
    (await (await fetch(base + '/api/library/index')).json()).items.length,
    library.items.length * 2,
  );
  const startupPhases = (await readFile(path.join(store, 'desktop.log'), 'utf8'))
    .split('\n')
    .filter((line) => line.startsWith('{"phase":'))
    .map((line) => JSON.parse(line));
  assert.ok(startupPhases.filter((entry) => entry.phase === 'home-ready').length >= 3);
  const launchedFromReadOnlyVolume = await readOnlyVolume(executablePath);
  assert.equal(startupPhases.filter((entry) => entry.phase === 'runtime-cache-prepared').length, 1);
  assert.equal(startupPhases.filter((entry) => entry.phase === 'runtime-cache-reused').length, 1);
  assert.ok(backendRow.includes('/engine-cache/'));
  await app.close();
  app = null;
  assert.ok((await readdir(path.join(profile, 'compile-cache'), { recursive: true })).length > 2);
  await assert.rejects(fetch(restarted));
  await assert.rejects(
    access(path.resolve(path.dirname(executablePath), '../Resources/app/.reframe')),
    { code: 'ENOENT' },
  );
  const proof = {
    artifact: executablePath,
    homeReadyMs,
    restartHomeMs,
    launchedFromReadOnlyVolume,
    startupPhases,
    recoveryRetainedLibraryAndRecords: true,
    publicSiteCaptured: true,
    twoComponentsInstalled: true,
    timings,
    elapsedMs: Math.round(performance.now() - start),
    libraryItems: library.items.length,
    security,
    errors,
    ownedProcessesClosed: ids.length,
    restartRecordsPersisted: true,
    packagedLibraryImport: true,
    compileCacheWritten: true,
    bundledOCR: true,
    ocrMs,
    appBundleStoreAbsent: true,
    systemPathOnly: env.PATH,
  };
  await writeFile('/tmp/reframe-packaged-demo-flow.json', JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} catch (error) {
  console.error('Analysis timings:', timings);
  await writeFile(
    '/tmp/reframe-packaged-backend-failure.log',
    await readFile(path.join(store, 'desktop.log')).catch(() => ''),
  ).catch(() => {});
  if (page) {
    console.error(
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
    );
    await page
      .screenshot({ path: '/tmp/reframe-packaged-demo-failure.png', fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  await app?.close();
  await rm(store, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
