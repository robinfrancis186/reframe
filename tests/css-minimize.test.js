import test from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import { minimizeCss } from '../server/css-minimize.js';
import { reviewedExport } from '../server/export-workflow.js';
import { ReferenceBrowser } from '../server/browser.js';

const page = { viewport: 1280, url: 'https://example.com/', backdrop: '#ffffff' };
const decls = (css, selector) => {
  const found = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector === selector && rule.parent.type === 'root')
      rule.walkDecls((d) => found.push(`${d.prop}:${d.value}`));
  });
  return found;
};

test(
  'only declarations that change nothing at any width are removed',
  { timeout: 60000 },
  async () => {
    const browser = new ReferenceBrowser();
    try {
      const css = `
      .s .s-0 { display: block; margin-top: 0px; margin-right: 0px; margin-bottom: 0px; margin-left: 0px; color: rgb(200, 0, 0); opacity: 1; font-size: 16px; padding-top: 6px; padding-right: 6px; padding-bottom: 6px; padding-left: 6px; background: var(--brand); -webkit-appearance: none; display: block; }
      .s .s-0:hover { color: rgb(0, 128, 0); }
      .s .s-2 { margin-top: 0px; margin-right: 0px; margin-bottom: 0px; margin-left: 0px; }
      .s .s-1 { border-top: 1px solid rgb(0, 0, 0); border-right: 1px solid rgb(0, 0, 0); border-bottom: 1px solid rgb(0, 0, 0); border-left: 1px solid rgb(0, 0, 0); border-left-color: rgb(255, 0, 0); }
      .s .s-html { --brand: rgb(240, 240, 255); --unused: 3px; --chain: var(--unused-too); --unused-too: 1px; }
      @media (max-width: 600px) { .s .s-0 { color: rgb(0, 0, 200); } .s .s-0 { opacity: 1; } }
      @media (prefers-color-scheme: dark) { .s .s-0 { opacity: 1; } }`;
      const markup =
        '<div class="s"><div class="s-html"><div class="s-body" style="font-size:16px;letter-spacing:normal;--root-only:1px"><div class="s-0">Hello</div><p class="s-2">Para</p><div class="s-1">Box</div></div></div></div>';
      const result = await minimizeCss(
        {
          css,
          markup,
          scope: 's',
          page,
          rootStyle: 'font-size:16px;letter-spacing:normal;--root-only:1px',
        },
        { browser },
      );
      const base = decls(result.css, '.s .s-0');
      assert.ok(
        base.includes('color:rgb(200, 0, 0)'),
        'a declaration that changes the result stays',
      );
      assert.ok(
        base.includes('padding:6px'),
        'equal padding sides collapse to the shortest shorthand',
      );
      assert.ok(base.includes('background:var(--brand)'));
      assert.ok(base.includes('-webkit-appearance:none'), 'vendor-prefixed properties are kept');
      assert.equal(
        base.filter((d) => d === 'display:block').length,
        2,
        'repeated properties are kept as written',
      );
      for (const gone of ['margin', 'margin-top:0px', 'opacity:1', 'font-size:16px'])
        assert.ok(!base.some((d) => d.startsWith(gone)), `${gone} changes nothing and is removed`);
      assert.deepEqual(
        decls(result.css, '.s .s-2'),
        ['margin-top:0px', 'margin-bottom:0px'],
        "a paragraph's default margin is vertical only, so just those zero margins stay",
      );
      assert.deepEqual(
        decls(result.css, '.s .s-0:hover'),
        ['color:rgb(0, 128, 0)'],
        'state rules are never edited',
      );
      assert.ok(
        /@media \(max-width: 600px\)\s*\{\s*\.s \.s-0\s*\{\s*color: rgb\(0, 0, 200\)/.test(
          result.css,
        ),
        'a rule needed only on narrow screens is kept',
      );
      assert.ok(
        !/@media \(max-width: 600px\)[^@]*opacity/.test(result.css),
        'a redundant rule inside a width query is removed',
      );
      assert.match(
        result.css,
        /prefers-color-scheme: dark\) \{\s*\.s \.s-0 \{\s*opacity: 1/,
        'queries a render cannot judge are kept',
      );
      assert.ok(
        decls(result.css, '.s .s-1').includes('border-left-color:rgb(255, 0, 0)'),
        'interleaved border longhands are not collapsed',
      );
      assert.ok(!decls(result.css, '.s .s-1').some((d) => d.startsWith('border:')));
      assert.deepEqual(
        decls(result.css, '.s .s-html'),
        ['--brand:rgb(240, 240, 255)'],
        'only referenced variables remain',
      );
      assert.equal(
        result.rootStyle,
        '',
        'page-root declarations and variables that change nothing are removed',
      );
      assert.ok(
        result.stats.mediaTested &&
          result.stats.widths.includes(601) &&
          result.stats.widths.includes(320),
      );
      assert.equal(result.stats.complete, true);
    } finally {
      await browser.close();
    }
  },
);

test(
  'clean export is minimised end to end and keeps its fidelity',
  { timeout: 90000 },
  async () => {
    const fixture = `<html><head><title>Plans</title><style>html{font-size:10px}body{margin:0;background:#f3f1ec;font:1.6rem/1.5 Arial,sans-serif;--accent:#2d5bd7;--unused-a:1px;--unused-b:2px}.wrap .plan{width:320px;margin:40px;padding:2.4rem;background:#fff;border-radius:1.2rem;color:#1f2430}.plan h2{margin:0 0 .8rem;font-size:2.4rem}.plan .buy{display:inline-block;margin-top:1.2rem;padding:1rem 1.8rem;background:var(--accent);color:#fff;border-radius:.8rem;text-decoration:none}@media (max-width:700px){.wrap .plan{width:auto}}</style></head><body><div class="wrap"><section class="plan" id="plan"><h2>Team plan</h2><p>Shared projects for five people.</p><a class="buy" href="/go">Start trial</a></section></div></body></html>`;
    const browser = new ReferenceBrowser({
      resource: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.from(fixture),
      }),
    });
    try {
      const { id } = await browser.create();
      await browser.act({ id, action: 'navigate', url: 'https://example.com' });
      const point = await browser.tabs
        .get(id)
        .page.locator('#plan')
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + 4, y: r.y + 4 };
        });
      await browser.act({ id, action: 'pick', ...point, depth: 0 });
      const item = (await browser.act({ id, action: 'capture' })).items[0];
      const full = await reviewedExport(item, { mode: 'faithful', browser });
      const clean = await reviewedExport(item, { mode: 'clean', browser });
      const count = (files) => {
        let n = 0;
        postcss.parse(Object.entries(files).find(([f]) => f.endsWith('.css'))[1]).walkDecls(() => {
          n++;
        });
        return n;
      };
      assert.equal(clean.minified.used, true);
      assert.ok(
        count(clean.files) < count(full.files) / 4,
        `${count(clean.files)} of ${count(full.files)} declarations remain`,
      );
      assert.ok(clean.minified.scoreAfter >= clean.minified.scoreBefore - 0.5);
      assert.ok(clean.fidelity.score >= 90, `minimised export scored ${clean.fidelity.score}`);
      const tsx = clean.files[`${clean.name}.tsx`];
      assert.doesNotMatch(
        tsx,
        /--unused-[ab]/,
        'unused page variables are not inlined into the component',
      );
      assert.match(clean.files['README.md'], /Redundant CSS removed: \d+ of \d+ declarations/);
    } finally {
      await browser.close();
    }
  },
);

test(
  'a rule on an element with a transition is judged by its final value',
  { timeout: 60000 },
  async () => {
    const browser = new ReferenceBrowser();
    try {
      const css = `
      .s .s-0 { display: block; height: 40px; background: rgb(200, 0, 0); transition: height 0.5s; }
      @media (max-width: 600px) { .s .s-0 { height: 30px; } }`;
      const result = await minimizeCss(
        {
          css,
          markup:
            '<div class="s"><div class="s-html"><div class="s-body"><div class="s-0"></div></div></div></div>',
          scope: 's',
          page,
        },
        { browser },
      );
      assert.match(result.css, /max-width: 600px\)\s*\{\s*\.s \.s-0\s*\{\s*height: 30px/);
      assert.ok(decls(result.css, '.s .s-0').includes('transition:height 0.5s'), 'motion is kept');
    } finally {
      await browser.close();
    }
  },
);
