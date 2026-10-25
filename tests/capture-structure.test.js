import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceBrowser } from '../server/browser.js';
import { reviewedExport } from '../server/export-workflow.js';

// One page exercising the three structures that used to be lost: a web component (open shadow root, a slot hidden
// while closed, an icon drawn by a shadow ::before), a rule that depends on an ancestor outside the picked element,
// and a stylesheet on another origin that page scripts cannot read.
const page = `<!doctype html><html><head><title>Structures</title>
<link rel="stylesheet" href="https://cdn.example/icons.css">
<style>
  body { margin: 0; background: #f4f4f6; font: 16px/1.4 Arial, sans-serif; }
  .shell { padding: 20px; width: 560px; }
  .shell .field { display: inline-block; width: 100%; height: 40px; background: #dde3ff; }
  .card { display: block; width: 320px; background: #fff; border-radius: 10px; padding: 16px; }
  .row { display: flex; gap: 12px; }
  .tabs { list-style: none; margin: 0; padding: 0; background: #eef; overflow: hidden; }
  .tabs li { float: left; padding: 8px 14px; background: #fff; margin: 4px; }
  @media (width <= 500px) { .tabs li { float: none; } }
  .list { width: 640px; border-spacing: 4px; background: #fff; }
  .list .rank { text-align: right; color: #888; }
  .cta { --cta-display: inline-block; display: var(--cta-display); width: auto; padding: 10px 20px; background: #0071e3; color: #fff; border-radius: 20px; }
  [data-keyboard] .cta:focus { outline: 3px solid #e63946; outline-offset: -3px; }
  @media (max-width: 500px) { .cta { font-size: 12px; padding: 6px 10px; } }
</style>
<script>
  document.documentElement.setAttribute('data-keyboard', '');
  customElements.define('x-menu', class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = '<style>.bar{width:300px;display:flex;gap:8px;align-items:center;background:#1d3557;color:#fff;padding:10px 14px;border-radius:8px}.icon::before{content:"";display:inline-block;width:16px;height:16px;background:#e63946;border-radius:50%}.panel{display:none}</style><div class="bar"><span class="icon"></span><b>Menu</b><div class="panel"><slot name="panel"></slot></div></div>';
    }
  });
</script></head><body>
<div class="row"><a class="cta" id="cta" href="/learn">Learn more</a></div>
<ul class="tabs" id="tabs"><li>Overview</li><li>Pricing</li><li>Documentation</li></ul>
<table class="list"><tr class="story" id="story"><td class="rank">1.</td><td>Short title</td></tr><tr><td class="rank">20.</td><td>A much longer title that sets the column widths</td></tr></table>
<div class="shell"><div class="field" id="field"></div></div>
<x-menu id="menu"><div slot="panel" class="links">Hidden panel content</div></x-menu>
<div class="card" id="card"><i class="ico">star</i> Rated</div>
</body></html>`;
const icons =
  '.ico { font-family: "Fixture Icons"; font-style: normal; font-size: 20px; color: #c08a00; }';

async function capture(browser, id, selector, variants = false) {
  const point = await browser.tabs
    .get(id)
    .page.locator(selector)
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  let depth = 0;
  for (; depth <= 8; depth++) {
    const { probe } = await browser.act({ id, action: 'probe', ...point, depth });
    if (
      probe &&
      (await browser.tabs
        .get(id)
        .page.locator(selector)
        .evaluate(
          (el, b) => Math.abs(el.getBoundingClientRect().width - b.width) < 1,
          probe.bounds,
        ))
    )
      break;
  }
  await browser.act({ id, action: 'pick', ...point, depth });
  return (await browser.act({ id, action: 'capture', variants })).items[0];
}

async function withFixture(run) {
  const requested = [];
  const browser = new ReferenceBrowser({
    resource: async (url) => {
      requested.push(url);
      if (url === 'https://cdn.example/icons.css')
        return { status: 200, headers: { 'content-type': 'text/css' }, body: Buffer.from(icons) };
      return { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(page) };
    },
  });
  try {
    const { id } = await browser.create();
    await browser.act({ id, action: 'navigate', url: 'https://example.com/' });

    return await run(browser, id, requested);
  } finally {
    await browser.close();
  }
}

test(
  'captures keep web components, ancestor rules, cross-origin styles and table context',
  { timeout: 120000 },
  () =>
    withFixture(async (browser, id, requested) => {
      // Ancestor-dependent rule: `.shell .field { width: 100% }` needs the ancestor that was not picked.
      const field = await capture(browser, id, '#field');
      const html = field.feature.spec.website.pages[0].html;
      assert.match(
        html,
        /<div class="shell" data-rf-shell="div">/,
        'the ancestor is rebuilt as a wrapper',
      );
      assert.match(
        field.feature.spec.website.css,
        /\[data-rf-shell\]\s*\{\s*display:\s*contents\s*!important/,
      );
      assert.ok(
        field.fidelity.score >= 95,
        `ancestor-dependent capture scored ${field.fidelity.score}`,
      );

      // Measuring the root's size touches its inline style; the page is left exactly as it was, so capturing again
      // (as each measured width and state does) records the same thing.
      const again = await capture(browser, id, '#field');
      assert.equal(again.feature.spec.website.css, field.feature.spec.website.css);
      assert.equal(
        await browser.tabs
          .get(id)
          .page.locator('#field')
          .evaluate((el) => el.getAttribute('style')),
        null,
      );

      // Web component: shadow content is captured, the closed panel stays hidden, the shadow ::before icon survives.
      const menu = await capture(browser, id, '#menu');
      const menuHtml = menu.feature.spec.website.pages[0].html;
      assert.match(
        menuHtml,
        /data-rf-element="x-menu"/,
        'the custom element becomes a plain element',
      );
      assert.match(menuHtml, /<b[^>]*>Menu<\/b>/, 'shadow-root content is part of the capture');
      assert.doesNotMatch(
        menuHtml,
        /class="bar"/,
        'shadow-internal classes are not exposed to page rules',
      );
      assert.match(
        menuHtml,
        /data-rf-element="slot"/,
        'the slot is kept, so its hidden state is kept',
      );
      assert.match(
        menu.feature.spec.website.css,
        /\[data-rf-rendered="\d+"\]::before\{content:/,
        'the shadow ::before icon is in the snapshot',
      );
      assert.match(
        menu.feature.spec.website.css,
        /width:300px/,
        "a size set by the component's own stylesheet is kept",
      );
      assert.ok(menu.fidelity.score >= 95, `web component capture scored ${menu.fidelity.score}`);

      // Cross-origin stylesheet: unreadable in the page, recovered by the server.
      const card = await capture(browser, id, '#card');
      assert.ok(requested.includes('https://cdn.example/icons.css'));
      assert.match(
        card.feature.spec.website.css,
        /\.ico\s*\{[^}]*Fixture Icons/,
        'the matching rule from the other origin is recovered',
      );
      assert.ok(
        !card.feature.spec.website.warnings.some((w) => w.includes('cdn.example/icons.css')),
        'the stylesheet is no longer reported unavailable',
      );

      // A table row: it keeps its tag (a <tr> outside a table is dropped when parsed), and its table's width and the
      // column widths set by rows that were not picked.
      const story = await capture(browser, id, '#story');
      assert.match(
        story.feature.spec.website.pages[0].html,
        /<tr class="story"[^>]*data-rf-picked/,
      );
      assert.ok(story.fidelity.score >= 90, `table row capture scored ${story.fidelity.score}`);
    }),
);

test('clean exports preserve responsive flex sizing and keyboard focus', { timeout: 120000 }, () =>
  withFixture(async (browser, id) => {
    // A flex item whose own rules say inline-block and width:auto: pinning the display it really had (block) must not
    // let it stretch, so the repair checks again after each pin.
    const cta = await capture(browser, id, '#cta', true);
    assert.ok(cta.fidelity.score >= 95, `flex item capture scored ${cta.fidelity.score}`);
    // Its size follows its content, so it is saved as fit-content rather than desktop pixels.
    assert.match(
      cta.feature.spec.website.css,
      /^\s*\[data-rf-rendered="0"\]\{width:fit-content;max-width:100%;/,
    );

    // The clean export keeps the narrow-screen rule and the focus ring that depended on a script-set attribute, and
    // links to the original page again.
    const clean = await reviewedExport(cta, { mode: 'clean', browser });
    for (const key of ['390:default', '1280:focus']) {
      const variant = clean.variants.find((v) => `${v.width}:${v.state}` === key);
      assert.ok(variant && variant.score >= 95, `${key} export scored ${variant?.score}`);
    }
    assert.match(clean.files[`${clean.name}.tsx`], /href="https:\/\/example\.com\/learn"/);
    assert.doesNotMatch(clean.files[`${clean.name}.tsx`], /outside the captured set/);
  }),
);

test('clean exports preserve floats across range-syntax breakpoints', { timeout: 120000 }, () =>
  withFixture(async (browser, id) => {
    // Floats that return to `none` on narrow screens (a default the snapshot leaves out) at a range-syntax breakpoint.
    const tabs = await capture(browser, id, '#tabs', true);
    const tabsExport = await reviewedExport(tabs, { mode: 'clean', browser });
    const narrow = tabsExport.variants.find((v) => v.width === 390 && v.state === 'default');
    assert.ok(narrow && narrow.score >= 95, `390px tabs export scored ${narrow?.score}`);
  }),
);

// Page-level context a component depends on: a print-only stylesheet, attribute selectors on data-*, a sprite icon
// defined elsewhere in the page, an inline SVG logo in CSS, and right-to-left direction set on <html>.
const context = `<!doctype html><html dir="rtl" lang="ar"><head><title>Context</title>
<style media="print">.bar2 .label { display: none; }</style>
<style>
  body { margin: 0; font: 16px/1.4 Arial, sans-serif; background: #fff; }
  .frame { position: relative; padding: 24px; }
  .badge { position: absolute; top: 4px; left: 50%; background: #333; color: #fff; font-style: normal; }
  .bar2 { display: flex; gap: 10px; align-items: center; padding: 10px; background: #eef; width: 500px; }
  [data-kind="primary"] { color: #fff; background: #c00; padding: 6px 12px; }
  .logo { width: 40px; height: 40px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='5' fill='%23080'/%3E%3C/svg%3E") no-repeat; background-size: contain; }
</style></head><body>
<svg style="display:none"><symbol id="dot" viewBox="0 0 10 10"><rect width="10" height="10" fill="#00f"/></symbol></svg>
<div class="frame"><div class="bar2" id="bar2"><i class="badge">NEW</i><span class="logo"></span><span class="label">مرحبا بكم</span><b data-kind="primary" data-tracking="u-123">زر</b><svg width="20" height="20"><use href="#dot"/></svg></div></div>
</body></html>`;

test(
  'captures keep page-level context: media, data attributes, sprites, SVG images and direction',
  {
    timeout: 120000,
  },
  async () => {
    const browser = new ReferenceBrowser({
      resource: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.from(context),
      }),
    });
    try {
      const { id } = await browser.create();
      await browser.act({ id, action: 'navigate', url: 'https://example.com/' });
      const bar = await capture(browser, id, '#bar2');
      const site = bar.feature.spec.website,
        page = site.pages[0];
      assert.match(site.css, /@media print\s*\{[^}]*\.bar2 \.label/, 'print rules stay print-only');
      assert.match(page.html, /data-kind="primary"/, 'a data attribute a selector uses is kept');
      assert.doesNotMatch(page.html, /data-tracking/, 'other data attributes are dropped');
      assert.match(page.html, /<symbol id="dot"/, 'the sprite symbol travels with the icon');
      assert.match(site.css, /data:image\/svg\+xml/, 'an inline SVG background is kept');
      assert.match(page.rootStyle, /direction:\s*rtl/, 'right-to-left direction is kept');
      assert.ok(bar.fidelity.score >= 95, `context capture scored ${bar.fidelity.score}`);
    } finally {
      await browser.close();
    }
  },
);
