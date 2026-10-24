import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { readRendered, prepareReplica, validateReplica } from './replica.js';
const identity = (html) => {
  const $ = load(html, null, false);
  return $('*')
    .toArray()
    .map((el) =>
      el.type === 'tag' ? [el.name, el.attribs.id || '', el.attribs.role || ''].join('|') : '',
    )
    .join('\n');
};
const hash = (text) => createHash('sha256').update(text).digest('hex');

export function validateVariants(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 9 || JSON.stringify(value).length > 8_000_000)
    throw Error('Capture variants exceed the supported size.');
  const keys = new Set();
  return value.map((v) => {
    if (
      ![390, 768, 1280].includes(v.width) ||
      !['default', 'hover', 'focus'].includes(v.state) ||
      keys.has(v.width + v.state)
    )
      throw Error('Invalid responsive capture variant.');
    keys.add(v.width + v.state);
    if (
      typeof v.referenceImage !== 'string' ||
      v.referenceImage.length > 2_000_000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v.referenceImage)
    )
      throw Error('Invalid state reference image.');
    return {
      width: v.width,
      state: v.state,
      website: validateReplica(v.website),
      referenceImage: v.referenceImage,
      identity: String(v.identity || '').slice(0, 64),
    };
  });
}

/** Explicitly invoked in the isolated browser; never resizes the user's own extension tab. */
export async function captureVariants(entry, { resource }) {
  const page = entry.page,
    originalViewport = page.viewportSize(),
    oldWrites = entry.writeOrigin,
    position = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const selected = page.locator('[data-rf-picked]');
  if ((await selected.count()) !== 1) throw Error('Pick exactly one component first.');
  const fingerprint = await selected.evaluate((el) => ({
    tag: el.tagName,
    id: el.id,
    label: el.getAttribute('aria-label'),
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
  }));
  const original = await readRendered(page, '[data-rf-picked]'),
    structure = identity(original.html),
    variants = [],
    warnings = [];
  entry.writeOrigin = null;
  try {
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      const match = await page.evaluate((f) => {
        let nodes = [...document.querySelectorAll('[data-rf-picked]')];
        const matches = (el) =>
          el.tagName === f.tag &&
          (f.id
            ? el.id === f.id
            : el.getAttribute('aria-label') === f.label &&
              (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) === f.text);
        nodes = nodes.filter(matches);
        if (nodes.length !== 1) nodes = [...document.getElementsByTagName(f.tag)].filter(matches);
        if (nodes.length !== 1) return false;
        document
          .querySelectorAll('[data-rf-picked]')
          .forEach((el) => el.removeAttribute('data-rf-picked'));
        nodes[0].setAttribute('data-rf-picked', 'true');
        return true;
      }, fingerprint);
      if (!match) {
        warnings.push(`${width}px: the component could not be uniquely re-identified.`);
        continue;
      }
      for (const state of ['default', 'hover', 'focus']) {
        await page.mouse.move(width - 1, 899);
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        if (state === 'hover') await selected.hover();
        if (state === 'focus') {
          const target = selected
            .locator('a[href],button,input,textarea,select,[tabindex="0"]')
            .first();
          if (
            await selected.evaluate((el) =>
              el.matches('a[href],button,input,textarea,select,[tabindex="0"]'),
            )
          )
            await selected.focus();
          else if (await target.count()) await target.focus();
          else {
            warnings.push(`${width}px: no keyboard-focusable control in this region.`);
            continue;
          }
        }
        await page.waitForTimeout(120);
        const raw = await readRendered(page, '[data-rf-picked]');
        if (identity(raw.html) !== structure) {
          warnings.push(
            `${width}px ${state}: the element tree changed; this variant needs manual mapping.`,
          );
          continue;
        }
        const website = await prepareReplica([raw], { resource });
        await selected.scrollIntoViewIfNeeded();
        const box = await selected.boundingBox();
        if (!box || box.width < 1 || box.height < 1 || box.height > 3000 || box.width > 4000) {
          warnings.push(`${width}px ${state}: component is hidden or exceeds the capture bounds.`);
          continue;
        }
        await page.evaluate(() => {
          const root = document.querySelector('[data-rf-picked]');
          for (let el = root; el?.parentElement; el = el.parentElement)
            for (const sibling of el.parentElement.children)
              if (sibling !== el) sibling.setAttribute('data-rf-variant-isolate', '');
          const style = document.createElement('style');
          style.id = 'rf-variant-isolation';
          style.textContent = '[data-rf-variant-isolate]{visibility:hidden!important}';
          document.head.append(style);
        });
        let referenceImage;
        try {
          // Same fractional crop as the main reference (an element screenshot rounds to whole pixels).
          const { clip, fullPage } = await selected.evaluate((el) => {
            const r = el.getBoundingClientRect(),
              fullPage = r.bottom > innerHeight || r.right > innerWidth || r.top < 0;
            return {
              fullPage,
              clip: {
                x: r.x + (fullPage ? scrollX : 0),
                y: r.y + (fullPage ? scrollY : 0),
                width: r.width,
                height: r.height,
              },
            };
          });
          referenceImage =
            'data:image/jpeg;base64,' +
            (
              await page.screenshot({
                type: 'jpeg',
                quality: 65,
                animations: 'disabled',
                fullPage,
                clip,
              })
            ).toString('base64');
        } finally {
          await page.evaluate(() => {
            document.getElementById('rf-variant-isolation')?.remove();
            document
              .querySelectorAll('[data-rf-variant-isolate]')
              .forEach((el) => el.removeAttribute('data-rf-variant-isolate'));
          });
        }
        variants.push({ width, state, website, referenceImage, identity: hash(structure) });
      }
    }
    return { variants: validateVariants(variants), warnings };
  } finally {
    await page.mouse.move(0, 0);
    await page.setViewportSize(originalViewport);
    await page.evaluate((p) => scrollTo(p.x, p.y), position);
    entry.writeOrigin = oldWrites;
  }
}
