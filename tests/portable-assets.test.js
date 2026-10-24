import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareReplica,
  validateReplica,
  replicaHTML,
  replicaCSS,
  buildReplicaFeature,
} from '../server/replica.js';
import { bundleImages, safeImageData } from '../server/portable-assets.js';
import { reuseReport } from '../src/reuse-report.js';
import { componentSignature } from '../src/component-workflow.js';
import { exportComponentCode } from '../server/code-export.js';
import { checkReuse } from '../server/reuse-check.js';
import { build } from 'esbuild';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6eXYAAAAASUVORK5CYII=',
  'base64',
);
const pdf = Buffer.from('%PDF-1.7\nPortable fixture\n%%EOF');
const raw = {
  url: 'https://example.com/about',
  title: 'About',
  component: true,
  height: 300,
  html: '<section class="card"><img loading="lazy" style="display:none" src="/portrait.png" alt="Portrait"><a href="/cv.pdf" download="cv.pdf">Download CV</a></section>',
  css: '.card{background-image:url("https://example.com/portrait.png")}',
  rootStyle: '',
  htmlClass: '',
};
const resource = async (url) => ({
  status: 200,
  headers: {},
  body: url.endsWith('.pdf') ? pdf : png,
});
const itemFor = async (site) => ({
  id: 'portable',
  name: 'About',
  html: '<section>About</section>',
  source: raw.url,
  feature: await buildReplicaFeature('<section>About</section>', 'About', site),
});

test('capture bundles images and CSS resources once, keeps PDFs, and survives validation and both exports', async () => {
  const requests = [];
  const site = await prepareReplica([raw], {
    resource: async (url) => {
      requests.push(url);
      return resource(url);
    },
  });
  assert.equal(requests.filter((url) => url.endsWith('portrait.png')).length, 1);
  assert.match(site.pages[0].html, /src="data:image\/png;base64,/);
  assert.match(site.css, /url\("data:image\/png;base64,/);
  assert.deepEqual(validateReplica(site), site);
  const item = await itemFor(site),
    report = reuseReport(item);
  assert.equal(report.images, 1);
  assert.equal(report.backgrounds, 1);
  assert.equal(report.downloads, 1);
  assert.equal(report.selfContained, true);
  for (const mode of ['faithful', 'clean']) {
    const code = exportComponentCode(item, { mode });
    assert.match(code.files[code.name + '.tsx'], /data:image\/png;base64/);
    assert.match(code.css, /data:image\/png;base64/);
    await build({
      stdin: { contents: code.files[code.name + '.tsx'], loader: 'tsx' },
      write: false,
      bundle: false,
      logLevel: 'silent',
    });
  }
});
test('relative redirects resolve once, all hops use the broker, and no source credentials are forwarded', async () => {
  const calls = [];
  const site = await prepareReplica(
    [{ ...raw, html: '<img src="https://example.com/assets/a.png">', css: '' }],
    {
      resource: async (url, headers) => {
        calls.push({ url, headers });
        if (calls.length === 1)
          return { status: 302, headers: { location: 'v2/b.png' }, body: Buffer.alloc(0) };
        if (calls.length === 2)
          return {
            status: 307,
            headers: { location: 'https://cdn.example.com/c.png' },
            body: Buffer.alloc(0),
          };
        return resource(url);
      },
    },
  );
  assert.deepEqual(
    calls.map((c) => c.url),
    [
      'https://example.com/assets/a.png',
      'https://example.com/assets/v2/b.png',
      'https://cdn.example.com/c.png',
    ],
  );
  assert.ok(calls.every((c) => !c.headers.cookie && !c.headers.authorization));
  assert.match(site.pages[0].html, /data:image/);
});
test('unavailable, oversized and active image documents remain external and never claim self containment', async () => {
  for (const body of [
    Buffer.from('<svg onload="alert(1)"/>'),
    Buffer.concat([png, Buffer.alloc(750000)]),
  ]) {
    const site = await prepareReplica(
      [{ ...raw, html: '<img src="https://example.com/image">', css: '' }],
      { resource: async () => ({ status: 200, headers: {}, body }) },
    );
    assert.equal(reuseReport(await itemFor(site)).selfContained, false);
    assert.ok(site.warnings.some((w) => w.includes('external')));
  }
  const old = { version: 1, pages: [raw], css: '', attachments: [], warnings: [] };
  assert.equal(reuseReport(await itemFor(validateReplica(old))).selfContained, false);
});
test('untrusted image data is validated and private redirected resources use public-network validation', async () => {
  assert.equal(safeImageData('data:image/png;base64,' + png.toString('base64')), true);
  assert.equal(
    safeImageData('data:image/png;base64,' + Buffer.from('<script>x</script>').toString('base64')),
    false,
  );
  // Self-contained SVG images are kept; scripted or externally referencing ones are not.
  assert.match(replicaHTML('<img src="data:image/svg+xml;base64,PHN2Zz4=">'), /src=/);
  for (const svg of [
    '<svg onload="alert(1)"></svg>',
    '<svg><script>alert(1)</script></svg>',
    '<svg><image href="https://tracker.example/p.png"/></svg>',
  ])
    assert.doesNotMatch(
      replicaHTML(`<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`),
      /src=/,
    );
  assert.equal(
    replicaCSS('a{background:url(data:image/png;base64,PHN2Zz4=)}'),
    'a{background:none}',
  );
  const site = {
    version: 1,
    pages: [{ ...raw, html: '<img src="http://127.0.0.1/private">' }],
    css: '',
    attachments: [],
    warnings: [],
  };
  await bundleImages(site);
  assert.match(site.warnings[0], /Private and local/);
});
test('asset changes invalidate dirty tracking even when captured source HTML stays the same', async () => {
  const legacy = await itemFor(
    validateReplica({ version: 1, pages: [raw], css: '', attachments: [], warnings: [] }),
  );
  const portable = {
    ...legacy,
    feature: await buildReplicaFeature(
      legacy.html,
      legacy.name,
      await bundleImages(validateReplica(legacy.feature.spec.website), resource),
      legacy.feature.spec.id,
    ),
  };
  assert.notEqual(componentSignature(legacy), componentSignature(portable));
});
test(
  'source-blocked report really loads bundled images and clicks PDF downloads at two widths',
  { timeout: 60000 },
  async () => {
    const site = await prepareReplica([raw], { resource });
    const result = await checkReuse(await itemFor(site));
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.deepEqual(
      result.views.map((v) => v.width),
      [1280, 390],
    );
    assert.ok(result.views.every((v) => v.images === 1 && v.brokenImages === 0));
    assert.equal(result.downloads[0].bytes, pdf.length);
    assert.equal(result.downloads[0].match, true);
    const legacy = validateReplica({
      version: 1,
      pages: [{ ...raw, html: '<img src="https://example.com/not-bundled.png">' }],
      css: '',
      attachments: [],
      warnings: [],
    });
    const failed = await checkReuse(await itemFor(legacy));
    assert.equal(failed.passed, false);
    assert.ok(failed.blocked.length > 0);
    assert.ok(failed.views.some((v) => v.brokenImages > 0));
  },
);
