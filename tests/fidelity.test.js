import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceBrowser } from '../server/browser.js';
import { scoreFidelity, snapshotRules, fidelityGrade, canScore } from '../server/fidelity.js';
import { pageContext } from '../server/replica.js';

// A page where a generic `.btn` rule would override the button's real, context-dependent size, and where an
// absolutely positioned banner overlaps the card that is picked.
const page = `<html><head><title>Fidelity fixture</title><style>
body{margin:0;background:#f4f1ea;font:16px/1.4 Arial,sans-serif}
.btn{font-size:12px;padding:4px 6px;background:#225;color:#fff;border-radius:4px;display:inline-block}
.hero .cta .btn{font-size:22px;padding:14px 28px}
.card{width:360px;margin:40px;padding:24px;background:#fff;border:2px solid #334}
.badge{position:absolute;right:8px;top:8px;background:#c33;color:#fff;padding:2px 6px}
.overlay{position:absolute;left:30px;top:60px;width:300px;height:40px;background:#0a0}
</style></head><body><main class="hero"><div class="cta"><section class="card" id="card" style="position:relative"><h2>Plans</h2><p>Everything you need to start.</p><a class="btn" id="btn" href="/buy">Buy now</a><span class="badge">New</span></section></div></main><div class="overlay"></div></body></html>`;

test(
  'captures are repaired, scored against an isolated reference, and broken copies score lower',
  { timeout: 90000 },
  async () => {
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
      const point = async (selector, corner = false) =>
        browser.tabs
          .get(id)
          .page.locator(selector)
          .evaluate((el, corner) => {
            const r = el.getBoundingClientRect();
            return corner
              ? { x: r.x + 6, y: r.y + 6 }
              : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }, corner);
      // The card: the overlapping green overlay belongs to the page, not the component, and is excluded from the reference.
      const picked = await browser.act({
        id,
        action: 'pick',
        ...(await point('#card', true)),
        depth: 0,
      });
      assert.equal(picked.selection.tag, 'section');
      const card = (await browser.act({ id, action: 'capture' })).items[0];
      assert.ok(canScore(card));
      assert.equal(
        card.feature.spec.website.pages[0].backdrop,
        'rgb(244, 241, 234)',
        'the backdrop is the color behind the component',
      );
      assert.equal(card.feature.spec.website.pages[0].viewport, 1280);
      assert.ok(card.fidelity.score >= 90, `card scored ${card.fidelity.score}`);
      assert.equal(card.fidelity.grade, 'Close match');
      // The button relies on `.hero .cta .btn`; without its ancestors the generic `.btn` would shrink it. The repair pass pins it.
      await browser.act({ id, action: 'pick', ...(await point('#btn')), depth: 0 });
      const button = (await browser.act({ id, action: 'capture' })).items[0];
      assert.match(button.feature.spec.website.css, /reframe:fidelity-repair[\s\S]*font-size:22px/);
      assert.ok(button.fidelity.score >= 90, `button scored ${button.fidelity.score}`);
      assert.equal(button.fidelity.fitted, true);
      // Removing the styles must be detected, and a diff image is produced on request.
      const broken = structuredClone(card);
      broken.feature.spec.website.css = '';
      const result = await scoreFidelity(broken, { browser, diff: true });
      assert.ok(result.score < card.fidelity.score - 25, `broken copy scored ${result.score}`);
      assert.match(result.diff, /^data:image\/png;base64,/);
      assert.match(result.renderedImage, /^data:image\/jpeg;base64,/);
      await assert.rejects(
        scoreFidelity({ ...card, referenceImage: undefined }, { browser }),
        /reference image/,
      );
    } finally {
      await browser.close();
    }
  },
);

test('snapshot rules, capture context and grades are parsed and validated strictly', () => {
  const css =
    '\n[data-rf-rendered="0"],[data-rf-rendered="3"]{font-family:"A;B", serif;background-image:url("data:image/svg+xml;utf8,x");padding-top:4px}[data-rf-rendered="1"]{color:red}\n.site{color:blue}';
  const rules = snapshotRules(css);
  assert.deepEqual(
    rules.map((r) => r.ids),
    [[0, 3], [1]],
  );
  assert.deepEqual(
    rules[0].declarations.map((d) => d[0]),
    ['font-family', 'background-image', 'padding-top'],
  );
  assert.equal(rules[0].declarations[0][1], '"A;B", serif');
  assert.deepEqual(pageContext({ backdrop: 'rgba(1, 2, 3, 0.5)', viewport: 390 }), {
    backdrop: 'rgba(1, 2, 3, 0.5)',
    viewport: 390,
  });
  assert.deepEqual(pageContext({ backdrop: 'red;}body{display:none', viewport: 99999 }), {});
  assert.deepEqual([95, 80, 60, 10].map(fidelityGrade), [
    'Close match',
    'Minor differences',
    'Noticeable differences',
    'Low match',
  ]);
});
