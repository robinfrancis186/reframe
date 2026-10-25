import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { availablePort } from '../desktop/port.cjs';

// Real UI + APIs + disk storage; a fresh profile needs no key, project folder or terminal.
test(
  'new user captures, defines behavior, reopens, exports, installs and launches a working demo',
  { timeout: 300000 },
  async () => {
    const store = await mkdtemp(path.join(tmpdir(), 'reframe-new-user-'));
    const port = await availablePort();
    const base = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, ['server/index.js'], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PORT: String(port),
        REFRAME_STORE: store,
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    });
    let browser, page;
    const marks = {},
      errors = [],
      requests = [];
    const start = performance.now();
    const mark = (name) => {
      marks[name] = Math.round(performance.now() - start);
    };
    try {
      for (let n = 0; n < 120; n++) {
        try {
          if ((await fetch(base + '/api/health')).ok) break;
        } catch {}
        await delay(100);
      }
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        acceptDownloads: true,
      });
      page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => {
        if (r.url().startsWith(base + '/api/'))
          requests.push({ url: r.url().slice(base.length), method: r.method() });
      });
      await page.goto(base);
      await page.getByRole('heading', { name: 'Good ideas deserve a new home.' }).waitFor();
      mark('home');
      await page.getByRole('button', { name: 'New capture', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Bring an idea in' });
      await dialog.getByRole('button', { name: 'HTML', exact: true }).click();
      await dialog
        .getByRole('textbox', { name: 'HTML source', exact: true })
        .fill(
          '<section style="padding:24px;border-radius:16px;background:#f4f0ff"><h2>Join the list</h2><p>Weekly ideas worth keeping.</p><label>Email<input type="email" required></label><button>Subscribe</button></section>',
        );
      await dialog.getByRole('button', { name: 'Capture elements' }).click();
      await page
        .getByRole('textbox', { name: 'Component name', exact: true })
        .fill('Weekly newsletter');
      mark('captured');
      assert.equal(await page.locator('.editor-options[open]').count(), 0);
      await page.getByRole('button', { name: 'Define behavior', exact: true }).click();
      await page.getByRole('combobox', { name: 'Behavior for Subscribe' }).selectOption('create');
      await page.getByRole('button', { name: 'Build working component' }).click();
      const builder = page.locator('.feature-builder');
      await builder
        .getByRole('button', { name: 'Edit behavior', exact: true })
        .waitFor({ timeout: 60000 });
      await builder.getByRole('button', { name: 'Edit behavior', exact: true }).click();
      assert.equal(
        await builder.getByRole('combobox', { name: 'Behavior for Subscribe' }).inputValue(),
        'create',
      );
      await builder.getByRole('button', { name: 'Product & cart' }).click();
      await builder.getByRole('button', { name: 'Actions & records' }).click();
      assert.equal(
        await builder.getByRole('combobox', { name: 'Behavior for Subscribe' }).inputValue(),
        'create',
      );
      await builder.getByRole('button', { name: 'Build working component' }).click();
      await builder
        .getByRole('button', { name: 'Save working component' })
        .waitFor({ timeout: 60000 });
      assert.equal(await builder.locator('.generated-source[open]').count(), 0);
      assert.match(
        await builder.getByLabel('Included behavior').innerText(),
        /does not send an email/,
      );
      await builder.getByRole('button', { name: 'Start working preview' }).click();
      const draftPreview = builder.frameLocator('iframe[title^="Working preview:"]');
      await draftPreview.getByRole('textbox', { name: 'Email' }).waitFor();
      await draftPreview.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await draftPreview.getByRole('alert').filter({ hasText: 'Email is required.' }).waitFor();
      await draftPreview.getByRole('textbox', { name: 'Email' }).fill('invalid-email');
      await draftPreview.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await draftPreview.getByRole('alert').filter({ hasText: 'valid email address' }).waitFor();
      await draftPreview.getByRole('textbox', { name: 'Email' }).fill('draft@example.test');
      await draftPreview.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await draftPreview
        .getByRole('button', { name: 'Email: draft@example.test', exact: true })
        .waitFor();
      await page.screenshot({ path: '/tmp/reframe-behavior-builder.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await builder.screenshot({ path: '/tmp/reframe-behavior-builder-mobile.png' });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole('button', { name: 'Save working component' }).click();
      await page
        .locator('.component-journey')
        .getByText('Saved on this computer', { exact: true })
        .waitFor();
      mark('behaviorSaved');
      assert.equal(await page.locator('.feature-builder').count(), 0);
      await page.getByRole('button', { name: 'Start working preview', exact: true }).click();
      const preview = page.frameLocator('iframe[title^="Working preview:"]');
      await preview.getByRole('textbox', { name: 'Email' }).fill('preview@example.test');
      await preview.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await preview
        .getByRole('button', { name: 'Email: preview@example.test', exact: true })
        .waitFor();
      mark('workingPreview');
      await page.screenshot({ path: '/tmp/reframe-new-user-editor.png', fullPage: true });
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      await page.getByRole('heading', { name: 'Your Library' }).waitFor();
      assert.equal(await page.locator('.clip-card iframe').count(), 0);
      assert.equal(await page.locator('#library-facets').isVisible(), false);
      await page.getByRole('button', { name: 'Filters & sort', exact: true }).press('Enter');
      await page.getByRole('button', { name: /UI \+ backend/ }).click();
      await page.getByRole('button', { name: /Filters & sort/ }).click();
      assert.match(
        await page.getByRole('button', { name: /Filters & sort/ }).innerText(),
        /1 active/,
      );
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await page.getByRole('searchbox', { name: 'Search Library' }).fill('weekly');
      const card = page.locator('.clip-card');
      assert.equal(await card.count(), 1);
      await card.getByLabel('More options for Weekly newsletter').press('Enter');
      await card.getByRole('button', { name: 'Organise Weekly newsletter', exact: true }).click();
      await card.getByRole('textbox', { name: 'Name', exact: true }).fill('Discard this change');
      await card.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(
        await card.getByRole('button', { name: 'Weekly newsletter', exact: true }).count(),
        1,
      );
      await card.getByLabel('More options for Weekly newsletter').press('Enter');
      await card.getByRole('button', { name: 'Open Weekly newsletter', exact: true }).click();
      await page
        .locator('.component-journey')
        .getByText('Saved on this computer', { exact: true })
        .waitFor();
      mark('reopened');
      const webDrop = page.getByRole('region', { name: 'Use in any website' });
      await webDrop.getByRole('button', { name: 'Prepare for my website' }).click();
      const embed = webDrop.getByRole('textbox', { name: 'Website embed code' });
      await embed.waitFor();
      assert.match(await embed.inputValue(), /<iframe.*style="width:100%/);
      await webDrop.getByRole('combobox', { name: 'Paste into' }).selectOption('jsx');
      assert.match(await embed.inputValue(), /style=\{\{/);
      const packageDownload = page.waitForEvent('download');
      await webDrop.getByRole('link', { name: 'Download standalone package' }).click();
      assert.match((await packageDownload).suggestedFilename(), /web-component.zip$/);
      const portablePage = await context.newPage();
      portablePage.on('pageerror', (e) => errors.push(e.message));
      await portablePage.goto(
        await webDrop.getByRole('link', { name: 'Try working component ↗' }).getAttribute('href'),
      );
      await portablePage.getByRole('textbox', { name: 'Email' }).fill('portable@example.test');
      await portablePage.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await portablePage
        .getByRole('button', { name: 'Email: portable@example.test', exact: true })
        .waitFor();
      await portablePage.reload();
      await portablePage
        .getByRole('button', { name: 'Email: portable@example.test', exact: true })
        .waitFor();
      await portablePage.close();
      await page.screenshot({ path: '/tmp/reframe-new-user-web-drop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: '/tmp/reframe-new-user-web-drop-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
      await webDrop.getByText('What is included?', { exact: true }).click();
      await webDrop.getByRole('button', { name: 'Stop local component' }).click();
      await webDrop.getByRole('button', { name: 'Prepare for my website' }).waitFor();
      mark('portableWebComponent');
      await page.getByText('Export & code options', { exact: true }).click();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export UI + backend package' }).click();
      assert.match((await downloadEvent).suggestedFilename(), /feature.json$/);
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      await page.screenshot({ path: '/tmp/reframe-new-user-library.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: '/tmp/reframe-new-user-library-mobile.png', fullPage: true });
      await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: '/tmp/reframe-new-user-library-mobile-light.png',
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole('button', { name: 'Fit & install Weekly newsletter' }).click();
      await page.getByRole('button', { name: 'Use demo app', exact: true }).click();
      await page.getByRole('button', { name: 'Review installation', exact: true }).click();
      const review = page.getByRole('region', { name: 'Review installation', exact: true });
      await review.waitFor({ timeout: 60000 });
      assert.equal(await review.locator('.installation-source[open]').count(), 0);
      assert.ok(
        await review.getByRole('button', { name: 'Install component', exact: true }).isDisabled(),
      );
      assert.match(await review.innerText(), /No terminal needed/);
      await review.getByRole('button', { name: 'Back to placement' }).click();
      await page.getByRole('button', { name: 'Review installation', exact: true }).click();
      await review.waitFor({ timeout: 60000 });
      await review.screenshot({ path: '/tmp/reframe-installation-review.png' });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await review.screenshot({ path: '/tmp/reframe-installation-review-mobile.png' });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page
        .getByRole('checkbox', { name: /Allow these files to be added or updated in/ })
        .check();
      await page.getByRole('button', { name: 'Install component', exact: true }).click();
      await page
        .locator('.integration-status')
        .filter({ hasText: 'Installed in the demo app. Choose Launch demo app below to test it.' })
        .waitFor();
      const receipt = page.getByRole('region', { name: 'Test installed component' });
      await receipt.getByRole('button', { name: 'Launch demo app', exact: true }).click();
      const link = receipt.getByRole('link', { name: 'Open demo app ↗' });
      await link.waitFor({ timeout: 60000 });
      const demoUrl = await link.getAttribute('href');
      mark('installedAndLaunched');
      const demo = await context.newPage();
      demo.setDefaultTimeout(15000);
      demo.on('pageerror', (e) => errors.push(e.message));
      await demo.goto(demoUrl);
      await demo.getByRole('textbox', { name: 'Email' }).fill('installed@example.test');
      await demo.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await demo
        .getByRole('button', { name: 'Email: installed@example.test', exact: true })
        .waitFor();
      await demo.reload();
      await demo
        .getByRole('button', { name: 'Email: installed@example.test', exact: true })
        .waitFor();
      assert.equal(await demo.getByText('Email: preview@example.test', { exact: true }).count(), 0);
      assert.equal(await demo.getByText('Email: draft@example.test', { exact: true }).count(), 0);
      mark('persistedAfterReload');
      await demo.screenshot({ path: '/tmp/reframe-new-user-installed-demo.png', fullPage: true });
      await page.screenshot({ path: '/tmp/reframe-new-user-install-receipt.png', fullPage: true });
      assert.deepEqual(errors, []);
      assert.equal(
        requests.filter((r) => r.url === '/api/library' && r.method === 'PUT').length,
        0,
      );
      assert.equal(requests.filter((r) => r.url.includes('/api/export/assist')).length, 0);
      const saved = await (await fetch(base + '/api/library/index')).json();
      assert.equal(saved.items.length, 1);
      await writeFile(
        '/tmp/reframe-new-user-flow.json',
        JSON.stringify(
          { base, marks, errors, requests, libraryItems: saved.items.length, demoUrl },
          null,
          2,
        ),
      );
      await fetch(base + '/api/projects/demo/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      await assert.rejects(fetch(demoUrl));
    } catch (error) {
      if (page) {
        console.error('Page errors:', errors);
        console.error((await page.locator('body').innerText()).slice(-12000));
        await page.screenshot({ path: '/tmp/reframe-new-user-failure.png', fullPage: true });
      }
      throw error;
    } finally {
      await browser?.close();
      server.kill('SIGTERM');
      if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
      await rm(store, { recursive: true, force: true });
    }
  },
);
