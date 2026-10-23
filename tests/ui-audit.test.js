import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'vite';
import { chromium } from 'playwright';

test(
  'clipboard stress cases, pagination and named keyboard-accessible capture',
  { timeout: 120000 },
  async () => {
    await mkdir('.reframe', { recursive: true });
    const root = await mkdtemp(path.resolve('.reframe/ui-audit-test-'));
    let server, browser;
    try {
      await writeFile(
        path.join(root, 'index.html'),
        '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/main.tsx"></script>',
      );
      await writeFile(path.join(root, 'main.tsx'), await readFile('tests/fixtures/ui-audit.tsx'));
      await build({
        root,
        configFile: false,
        envFile: false,
        logLevel: 'error',
        esbuild: { jsx: 'automatic' },
        build: { outDir: 'dist' },
      });
      server = createServer(async (req, res) => {
        try {
          const name = new URL(req.url, 'http://localhost').pathname;
          const file = name === '/' ? 'index.html' : name.slice(1);
          res.setHeader(
            'Content-Type',
            file.endsWith('.js')
              ? 'text/javascript'
              : file.endsWith('.css')
                ? 'text/css'
                : 'text/html',
          );
          res.end(await readFile(path.join(root, 'dist', file)));
        } catch {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const base = 'http://127.0.0.1:' + server.address().port;
      try {
        browser = await chromium.launch({ headless: true, channel: 'chrome' });
      } catch {
        browser = await chromium.launch({ headless: true });
      }
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/api/status', (r) =>
        r.fulfill({ json: { vision: true, openAI: false } }),
      );
      await page.route('**/api/capture', (r) =>
        r.fulfill({ json: { title: 'Fixture', source: 'Fixture', items: [] } }),
      );
      for (const width of [320, 390, 825, 1440])
        for (const appearance of ['light', 'dark']) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${base}/?data=worst&appearance=${appearance}`);
          assert.equal(await page.locator('.clip-card').count(), 6);
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `No page overflow at ${width}/${appearance}`,
          );
          assert.ok(
            await page
              .locator('.clip-title>.text-button')
              .evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth + 1)),
            'Names wrap without losing text',
          );
          assert.ok(
            await page
              .locator('.clip-source')
              .evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth + 1)),
            'Sources wrap',
          );
          if (width === 320 && appearance === 'dark')
            await page.screenshot({
              path: '/tmp/reframe-clipboard-stress-mobile.png',
              fullPage: true,
            });
        }
      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(`${base}/?data=worst&dir=rtl&largeText=1`);
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('button', { name: 'one', exact: true }).click();
      assert.equal(
        await page.locator('.clipboard-result-count').innerText(),
        'Showing 1 of 1 matching component',
      );
      await page.getByRole('button', { name: 'empty', exact: true }).click();
      await page.getByText('A home for your next good idea.').waitFor();
      await page.getByRole('button', { name: 'large', exact: true }).click();
      assert.equal(await page.locator('.clip-card').count(), 24);
      await page.getByRole('button', { name: 'Show more · 176 remaining' }).click();
      assert.equal(await page.locator('.clip-card').count(), 48);
      await page.getByRole('searchbox', { name: 'Search Library' }).fill('No such component');
      await page.getByText('No components match these filters and “No such component”.').waitFor();
      await page.getByRole('button', { name: 'Clear filters' }).click();
      assert.equal(await page.locator('.clip-card').count(), 24);
      await page.getByRole('button', { name: 'Worst case', exact: true }).click();
      await page.getByRole('button', { name: 'Open J', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.getByLabel('Selected component').innerText(), 'J');
      const trigger = page.getByRole('button', { name: 'Test capture', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Bring an idea in' });
      await dialog.waitFor();
      assert.equal(
        await dialog
          .getByRole('button', { name: 'HTML', exact: true })
          .getAttribute('aria-pressed'),
        'true',
      );
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
      await trigger.click();
      await dialog
        .getByRole('textbox', { name: 'HTML source', exact: true })
        .fill('<section><button>Save</button></section>');
      await dialog.getByRole('button', { name: 'Capture elements' }).click();
      await page.getByLabel('Selected component').getByText('Captured', { exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      if (server) await new Promise((r) => server.close(r));
      await rm(root, { recursive: true, force: true });
    }
  },
);
