// Real-site capture fidelity suite: `npm run fidelity [-- --min 85]`.
// Picks known components on public sites through the same isolated reference browser the app uses, saves them as the
// app would (including the style repair pass), and scores each against its reference image. Sites change, so this is
// a manual regression check rather than part of `npm test`; results go to .reframe/fidelity-report.json.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReferenceBrowser } from '../server/browser.js';

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
];
const min = Number(process.argv[process.argv.indexOf('--min') + 1]) || 0;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = new ReferenceBrowser(),
  results = [];
try {
  const { id } = await browser.create();
  for (const test of cases) {
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
      } = await browser.act({ id, action: 'capture' });
      results.push({
        ...test,
        score: item.fidelity?.score ?? null,
        grade: item.fidelity?.grade || 'Not scored',
        repaired: /reframe:fidelity-repair/.test(item.feature.spec.website.css),
        size: item.fidelity?.reference,
        ms: Date.now() - started,
      });
    } catch (error) {
      results.push({
        ...test,
        score: null,
        grade: 'Error',
        error: error.message.slice(0, 200),
        ms: Date.now() - started,
      });
    }
    const r = results.at(-1);
    console.log(
      `${String(r.score ?? '—').padStart(5)}  ${r.grade.padEnd(24)} ${r.label}${r.repaired ? ' · repaired' : ''}${r.error ? ' · ' + r.error : ''}`,
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
await mkdir(path.join(root, '.reframe'), { recursive: true });
await writeFile(
  path.join(root, '.reframe/fidelity-report.json'),
  JSON.stringify({ checkedAt: new Date().toISOString(), average, results }, null, 2),
);
if (min && results.some((r) => r.score === null || r.score < min)) {
  console.error(`Below the minimum of ${min}.`);
  process.exit(1);
}
process.exit(0);
