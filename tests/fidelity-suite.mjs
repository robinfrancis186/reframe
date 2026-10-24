// Real-site capture fidelity suite: `npm run fidelity [-- --min 85] [-- --quick] [-- --only Apple]`.
// Picks known components on public sites through the same isolated reference browser the app uses, saves them as the
// app would (including the style repair pass), and scores each against its reference image. Unless --quick, it also
// measures the component at 768 and 390px and in its hover and focus states, and scores the clean export against
// each of those references. Sites change, so this is a manual regression check rather than part of `npm test`;
// results go to .reframe/fidelity-report.json.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReferenceBrowser } from '../server/browser.js';
import { reviewedExport } from '../server/export-workflow.js';

const cases = [
  { site: 'https://example.com/', selector: 'body > p', label: 'Example domain paragraph' },
  { site: 'https://www.apple.com/', selector: '#globalnav', label: 'Apple global navigation' },
  { site: 'https://www.apple.com/', selector: 'a.button', label: 'Apple primary button' },
  {
    site: 'https://www.wikipedia.org/',
    selector: '.central-textlogo',
    label: 'Wikipedia logo block',
  },
  { site: 'https://www.wikipedia.org/', selector: '#search-form', label: 'Wikipedia search form' },
  { site: 'https://www.rust-lang.org/', selector: 'header', label: 'Rust header' },
  { site: 'https://go.dev/', selector: 'header', label: 'Go header' },
  { site: 'https://developer.mozilla.org/en-US/', selector: 'header', label: 'MDN header' },
  { site: 'https://github.com/', selector: 'header', label: 'GitHub header' },
  { site: 'https://stripe.com/', selector: 'header', label: 'Stripe header' },
  { site: 'https://vercel.com/', selector: 'header', label: 'Vercel header (Next.js)' },
  { site: 'https://vuejs.org/', selector: '.VPNav', label: 'Vue navigation (VitePress)' },
  { site: 'https://svelte.dev/', selector: 'nav', label: 'Svelte navigation' },
  { site: 'https://react.dev/', selector: 'nav', label: 'React navigation' },
  { site: 'https://react.dev/', selector: 'footer', label: 'React footer' },
  { site: 'https://nodejs.org/en', selector: 'nav', label: 'Node.js navigation' },
  { site: 'https://getbootstrap.com/', selector: '.navbar', label: 'Bootstrap navbar' },
  { site: 'https://www.typescriptlang.org/', selector: 'nav', label: 'TypeScript menu' },
  { site: 'https://www.python.org/', selector: '#top', label: 'Python top bar' },
  { site: 'https://www.w3.org/', selector: 'header', label: 'W3C header' },
  {
    site: 'https://news.ycombinator.com/',
    selector: '#hnmain tr:first-child',
    label: 'Hacker News header row (table)',
  },
  { site: 'https://news.ycombinator.com/', selector: 'tr.athing', label: 'Hacker News story row' },
  { site: 'https://www.bbc.com/', selector: 'header', label: 'BBC header' },
  { site: 'https://www.gov.uk/', selector: 'header', label: 'GOV.UK header' },
  { site: 'https://www.gov.uk/', selector: '.govuk-footer', label: 'GOV.UK footer' },
  {
    site: 'https://ar.wikipedia.org/',
    selector: 'header.vector-header',
    label: 'Arabic Wikipedia header (right to left)',
  },
  {
    site: 'https://www.wikipedia.org/',
    selector: '.central-featured',
    label: 'Wikipedia language ring',
  },
  { site: 'https://bun.sh/', selector: 'header', label: 'Bun header (dark)' },
  { site: 'https://linear.app/', selector: 'header', label: 'Linear header (dark)' },
];
const min = Number(process.argv[process.argv.indexOf('--min') + 1]) || 0,
  quick = process.argv.includes('--quick'),
  only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const VARIANTS = [
  ['390:default', '390'],
  ['768:default', '768'],
  ['1280:hover', 'hover'],
  ['1280:focus', 'focus'],
];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = new ReferenceBrowser(),
  results = [];
try {
  let { id } = await browser.create();
  console.log(
    `${'saved'.padStart(5)}${quick ? '' : ['clean', ...VARIANTS.map(([, l]) => l)].map((l) => l.padStart(5)).join('')}`,
  );
  for (const test of cases.filter((c) => c.label.includes(only))) {
    const started = Date.now();
    try {
      if (browser.tabs.get(id).page.url() !== test.site)
        await browser.act({ id, action: 'navigate', url: test.site });
      const page = browser.tabs.get(id).page,
        target = page.locator(test.selector).first();
      await target.scrollIntoViewIfNeeded({ timeout: 5000 });
      const rect = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      // Click the element's centre and climb until the selection is exactly the target element.
      const point = {
        x: Math.min(1279, rect.x + rect.width / 2),
        y: Math.min(799, Math.max(0, rect.y) + Math.min(rect.height, 800) / 2),
      };
      let depth = 0;
      for (; depth <= 8; depth++) {
        const { probe } = await browser.act({ id, action: 'probe', ...point, depth });
        if (
          probe &&
          Math.abs(probe.bounds.width - Math.min(rect.width, 1280)) < 2 &&
          Math.abs(probe.bounds.x - Math.max(0, rect.x)) < 2
        )
          break;
      }
      if (depth > 8) throw new Error('Could not select the element from its centre point.');
      await browser.act({ id, action: 'pick', ...point, depth });
      const {
        items: [item],
      } = await browser.act({ id, action: 'capture', variants: !quick });
      // The clean export scored against each measured width and state (the component as a developer would ship it).
      const variants = {};
      if (!quick) {
        const clean = await reviewedExport(item, { mode: 'clean', browser });
        variants.clean = clean.fidelity?.score ?? null;
        for (const v of clean.variants)
          variants[`${v.width}:${v.state}`] = v.error ? null : v.score;
      }
      results.push({
        variants,
        ...test,
        score: item.fidelity?.score ?? null,
        grade: item.fidelity?.grade || 'Not scored',
        repaired: /reframe:fidelity-repair/.test(item.feature.spec.website.css),
        size: item.fidelity?.reference,
        ms: Date.now() - started,
      });
    } catch (error) {
      // A page that hangs or crashes can take the tab with it; the next case starts in a fresh one.
      await browser.closeTab(id).catch(() => {});
      ({ id } = await browser.create());
      results.push({
        ...test,
        score: null,
        grade: 'Error',
        error: error.message.slice(0, 200),
        ms: Date.now() - started,
      });
    }
    const r = results.at(-1),
      cell = (v) => String(v ?? '—').padStart(5);
    console.log(
      `${cell(r.score)}${quick ? '' : [r.variants?.clean, ...VARIANTS.map(([k]) => r.variants?.[k])].map(cell).join('')}  ${r.label}${r.repaired ? ' · repaired' : ''}${r.error ? ' · ' + r.error : ''}`,
    );
  }
} finally {
  await browser.close();
}
const scored = results.filter((r) => r.score !== null),
  average = scored.length
    ? Math.round((scored.reduce((s, r) => s + r.score, 0) / scored.length) * 10) / 10
    : null;
console.log(`\nAverage ${average ?? '—'} over ${scored.length}/${results.length} captures.`);
const averages = {};
if (!quick)
  for (const [key, label] of [['clean', 'clean export'], ...VARIANTS]) {
    const values = results.map((r) => r.variants?.[key]).filter((v) => typeof v === 'number');
    averages[key] = values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      : null;
    console.log(`  ${label.padEnd(13)} ${averages[key] ?? '—'} over ${values.length}`);
  }
await mkdir(path.join(root, '.reframe'), { recursive: true });
await writeFile(
  path.join(root, '.reframe/fidelity-report.json'),
  JSON.stringify({ checkedAt: new Date().toISOString(), average, averages, results }, null, 2),
);
if (min && results.some((r) => r.score === null || r.score < min)) {
  console.error(`Below the minimum of ${min}.`);
  process.exit(1);
}
process.exit(0);
