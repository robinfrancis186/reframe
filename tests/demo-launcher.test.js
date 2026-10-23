import test from 'node:test';
import { createServer } from 'node:http';
import { prepareReplica, buildReplicaFeature } from '../server/replica.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { desktopDemo } from '../server/desktop-demo.js';
import { DemoLauncher } from '../server/demo-launcher.js';
import { Projects } from '../server/projects.js';
import { inspectFeature, buildFeature } from '../server/features.js';

const html =
  '<section><h2>Join the list</h2><label>Email<input type="email" required></label><button>Subscribe</button></section>';

test(
  'owned demo launches installed frontend and backend, persists records, restarts and cleans up without project scripts or credentials',
  { timeout: 90000 },
  async () => {
    const store = await mkdtemp(path.join(tmpdir(), 'reframe-demo-launch-'));
    const projects = new Projects(store),
      launcher = new DemoLauncher(store, projects);
    let browser;
    const parent = createServer((_req, res) =>
      res.end(
        `<iframe title="Owned demo" src="${launcher.status()?.url}" style="width:100%;height:900px"></iframe>`,
      ),
    );
    await new Promise((resolve) => parent.listen(0, '127.0.0.1', resolve));
    launcher.parentOrigin = `http://127.0.0.1:${parent.address().port}`;
    try {
      const folder = await desktopDemo(store, path.resolve('node_modules'));
      const project = await projects.connect(folder);
      assert.equal(project.demo, true);
      const targets = await projects.targets(project.id, 'src/App.tsx');
      const feature = await buildFeature({
        html,
        name: 'Join the list',
        spec: inspectFeature(html),
      });
      const plan = await projects.plan({
        projectId: project.id,
        file: 'src/App.tsx',
        pointId: targets.points.find((p) => p.label.startsWith('section')).id,
        hash: targets.hash,
        html,
        feature,
        name: 'ReframeSubscribe',
      });
      assert.ok(plan.warnings.some((w) => w.startsWith('Launch demo app')));
      assert.ok(plan.warnings.every((w) => !w.includes('npm run reframe:dev')));
      await projects.apply(plan.id);
      // The launcher does not load these editable project files or inherit app secrets.
      await writeFile(
        path.join(folder, 'vite.config.js'),
        "throw new Error('Do not execute project config');",
      );
      await writeFile(path.join(folder, '.env'), 'VITE_PRIVATE_VALUE=never-bundle-this\n');
      const first = await launcher.start(project.id);
      assert.match(first.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
      assert.equal(launcher.targets()[0].url, first.url);
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(first.url);
      await page.getByRole('heading', { name: 'Join the list' }).waitFor();
      await page.getByRole('textbox', { name: 'Email' }).fill('newcomer@example.test');
      await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await page
        .getByRole('button', { name: 'Email: newcomer@example.test', exact: true })
        .waitFor();
      await page.reload();
      await page
        .getByRole('button', { name: 'Email: newcomer@example.test', exact: true })
        .waitFor();
      const child = launcher.session.child;
      const second = await launcher.start(project.id);
      assert.ok(child.exitCode !== null || child.signalCode);
      await page.goto(second.url);
      await page
        .getByRole('button', { name: 'Email: newcomer@example.test', exact: true })
        .waitFor();
      const asset = await page.locator('script[type=module]').getAttribute('src');
      assert.doesNotMatch(
        await (await fetch(new URL(asset, second.url))).text(),
        /never-bundle-this/,
      );
      assert.deepEqual(errors, []);
      const other = path.join(store, 'Other App');
      await mkdir(other);
      await writeFile(path.join(other, 'App.tsx'), 'export default function App(){return <main/>}');
      const external = await projects.connect(other);
      await assert.rejects(launcher.start(external.id), /only for the Reframe demo/);
      assert.equal(launcher.status().url, second.url);
      const siteHTML =
        '<section><h2>Captured website</h2><form><label>Name<input name="name" required></label><button type="submit">Send message</button></form></section>';
      const site = await prepareReplica([
        {
          url: 'https://example.org/',
          title: 'Captured website',
          html: siteHTML,
          css: 'body{font:16px system-ui}',
          rootStyle: '',
          height: 300,
          htmlClass: '',
        },
      ]);
      const siteFeature = await buildReplicaFeature(siteHTML, 'Captured website', site);
      const updated = await projects.targets(project.id, 'src/App.tsx');
      const sitePlan = await projects.plan({
        projectId: project.id,
        file: 'src/App.tsx',
        pointId: updated.points.find((p) => p.label.startsWith('section')).id,
        hash: updated.hash,
        html: siteHTML,
        feature: siteFeature,
        name: 'ReframeWebsite',
      });
      await projects.apply(sitePlan.id);
      const third = await launcher.start(project.id);
      const csp = await fetch(
        third.url + 'api/reframe/' + siteFeature.spec.id + '/site/index.html',
      );
      assert.ok(csp.headers.get('content-security-policy').includes(launcher.parentOrigin));
      assert.doesNotMatch(csp.headers.get('content-security-policy'), /frame-ancestors[^;]*\*/);
      await page.goto(launcher.parentOrigin);
      const nested = page.frameLocator('iframe[title="Owned demo"]').frameLocator('iframe');
      await nested.getByRole('heading', { name: 'Captured website', exact: true }).waitFor();
      await nested.getByRole('textbox', { name: 'Name', exact: true }).fill('New demo visitor');
      await nested.getByRole('button', { name: 'Send message', exact: true }).click();
      await nested.getByRole('status').filter({ hasText: 'Saved locally. Receipt' }).waitFor();
      await page.reload();
      await nested
        .getByRole('status')
        .filter({ hasText: 'Previous request saved locally.' })
        .waitFor();
      assert.deepEqual(errors, []);
      await launcher.close();
      assert.equal(launcher.status(), null);
      await assert.rejects(fetch(second.url));
      assert.match(await readFile(path.join(folder, 'src/App.tsx'), 'utf8'), /ReframeSubscribe/);
    } finally {
      await browser?.close();
      await launcher.close();
      await new Promise((resolve) => parent.close(resolve));
      await rm(store, { recursive: true, force: true });
    }
  },
);
