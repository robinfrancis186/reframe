// Shared asset library derived from saved components: each font face, color, icon and image appears once,
// with the components (and source sites) that use it. Derived on demand, so it can never drift from the clipboard.
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Local';
  }
};
const pagesOf = (item) => item.feature?.spec?.website?.pages || [];
const markupOf = (item) =>
  [item.html, ...pagesOf(item).map((page) => page.html)]
    .filter((s) => typeof s === 'string')
    .join('\n');
const cssOf = (item) =>
  typeof item.feature?.spec?.website?.css === 'string' ? item.feature.spec.website.css : '';

function add(map, key, value, item) {
  let entry = map.get(key);
  if (!entry) map.set(key, (entry = { ...value, usedBy: [] }));
  if (!entry.usedBy.some((use) => use.id === item.id))
    entry.usedBy.push({ id: item.id, name: item.name, site: host(item.source) });
  return entry;
}

export function hexColor(value) {
  const v = String(value).trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length === 8) {
      if (h.slice(6) === '00') return null;
      h = h.slice(0, 6);
    }
    return h.length === 6 ? '#' + h : null;
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  return (
    '#' +
    m
      .slice(1, 4)
      .map((n) =>
        Math.max(0, Math.min(255, Math.round(+n)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

export function fontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/gi)]
    .map(([, body]) => {
      const family = body.match(/font-family\s*:\s*(['"]?)([^;'"}]+)\1/i)?.[2].trim();
      const src = body.match(/url\(\s*(['"]?)([^'")]+)\1\s*\)/i)?.[2];
      if (!family || !src) return null;
      return {
        family,
        weight: (body.match(/font-weight\s*:\s*([^;}]+)/i)?.[1] || '400').trim(),
        style: /font-style\s*:\s*(?:italic|oblique)/i.test(body) ? 'italic' : 'normal',
        src,
        embedded: src.startsWith('data:font/') || src.startsWith('reframe-font:'),
      };
    })
    .filter(Boolean);
}

/** Collects unique fonts, colors, icons and images from saved components. */
export function collectAssets(items) {
  const fonts = new Map(),
    colors = new Map(),
    icons = new Map(),
    images = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string') continue;
    const css = cssOf(item),
      markup = markupOf(item);
    for (const face of fontFaces(css))
      add(
        fonts,
        [
          face.family.toLowerCase(),
          face.weight,
          face.style,
          face.src.length,
          face.src.slice(-48),
        ].join('|'),
        face,
        item,
      );
    for (const [, value] of `${css}\n${markup}`.matchAll(
      /(?:^|[\s;{"'])(?:color|background-color|border(?:-top|-right|-bottom|-left)?-color|fill|stroke)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi,
    )) {
      const hex = hexColor(value);
      if (hex) add(colors, hex, { hex, count: 0 }, item).count++;
    }
    for (const [svg] of markup.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) {
      if (svg.length > 20000 || /<script|on\w+\s*=|javascript:/i.test(svg)) continue;
      const markupKey = svg
        .replace(/\s+/g, ' ')
        .replace(/\s(?:class|id|data-rf-[\w-]+)="[^"]*"/g, '');
      add(
        icons,
        markupKey,
        {
          svg: /xmlns=/.test(svg)
            ? svg
            : svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"'),
        },
        item,
      );
    }
    for (const [, src] of markup.matchAll(/<img\b[^>]*?\ssrc="(https?:\/\/[^"]+)"/gi))
      add(images, src, { src, site: host(src) }, item);
  }
  const ordered = (map) => [...map.values()].sort((a, b) => b.usedBy.length - a.usedBy.length);
  return {
    fonts: ordered(fonts).sort(
      (a, b) =>
        a.family.localeCompare(b.family) ||
        a.style.localeCompare(b.style) ||
        parseInt(a.weight) - parseInt(b.weight),
    ),
    colors: ordered(colors)
      .sort((a, b) => b.count - a.count)
      .slice(0, 120),
    icons: ordered(icons).slice(0, 300),
    images: ordered(images).slice(0, 300),
  };
}

/** Safe rendering of a captured SVG: an image never runs scripts or loads the page's resources. */
export const svgDataUri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
