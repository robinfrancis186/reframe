import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceBrowser } from '../server/browser.js';
import { replicaDocument } from '../server/replica.js';
import { scoreFidelity } from '../server/fidelity.js';

const fixture = `<html class="dark"><head><style>
body{margin:0;background:#07111c;color:white;font:18px Arial}
.mascot{width:80px;height:80px;margin:20px;--core:#44bbd0}
.carousel{margin:20px;width:480px;overflow:hidden;background:#111}
.track{display:flex;width:max-content;animation:travel 2s linear infinite}
.track article{width:160px;height:100px;display:grid;place-items:center;background:#246}
.track article:nth-child(2n){background:#934}
@keyframes travel{from{transform:translateX(0)}to{transform:translateX(-320px)}}
</style></head><body><button class="mascot" aria-label="Mascot"><svg width="80" height="80" viewBox="0 0 80 80"><defs><radialGradient id="glow"><stop stop-color="var(--core)"/><stop offset="1" stop-color="#05222b"/></radialGradient><path id="shape" d="M0 0H80V80H0Z"/></defs><use href="#shape" fill="url(#glow)"/></svg></button><section class="carousel"><div class="track"><article>First</article><article>Second</article><article>Third</article><article>First</article><article>Second</article></div></section><script>const entrance=document.querySelector(".carousel");entrance.style.opacity="0";entrance.animate([{opacity:0},{opacity:1}],{duration:60000,fill:"forwards"});</script></body></html>`;
const documentFor = (site) =>
  replicaDocument(site).replace(
    '<link rel="stylesheet" href="styles.css">',
    '<style>' + site.css + '</style>',
  );

test(
  'SVG use inherits its instance paint and a delayed carousel capture retains both fidelity and motion',
  { timeout: 60000 },
  async () => {
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
      const source = browser.tabs.get(id).page;
      const pick = async (selector) => {
        const point = await source.locator(selector).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + 4, y: r.y + 4, width: r.width, tag: el.localName };
        });
        for (let depth = 0; depth <= 8; depth++) {
          const { probe } = await browser.act({
            id,
            action: 'probe',
            x: point.x,
            y: point.y,
            depth,
          });
          if (probe?.tag === point.tag && Math.abs(probe.bounds.width - point.width) < 1) {
            await browser.act({ id, action: 'pick', x: point.x, y: point.y, depth });
            return;
          }
        }
        assert.fail('Could not pick ' + selector);
      };
      await pick('.mascot');
      const mascot = (await browser.act({ id, action: 'capture' })).items[0];
      assert.ok(mascot.fidelity.score >= 95, `SVG gradient scored ${mascot.fidelity.score}`);
      const captured = mascot.feature.spec.website;
      const rendered = await browser.browser.newPage();
      try {
        await rendered.setContent(documentFor(captured));
        assert.equal(
          await rendered.locator('defs path').evaluate((el) => getComputedStyle(el).fill),
          'rgb(0, 0, 0)',
        );
        assert.equal(
          await rendered.locator('use').evaluate((el) => getComputedStyle(el).fill),
          'url("#glow")',
        );
      } finally {
        await rendered.close();
      }
      await pick('.carousel');
      const before = await source
        .locator('.track')
        .evaluate((el) => el.getAnimations()[0].currentTime);
      await source.waitForTimeout(450);
      const carousel = (await browser.act({ id, action: 'capture' })).items[0];
      assert.ok(
        carousel.fidelity.score >= 95,
        `delayed carousel scored ${carousel.fidelity.score}`,
      );
      assert.ok((await scoreFidelity(carousel, { browser })).score >= 95);
      assert.equal(
        await source.locator('.track').evaluate((el) => el.getAnimations()[0].playState),
        'running',
      );
      assert.ok(
        await source
          .locator('.track')
          .evaluate((el, before) => el.getAnimations()[0].currentTime > before, before),
      );
      const copy = await browser.browser.newPage();
      try {
        await copy.setContent(documentFor(carousel.feature.spec.website));
        const first = await copy.locator('.track').evaluate((el) => getComputedStyle(el).transform);
        await copy.waitForTimeout(180);
        assert.notEqual(
          await copy.locator('.track').evaluate((el) => getComputedStyle(el).transform),
          first,
          'the replica must still animate',
        );
      } finally {
        await copy.close();
      }
    } finally {
      await browser.close();
    }
  },
);
