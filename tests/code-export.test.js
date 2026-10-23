import test from 'node:test';
import assert from 'node:assert/strict';
import { transformWithEsbuild } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scopeCss, toJsx, componentName, exportComponentCode } from '../server/code-export.js';
import { scoreExport } from '../server/fidelity.js';
import { ReferenceBrowser } from '../server/browser.js';

test('captured CSS is scoped to one wrapper, with page roots, snapshot indexes, rem and fonts rewritten', () => {
  const font = 'data:font/woff2;base64,d09GMgABAAAA';
  const { css, fonts } = scopeCss(
    `:root{--x:1}html.js .menu,body>main{margin:0}[data-rf-rendered="3"]:not(#rf-fidelity){font-size:1.5rem;padding:0 .5rem}.body-text{color:red}@media (min-width:600px){.a b{color:blue}}@keyframes spin{from{opacity:0}to{opacity:1}}@font-face{font-family:X;src:url("${font}") format("woff2")}.icon{background:url("https://example.com/a.svg")}`,
    'rfx-abc',
    10,
  );
  assert.match(css, /\.rfx-abc \.rfx-abc-html\{--x:1\}/);
  assert.match(css, /\.rfx-abc \.rfx-abc-html\.js \.menu,\s*\.rfx-abc \.rfx-abc-body>main/);
  assert.match(css, /\.rfx-abc \.rfx-abc-3:not\(#rf-fidelity\)\{font-size:15px;padding:0 5px\}/);
  assert.match(
    css,
    /\.rfx-abc \.body-text\{color:red\}/,
    'class names containing "body" are untouched',
  );
  assert.match(css, /@media \(min-width:600px\)\{\.rfx-abc \.a b\{color:blue\}\}/);
  assert.match(
    css,
    /@keyframes spin\{from\{opacity:0\}to\{opacity:1\}\}/,
    'keyframe steps are not scoped',
  );
  assert.match(css, /src:url\("\.\/fonts\/[a-f0-9]{16}\.woff2"\)/);
  assert.equal(Object.values(fonts)[0], 'd09GMgABAAAA');
  assert.match(css, /url\("https:\/\/example\.com\/a\.svg"\)/);
});

test('markup becomes valid JSX that compiles and renders the same structure in React', async () => {
  const html =
    '<nav data-rf-rendered="0" data-rf-picked="true" class="bar" style="padding-top:4px;--accent:red;-webkit-line-clamp:2"><a href="https://example.com/x" data-rf-unavailable="https://example.com/x" data-rf-rendered="1">Home</a>\n <a href="/b" data-rf-rendered="2">{Docs} &amp; "more"</a><form data-rf-form="0"><label for="q">Search</label><input id="q" type="search" required maxlength="40" tabindex="0"><select name="s"><option value="a">A</option><option value="b" selected>B</option></select><textarea name="t">x</textarea><input type="checkbox" checked></form><svg viewBox="0 0 10 10" fill="none"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M0 0h10" stroke-width="2" fill-rule="evenodd"/></svg></nav>\n<div data-rf-rendered="3">A</div>\n<div data-rf-rendered="4">B</div>';
  const jsx = toJsx(html, 'rfx-t', '');
  assert.match(
    jsx,
    /<nav className="bar rfx-t-0" style=\{\{ paddingTop: "4px", "--accent": "red", WebkitLineClamp: "2" \}\}>/,
  );
  assert.doesNotMatch(jsx, /data-rf-(?:picked|unavailable|form)/);
  assert.match(jsx, /<label htmlFor="q"/);
  assert.match(jsx, /required maxLength="40" tabIndex="0"/);
  assert.match(jsx, /<select name="s" defaultValue="b">\s*<option value="a">/);
  assert.match(jsx, /<textarea name="t" defaultValue="x" \/>/);
  assert.match(jsx, /defaultChecked/);
  assert.match(jsx, /<linearGradient id="g">/);
  assert.match(jsx, /stopColor="#fff"/);
  assert.match(jsx, /strokeWidth="2" fillRule="evenodd"/);
  assert.match(jsx, /onSubmit=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(jsx, /\{"\{Docs\} & \\"more\\""\}/, 'braces and quotes in text are safe');
  assert.match(jsx, /<\/a>\n\s*\{" "\}\n\s*<a/, 'whitespace between inline elements is kept');
  assert.doesNotMatch(jsx, /<\/nav>\n\{" "\}/, 'whitespace between blocks is dropped');
  assert.equal(componentName('iPhone Duo — 2026!'), 'IPhoneDuo2026');
  assert.equal(componentName('123 go'), 'Captured123Go');
  // Compile and render with the project's own React, failing on any React warning.
  const require = createRequire(import.meta.url),
    dir = await mkdtemp(path.join(tmpdir(), 'export-'));
  const errors = [],
    original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const { code } = await transformWithEsbuild(
      `import * as React from ${JSON.stringify(require.resolve('react'))};\nexport default function C(){return (<>\n${jsx}\n</>);}`,
      'C.jsx',
      { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
    );
    await writeFile(path.join(dir, 'C.mjs'), code);
    const { default: C } = await import(pathToFileURL(path.join(dir, 'C.mjs')).href);
    const React = require('react'),
      { renderToStaticMarkup } = require('react-dom/server');
    const out = renderToStaticMarkup(React.createElement(C));
    assert.match(
      out,
      /<nav class="bar rfx-t-0" style="padding-top:4px;--accent:red;-webkit-line-clamp:2">/,
    );
    assert.match(out, /<option value="b" selected="">B<\/option>/);
    assert.match(out, /<linearGradient id="g">/);
    assert.deepEqual(errors, []);
  } finally {
    console.error = original;
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'exported code from a real capture keeps its appearance and needs no Reframe runtime',
  { timeout: 90000 },
  async () => {
    const page = `<html><head><title>Export fixture</title><style>html{font-size:10px}body{margin:0;background:#eef}.shell .card{width:300px;margin:30px;padding:2rem;background:#fff;border-radius:1.2rem;font:1.6rem/1.4 Arial,sans-serif;color:#223}.card h2{margin:0 0 1rem;font-size:2.4rem}.card .go{display:inline-block;padding:.8rem 1.6rem;background:#335;color:#fff;border-radius:.6rem}</style></head><body><div class="shell"><section class="card" id="card"><h2>Starter</h2><p>For small teams.</p><a class="go" href="/go">Choose</a></section></div></body></html>`;
    const browser = new ReferenceBrowser({
      resource: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.from(page),
      }),
    });
    try {
      const { id } = await browser.create();
      await browser.act({ id, action: 'navigate', url: 'https://example.com' });
      const r = await browser.tabs
        .get(id)
        .page.locator('#card')
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + 4, y: r.y + 4 };
        });
      await browser.act({ id, action: 'pick', ...r, depth: 0 });
      const item = (await browser.act({ id, action: 'capture' })).items[0];
      assert.equal(item.feature.spec.website.pages[0].rem, 10);
      const code = exportComponentCode(item);
      assert.equal(code.name, 'Starter');
      assert.deepEqual(Object.keys(code.files).sort(), [
        'README.md',
        'Starter.css',
        'Starter.html',
        'Starter.tsx',
      ]);
      assert.match(code.files['Starter.tsx'], /^\/\/ Captured from https:\/\/example\.com\//);
      assert.match(code.files['Starter.tsx'], /import "\.\/Starter\.css";/);
      assert.doesNotMatch(
        code.files['Starter.tsx'] + code.files['Starter.html'],
        /<script|data-rf-|\/api\/reframe|iframe/,
      );
      assert.doesNotMatch(
        code.files['Starter.css'],
        /\drem\b/,
        'rem is resolved against the source page root',
      );
      const fidelity = await scoreExport(item, code, { browser });
      assert.ok(fidelity.score >= 90, `exported code scored ${fidelity.score}`);
    } finally {
      await browser.close();
    }
  },
);
