import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceBrowser } from '../server/browser.js';

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
  .cta { --cta-display: inline-block; display: var(--cta-display); width: auto; padding: 10px 20px; background: #0071e3; color: #fff; border-radius: 20px; }
</style>
<script>
  customElements.define('x-menu', class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = '<style>.bar{display:flex;gap:8px;align-items:center;background:#1d3557;color:#fff;padding:10px 14px;border-radius:8px}.icon::before{content:"";display:inline-block;width:16px;height:16px;background:#e63946;border-radius:50%}.panel{display:none}</style><div class="bar"><span class="icon"></span><b>Menu</b><div class="panel"><slot name="panel"></slot></div></div>';
    }
  });
</script></head><body>
<div class="row"><a class="cta" id="cta">Learn more</a></div>
<div class="shell"><div class="field" id="field"></div></div>
<x-menu id="menu"><div slot="panel" class="links">Hidden panel content</div></x-menu>
<div class="card" id="card"><i class="ico">star</i> Rated</div>
</body></html>`;
const icons =
  '.ico { font-family: "Fixture Icons"; font-style: normal; font-size: 20px; color: #c08a00; }';

async function capture(browser, id, selector) {
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
  return (await browser.act({ id, action: 'capture' })).items[0];
}

test(
  'captures keep web components, ancestor-dependent rules and cross-origin styles',
  { timeout: 120000 },
  async () => {
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

      // A flex item whose own rules say inline-block and width:auto: pinning the display it really had (block) must not
      // let it stretch, so the repair checks again after each pin.
      const cta = await capture(browser, id, '#cta');
      assert.ok(cta.fidelity.score >= 95, `flex item capture scored ${cta.fidelity.score}`);
    } finally {
      await browser.close();
    }
  },
);
