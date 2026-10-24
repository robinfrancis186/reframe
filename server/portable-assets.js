import { load } from 'cheerio';
import postcss from 'postcss';
import { referenceResource, referenceUrl } from './browser-network.js';

const LIMIT = 750000;
export function rasterType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  if (
    bytes.subarray(4, 8).toString() === 'ftyp' &&
    /^(avif|avis)$/.test(bytes.subarray(8, 12).toString())
  )
    return 'image/avif';
  return null;
}
export function safeImageData(value) {
  const match = /^data:(image\/(?:png|jpeg|gif|webp|avif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    value || '',
  );
  if (!match || match[2].length > (LIMIT * 4) / 3 + 4) return false;
  const bytes = Buffer.from(match[2], 'base64');
  return bytes.toString('base64') === match[2] && rasterType(bytes) === match[1];
}

/**
 * Inline SVG images (`url("data:image/svg+xml,...")`, common for icons and logos). Rendered as images they cannot
 * run scripts; they are still only kept when small, self-contained and free of scripting or external references.
 */
export function safeSvgData(value) {
  const match = /^data:image\/svg\+xml(?:;charset=[\w-]+)?(;base64)?,([\s\S]*)$/i.exec(value || '');
  if (!match || match[2].length > 200000) return false;
  let text;
  try {
    const unescaped = match[2]
      .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/\\(.)/g, '$1');
    text = match[1]
      ? Buffer.from(unescaped, 'base64').toString('utf8')
      : decodeURIComponent(unescaped);
  } catch {
    return false;
  }
  return (
    text.length <= 100000 &&
    /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text) &&
    !/<(?:script|foreignObject|iframe|object|embed|!ENTITY|!DOCTYPE)|\son[a-z]+\s*=|javascript:|\b(?:href|src)\s*=\s*(?!["']?\s*#)|url\(\s*(?!["']?\s*#)/i.test(
      text,
    )
  );
}

// Only public, bounded raster resources are embedded. SVG documents need a separate sanitizer.
export async function bundleImages(site, resource = referenceResource) {
  site.warnings = site.warnings.filter(
    (w) => !w.startsWith('Asset remains external') && !w.startsWith('Asset count exceeds'),
  );
  const stylesheet = postcss.parse(site.css);
  // An embedded font is sufficient; remove unused online fallbacks rather than fetching them as images.
  stylesheet.walkAtRules('font-face', (rule) =>
    rule.walkDecls('src', (decl) => {
      const embedded = decl.value.match(/url\("data:font\/[^" ]+"\)/);
      if (embedded) decl.value = embedded[0];
    }),
  );
  site.css = stylesheet.toString();
  const urls = new Set();
  const documents = site.pages.map((p) => load(p.html, null, false));
  documents.forEach(($, i) =>
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (!src || src.startsWith('data:')) return;
      try {
        const url = referenceUrl(new URL(src, site.pages[i].url).href).href;
        $(el).attr('src', url);
        urls.add(url);
      } catch {
        /* Invalid sources are reported, never fetched. */
      }
    }),
  );
  for (const m of site.css
    .replace(/@font-face\s*\{[^}]*\}/gi, '')
    .matchAll(/url\(\s*['"]?(https?:[^'"\s)]+)['"]?\s*\)/g))
    urls.add(m[1]);
  const results = new Map(),
    list = [...urls].slice(0, 32);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, list.length) }, async () => {
      while (next < list.length) {
        const source = list[next++];
        try {
          let url = referenceUrl(source),
            response;
          for (let hop = 0; hop <= 5; hop++) {
            response = await resource(url.href, {
              accept: 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.1',
            });
            if (![301, 302, 303, 307, 308].includes(response.status)) break;
            if (!response.headers.location || hop === 5) throw new Error('Redirect limit reached');
            url = referenceUrl(new URL(response.headers.location, url).href);
          }
          const type = rasterType(response.body);
          if (response.status !== 200 || !type) throw new Error('Unsupported or unavailable image');
          if (response.body.length > LIMIT) throw new Error('Image exceeds 750 KB');
          results.set(source, `data:${type};base64,${response.body.toString('base64')}`);
        } catch (e) {
          site.warnings.push(`Asset remains external: ${source} · ${e.message}`);
        }
      }
    }),
  );
  if (urls.size > 32)
    site.warnings.push(
      'Asset count exceeds the 32-resource capture limit; remaining resources stay external.',
    );
  let total = 0;
  documents.forEach(($, i) => {
    let room = Math.max(0, 1450000 - $.html().length);
    $('img[src]').each((_, el) => {
      const url = $(el).attr('src'),
        data = results.get(url);
      if (!data) return;
      if (data.length > room || total + data.length > 2400000) {
        site.warnings.push(`Asset remains external (package budget): ${url}`);
        return;
      }
      $(el).attr('src', data);
      room -= data.length;
      total += data.length;
    });
    site.pages[i].html = $.html();
  });
  let room = Math.max(0, 480000 - site.css.length);
  site.css = site.css.replace(/url\(\s*['"]?(https?:[^'"\s)]+)['"]?\s*\)/g, (all, url) => {
    const data = results.get(url);
    if (!data) return all;
    if (data.length > room || total + data.length > 2400000) {
      site.warnings.push(`Asset remains external (stylesheet budget): ${url}`);
      return all;
    }
    room -= data.length;
    total += data.length;
    return `url("${data}")`;
  });
  return site;
}
