import { referenceResource } from './browser-network.js';
import { SNAPSHOT_DEFAULTS, validateReplica } from './replica.js';

// Capture fidelity: render a saved website capture in an isolated, script-free Chromium page and compare it with the
// reference image taken when it was picked. The comparison is structural (SSIM on luminance over 8×8 blocks),
// discounted by each block's color difference and weighted towards detailed blocks, so a match needs the same layout, text placement and colors.
// Source images load through the same pinned public-network broker as the reference browser; nothing else is fetched.
const REFERENCE = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/;
export const fidelityGrade = (score) =>
  score >= 90
    ? 'Close match'
    : score >= 75
      ? 'Minor differences'
      : score >= 55
        ? 'Noticeable differences'
        : 'Low match';

export function canScore(item) {
  const page = item?.feature?.spec?.website?.pages?.[0];
  return !!(
    page?.component &&
    typeof item.referenceImage === 'string' &&
    REFERENCE.test(item.referenceImage)
  );
}

// Copies are checked in a container as wide as the one the original had (see `container` in capture-page.js).
const space = (page) =>
  Number.isFinite(page.container) ? `body{width:${page.container}px;max-width:100%}` : '';
function documentFor(site) {
  const page = site.pages[0];
  return `<!doctype html><html lang="en" class="${page.htmlClass.replace(/"/g, '')}"><head><meta charset="utf-8"><style>${site.css.replace(/<\/style/gi, '')}html,body{margin:0;padding:0;background:${page.backdrop || '#ffffff'}}body{${(page.rootStyle || '').replace(/[<>]/g, '')}}${space(page)}</style></head><body>${page.html}</body></html>`;
}

// Runs inside a blank page: decodes both images, aligns them and scores 8×8 blocks.
function compare({ reference, rendered, diff }) {
  const load = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image could not be decoded.'));
      image.src = src;
    });
  return Promise.all([load(reference), load(rendered)]).then(([ref, out]) => {
    const scale = Math.min(1, 480 / ref.naturalWidth),
      width = Math.max(8, Math.round(ref.naturalWidth * scale)),
      height = Math.max(8, Math.round(ref.naturalHeight * scale));
    const near = (a, b) => Math.abs(a - b) <= Math.max(4, b * 0.1);
    // Same size within 10%: rendering differences in sub-pixel layout are scaled away. Otherwise draw 1:1, so a size
    // mismatch shows up as missing or extra content rather than being hidden by stretching.
    const fitted =
      near(out.naturalWidth, ref.naturalWidth) && near(out.naturalHeight, ref.naturalHeight);
    // A light blur and the best of ±1px alignments absorb anti-aliasing and sub-pixel layout differences, which would
    // otherwise dominate small components; real layout, text or color differences are far larger than that.
    const pixels = (image, stretch, dx = 0, dy = 0) => {
      const canvas = new OffscreenCanvas(width, height),
        context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.filter = 'blur(.6px)';
      if (stretch) context.drawImage(image, dx, dy, width, height);
      else
        context.drawImage(image, dx, dy, image.naturalWidth * scale, image.naturalHeight * scale);
      return context.getImageData(0, 0, width, height).data;
    };
    const a = pixels(ref, true),
      C1 = (0.01 * 255) ** 2,
      C2 = (0.03 * 255) ** 2;
    const measure = (b) => {
      const blocks = [];
      for (let by = 0; by + 8 <= height; by += 8)
        for (let bx = 0; bx + 8 <= width; bx += 8) {
          let ma = 0,
            mb = 0,
            ra = 0,
            ga = 0,
            ba = 0,
            rb = 0,
            gb = 0,
            bb = 0;
          const la = [],
            lb = [];
          for (let y = by; y < by + 8; y++)
            for (let x = bx; x < bx + 8; x++) {
              const i = (y * width + x) * 4,
                va = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2],
                vb = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
              la.push(va);
              lb.push(vb);
              ma += va;
              mb += vb;
              ra += a[i];
              ga += a[i + 1];
              ba += a[i + 2];
              rb += b[i];
              gb += b[i + 1];
              bb += b[i + 2];
            }
          ma /= 64;
          mb /= 64;
          let sa = 0,
            sb = 0,
            sab = 0;
          for (let n = 0; n < 64; n++) {
            sa += (la[n] - ma) ** 2;
            sb += (lb[n] - mb) ** 2;
            sab += (la[n] - ma) * (lb[n] - mb);
          }
          sa /= 63;
          sb /= 63;
          sab /= 63;
          const ssim =
              ((2 * ma * mb + C1) * (2 * sab + C2)) / ((ma * ma + mb * mb + C1) * (sa + sb + C2)),
            color = (Math.abs(ra - rb) + Math.abs(ga - gb) + Math.abs(ba - bb)) / 192;
          // Detailed blocks (text, edges, imagery) count fully; flat background blocks count 15%, so empty space cannot mask a mismatch.
          blocks.push({
            x: bx,
            y: by,
            score: Math.max(0, ssim) * (1 - Math.min(0.5, color / 128)),
            weight: 0.15 + 0.85 * Math.min(1, Math.sqrt(Math.max(sa, sb)) / 16),
          });
        }
      const total = blocks.reduce((sum, block) => sum + block.weight, 0);
      return {
        blocks,
        score: total
          ? blocks.reduce((sum, block) => sum + block.score * block.weight, 0) / total
          : 0,
      };
    };
    let best = null;
    for (const dy of [0, -1, 1])
      for (const dx of [0, -1, 1]) {
        const m = measure(pixels(out, fitted, dx, dy));
        if (!best || m.score > best.score) best = m;
      }
    const { blocks, score } = best;
    let heatmap = null;
    if (diff) {
      const canvas = new OffscreenCanvas(width, height),
        context = canvas.getContext('2d');
      context.filter = 'grayscale(1) opacity(.45)';
      context.drawImage(ref, 0, 0, width, height);
      context.filter = 'none';
      for (const block of blocks)
        if (block.score < 0.85) {
          context.fillStyle = `rgba(229,57,53,${Math.min(0.85, (1 - block.score) * 1.2).toFixed(2)})`;
          context.fillRect(block.x, block.y, 8, 8);
        }
      heatmap = canvas
        .convertToBlob({ type: 'image/png' })
        .then((blob) => blob.arrayBuffer())
        .then((buffer) => {
          let binary = '';
          const bytes = new Uint8Array(buffer);
          for (let i = 0; i < bytes.length; i += 32768)
            binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
          return 'data:image/png;base64,' + btoa(binary);
        });
    }
    return Promise.resolve(heatmap).then((diffImage) => ({
      score: Math.round(score * 1000) / 10,
      fitted,
      reference: { width: ref.naturalWidth, height: ref.naturalHeight },
      rendered: { width: out.naturalWidth, height: out.naturalHeight },
      differing: blocks.filter((block) => block.score < 0.85).length / Math.max(1, blocks.length),
      diff: diffImage,
    }));
  });
}

// Renders a website capture in an isolated, script-free page and passes the page to `use`.
const withRendered = (site, options, use) =>
  withDocument(documentFor(site), site.pages[0], options, use);
async function withDocument(html, page, { browser, resource }, use) {
  await browser.start();
  const context = await browser.browser.newContext({
    viewport: { width: page.viewport || 1280, height: 900 },
    javaScriptEnabled: false,
    serviceWorkers: 'block',
    acceptDownloads: false,
  });
  try {
    await context.route('**/*', async (route) => {
      const request = route.request(),
        url = request.url();
      if (url.startsWith('data:')) return route.continue();
      if (request.method() !== 'GET' || !/^https?:/.test(url)) return route.abort();
      // Chromium's own request headers (user agent, accept), as in the reference browser; some sites refuse requests without them.
      try {
        await route.fulfill(
          await resource(url, { ...(await request.allHeaders()), referer: page.url }),
        );
      } catch {
        await route.abort();
      }
    });
    const tab = await context.newPage();
    tab.setDefaultTimeout(15000);
    await tab.setContent(html, { waitUntil: 'load', timeout: 20000 });
    await tab.evaluate(() => document.fonts.ready);
    return await use(tab);
  } finally {
    await context.close();
  }
}

/** Opens one document at several viewport widths in the same sealed, script-free context (export CSS minimiser). */
export async function withDocumentAtWidths(html, page, widths, options, use) {
  return withDocument(html, page, options, async (first) => {
    const tabs = [first];
    await first.setViewportSize({ width: widths[0], height: 900 });
    for (const width of widths.slice(1)) {
      const tab = await first.context().newPage();
      tab.setDefaultTimeout(15000);
      await tab.setViewportSize({ width, height: 900 });
      await tab.setContent(html, { waitUntil: 'load', timeout: 20000 });
      await tab.evaluate(() => document.fonts.ready);
      tabs.push(tab);
    }
    return use(tabs);
  });
}

// The computed-style snapshot taken at capture is written as low-specificity rules at the start of the stylesheet, so
// the site's own :hover and state rules still apply. Contextual site rules whose ancestors were not captured can then
// win with the wrong value (e.g. a generic `.button` size). These are the snapshot rules, parsed back.
const SNAPSHOT = /^(\[data-rf-rendered="\d+"\](?:,\[data-rf-rendered="\d+"\])*)\{([^}]*)\}/;
export function snapshotRules(css) {
  const rules = [];
  let rest = css.trimStart(),
    match;
  while ((match = rest.match(SNAPSHOT))) {
    rules.push({
      ids: [...match[1].matchAll(/"(\d+)"/g)].map((m) => Number(m[1])),
      declarations: [...match[2].matchAll(/([-a-z]+)\s*:\s*((?:[^;"']|"[^"]*"|'[^']*')*)/g)].map(
        (m) => [m[1], m[2].trim()],
      ),
    });
    rest = rest.slice(match[0].length);
  }
  return rules;
}
const MARK = '/* reframe:fidelity-repair */';

// Finds snapshot values the site's rules overrode in a rendered page and returns pinning rules with higher specificity.
async function findRepairs(tab, rules) {
  const fixes = await tab.evaluate(
    ({ rules, defaults }) => {
      const same = (a, b) => {
        if (a === b) return true;
        const x = a.split(/\s+/),
          y = b.split(/\s+/);
        return (
          x.length === y.length &&
          x.every((v, i) => {
            const n = parseFloat(v),
              m = parseFloat(y[i]);
            return (
              v === y[i] ||
              (Number.isFinite(n) &&
                Number.isFinite(m) &&
                v.replace(/^[-\d.]+/, '') === y[i].replace(/^[-\d.]+/, '') &&
                Math.abs(n - m) <= 0.5)
            );
          })
        );
      };
      const groups = new Map();
      for (const { ids, declarations } of rules)
        for (const id of ids) {
          const el = document.querySelector(`[data-rf-rendered="${id}"]`);
          if (!el) continue;
          // Defaults were omitted from the snapshot to keep it small, but are expected values too.
          const expected = [
            ...Object.entries(defaults).filter(
              ([property]) => !declarations.some((d) => d[0] === property),
            ),
            ...declarations,
          ];
          // Width and height are snapshotted as computed values (auto, %, calc), not the laid-out pixels.
          const computed = getComputedStyle(el),
            animated = new Set(
              el
                .getAnimations()
                .flatMap((a) =>
                  a.effect instanceof KeyframeEffect && a.effect.getTiming().iterations === Infinity
                    ? a.effect.getKeyframes().flatMap((frame) => Object.keys(frame))
                    : [],
                )
                .map((property) => property.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())),
            ),
            map = el.computedStyleMap?.(),
            value = (property) =>
              map && (property === 'width' || property === 'height')
                ? String(map.get(property))
                : computed.getPropertyValue(property).trim(),
            wrong = expected.filter(
              ([property, expected]) =>
                !animated.has(property) &&
                !same(value(property), expected) &&
                !same(computed.getPropertyValue(property).trim(), expected),
            );
          if (!wrong.length) continue;
          const block = wrong.map(([property, value]) => property + ':' + value).join(';');
          if (!groups.has(block)) groups.set(block, []);
          groups.get(block).push(id);
        }
      return [...groups].map(([block, ids]) => ({ block, ids }));
    },
    { rules, defaults: SNAPSHOT_DEFAULTS },
  );
  return fixes
    .map(
      ({ block, ids }) =>
        ids
          .map((id) => `[data-rf-rendered="${id}"]:not(#rf-fidelity):not(#rf-fidelity)`)
          .join(',') +
        '{' +
        block +
        '}',
    )
    .join('');
}

// Crops the rendered component with the same fractional box and encoding (JPEG, quality 65) as the reference, so
// rounding and compression artifacts do not count as differences.
async function shoot(tab, site, selector = '[data-rf-rendered="0"]') {
  // The saved root carries snapshot index 0; older captures fall back to the first element.
  const root = tab.locator(selector),
    target = (await root.count()) ? root.first() : tab.locator('body > *').first();
  const box = (await target.count()) ? await target.boundingBox() : null;
  if (!box || box.width < 1 || box.height < 1)
    throw new Error('The saved component has no visible content to compare.');
  return tab.screenshot({
    type: 'jpeg',
    quality: 65,
    animations: 'disabled',
    timeout: 10000,
    fullPage: box.y + box.height > 900 || box.x + box.width > (site.pages[0].viewport || 1280),
    clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height },
  });
}

async function measure(browser, reference, shot, diff) {
  // The comparison needs image events, so it runs in a separate script-enabled context that has no network at all.
  const sealed = await browser.browser.newContext();
  try {
    await sealed.route('**/*', (route) => route.abort());
    const result = await (
      await sealed.newPage()
    ).evaluate(compare, {
      reference,
      rendered: 'data:image/jpeg;base64,' + shot.toString('base64'),
      diff,
    });
    return {
      ...result,
      grade: fidelityGrade(result.score),
      checkedAt: new Date().toISOString(),
      ...(diff
        ? { renderedImage: 'data:image/jpeg;base64,' + shot.toString('base64') }
        : { diff: undefined }),
    };
  } finally {
    await sealed.close();
  }
}

/**
 * At capture: renders once, pins snapshot values the site's own rules overrode (keeping its hover and state rules
 * for everything else), then scores the repaired result. Returns the stylesheet to save and its fidelity.
 */
/** @param {import('./contracts.js').RenderingOptions} options */
export async function repairAndScore(item, options = {}) {
  const { browser, resource = referenceResource } = options;
  const site = validateReplica(item.feature.spec.website),
    css = site.css.split(MARK)[0],
    rules = snapshotRules(css);
  let repaired = css;
  const shot = await withRendered({ ...site, css }, { browser, resource }, async (tab) => {
    // A pin can expose another override (pinning display:block lets a site `width:auto` fill the row), so the
    // check repeats on the repaired page until nothing else differs.
    let all = '';
    for (let pass = 0; pass < 3 && rules.length; pass++) {
      const pins = await findRepairs(tab, rules);
      if (!pins || (css + MARK + all + pins).length >= 500000) break;
      all += pins;
      await tab.evaluate((pins) => {
        const style = document.createElement('style');
        style.textContent = pins;
        document.head.append(style);
      }, pins);
    }
    if (all) repaired = css + MARK + all;
    return canScore(item) ? shoot(tab, site) : null;
  });
  return {
    css: repaired,
    fidelity: shot ? await measure(browser, item.referenceImage, shot, false) : null,
  };
}

/**
 * Finishes a fresh capture the same way for every source (reference browser or extension): pins overridden snapshot
 * styles and scores the result. Neither step can block the capture.
 */
export async function finishCapture(item, { browser, resource = referenceResource, rebuild }) {
  try {
    const site = item.feature.spec.website,
      { css, fidelity } = await repairAndScore(item, { browser, resource });
    if (css !== site.css) item = { ...item, feature: await rebuild(item, { ...site, css }) };
    if (fidelity) {
      const { score, grade, fitted, reference, rendered, differing, checkedAt } = fidelity;
      item = {
        ...item,
        fidelity: { score, grade, fitted, reference, rendered, differing, checkedAt },
      };
    }
  } catch {
    /* The unrepaired, unscored capture is kept and can be checked later. */
  }
  return item;
}

/** Scores one saved component. `browser` is the shared ReferenceBrowser, whose Chromium and network policy are reused. */
/** @param {import('./contracts.js').RenderingOptions} options */
export async function scoreFidelity(item, options = {}) {
  const { browser, resource = referenceResource, diff = false } = options;
  if (!canScore(item))
    throw new Error(
      'Fidelity needs a component picked in the reference browser, with its original reference image.',
    );
  const site = validateReplica(item.feature.spec.website);
  return measure(
    browser,
    item.referenceImage,
    await withRendered(site, { browser, resource }, (tab) => shoot(tab, site)),
    diff,
  );
}

/** Scores exported code (scoped stylesheet and markup) against the reference, the same way as a saved capture. */
/** @param {import('./contracts.js').RenderingOptions} options */
export async function scoreExport(item, { css, markup, scope, fonts, rootSelector }, options = {}) {
  const { browser, resource = referenceResource, state = 'default', diff = false } = options;
  if (!canScore(item)) return null;
  const site = validateReplica(item.feature.spec.website),
    page = site.pages[0];
  const inline = css.replace(/url\("\.\/(fonts\/[\w.]+)"\)/g, (all, file) =>
    fonts[file] ? `url("data:font/${file.split('.').pop()};base64,${fonts[file]}")` : all,
  );
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${inline.replace(/<\/style/gi, '')}html,body{margin:0;padding:0;background:${page.backdrop || '#ffffff'}}${space(page)}</style></head><body>${markup}</body></html>`;
  const shot = await withDocument(html, page, { browser, resource }, async (tab) => {
    const root = tab.locator(rootSelector || `.${scope}-0`);
    if (state === 'hover') await root.hover();
    if (state === 'focus') {
      const candidate = await root.evaluate((el) =>
        el.matches('a[href],button,input,textarea,select,[tabindex="0"]'),
      );
      if (candidate) await root.focus();
      else {
        const focusable = root
          .locator('a[href],button,input,textarea,select,[tabindex="0"]')
          .first();
        if (await focusable.count()) await focusable.focus();
      }
    }
    return shoot(tab, site, rootSelector || `.${scope}-0`);
  });
  const result = await measure(browser, item.referenceImage, shot, diff),
    { score, grade, fitted, reference, rendered, differing, checkedAt } = result;
  return {
    score,
    grade,
    fitted,
    reference,
    rendered,
    differing,
    checkedAt,
    ...(diff ? { diff: result.diff, renderedImage: result.renderedImage } : {}),
  };
}
