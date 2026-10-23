// Library organisation: automatic tags derived from each saved component (site, element type, fonts, main colors),
// the user's own tags and collections, and the search, filters and sorting built on them. Auto tags are derived, not
// stored, so every existing component gets them without a migration.
import { collectAssets } from './assets.js';
import { componentReadiness } from '../component-workflow.js';

export const ELEMENT_TYPES = [
  'Navigation',
  'Header',
  'Footer',
  'Hero',
  'Card',
  'Button',
  'Form',
  'List',
  'Media',
  'Text',
  'Section',
  'Original',
];
export const SORTS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['name', 'Name A–Z'],
  ['match', 'Best match first'],
];
const LIMIT = { tags: 20, collections: 10, length: 40 };

export const siteOf = (item) => {
  try {
    return new URL(item.source).hostname.replace(/^www\./, '');
  } catch {
    return item.libraryId ? 'Reframe Originals' : 'Local';
  }
};

function rootOf(item) {
  const page = item.feature?.spec?.website?.pages?.[0];
  const html = (page?.html || item.html || '').trim();
  const match = html.match(/<([a-z][\w-]*)\b([^>]*)>/i);
  return {
    tag: match?.[1].toLowerCase() || '',
    attributes: match?.[2] || '',
    html,
    height: page?.height || item.fidelity?.reference?.height || 0,
  };
}

/** The kind of interface element a component is, from its root element, contents and size. */
export function elementType(item) {
  if (item.libraryId) return 'Original';
  const { tag, attributes, html, height } = rootOf(item);
  const cls = (attributes.match(/\bclass="([^"]*)"/i)?.[1] || '').toLowerCase(),
    role = attributes.match(/\brole="([^"]*)"/i)?.[1] || '';
  const has = (pattern) => pattern.test(html);
  if (
    tag === 'nav' ||
    role === 'navigation' ||
    /(?:^|[\s_-])(?:nav|navbar|navigation|menu|globalnav|menubar)(?:$|[\s_-])/.test(cls)
  )
    return 'Navigation';
  if (tag === 'header' || role === 'banner') return 'Header';
  if (tag === 'footer' || role === 'contentinfo') return 'Footer';
  if (
    tag === 'form' ||
    tag === 'fieldset' ||
    role === 'search' ||
    has(/<(?:input|textarea|select)\b/i)
  )
    return 'Form';
  if (
    tag === 'button' ||
    role === 'button' ||
    (tag === 'a' &&
      (/(?:^|[\s_-])(?:btn|button|cta)(?:$|[\s_-])/.test(cls) ||
        (height > 0 && height < 80 && !has(/<(?:div|section|p|h[1-6]|ul|img)\b/i))))
  )
    return 'Button';
  if (tag === 'ul' || tag === 'ol' || tag === 'dl') return 'List';
  if (['img', 'picture', 'svg', 'video', 'figure'].includes(tag)) return 'Media';
  if (/^(?:h[1-6]|p|blockquote)$/.test(tag)) return 'Text';
  if (has(/<h[12]\b/i) && height >= 300) return 'Hero';
  if (
    tag === 'article' ||
    /(?:^|[\s_-])(?:card|tile|panel|pricing)(?:$|[\s_-])/.test(cls) ||
    (has(/<h[1-6]\b/i) && (!height || height < 600))
  )
    return 'Card';
  return 'Section';
}

// Derivation reads styles and markup, so results are cached per saved object (items are replaced, never mutated).
const cache = new WeakMap();
/** Automatic tags: site, element type, font families and up to three main colors. */
export function autoTags(item) {
  if (item._summary && item.automatic) return item.automatic;
  let tags = cache.get(item);
  if (!tags) {
    const assets = collectAssets([item]);
    const root = item.feature?.spec?.website?.pages?.[0]?.rootStyle
      ?.match(/font-family:\s*(['"]?)([^,;'"]+)/i)?.[2]
      ?.trim();
    const fonts = [
      ...new Set([...assets.fonts.map((f) => f.family), ...(root ? [root] : [])]),
    ].slice(0, 6);
    tags = {
      site: siteOf(item),
      type: elementType(item),
      fonts,
      colors: assets.colors.slice(0, 3).map((c) => c.hex),
    };
    cache.set(item, tags);
  }
  return tags;
}

/** User tags: trimmed, lower case, single spaces, letters/digits/space/-/_ only, at most 40 characters. */
export function normalizeTag(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMIT.length);
}
/** Collection names keep their capitalisation. */
export function normalizeCollection(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _&'.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMIT.length);
}
const validList = (list, normalize, max) =>
  list === undefined ||
  (Array.isArray(list) &&
    list.length <= max &&
    list.every((v) => typeof v === 'string' && v.length > 0 && normalize(v) === v) &&
    new Set(list).size === list.length);
export const validOrganisation = (item) =>
  validList(item.tags, normalizeTag, LIMIT.tags) &&
  validList(item.collections, normalizeCollection, LIMIT.collections);
export const withTags = (list, add, normalize = normalizeTag, max = LIMIT.tags) => {
  const value = normalize(add);
  return value && !list.includes(value) ? [...list, value].slice(0, max) : list;
};
export const addCollection = (list, name) =>
  withTags(list, name, normalizeCollection, LIMIT.collections);

/** Everything a search can match: name, source, readiness, auto tags, user tags and collections. */
export function searchText(item) {
  const auto = autoTags(item);
  return [
    item.name,
    item.source,
    componentReadiness(item).label,
    auto.site,
    auto.type,
    ...auto.fonts,
    ...auto.colors,
    ...(item.tags || []),
    ...(item.collections || []),
  ]
    .join(' ')
    .toLowerCase();
}

/** Every word of the query must match somewhere; facets narrow further. */
export function matchesLibrary(
  item,
  { query = '', type = '', site = '', collection = '', tag = '' } = {},
) {
  const auto = autoTags(item),
    text = searchText(item);
  return (
    (!type || auto.type === type) &&
    (!site || auto.site === site) &&
    (!collection || (item.collections || []).includes(collection)) &&
    (!tag || (item.tags || []).includes(tag)) &&
    query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => text.includes(word))
  );
}

export function sortLibrary(items, by = 'newest') {
  const time = (item) => Date.parse(item.capturedAt) || 0;
  const order =
    {
      newest: (a, b) => time(b) - time(a),
      oldest: (a, b) => time(a) - time(b),
      name: (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
      match: (a, b) => (b.fidelity?.score ?? -1) - (a.fidelity?.score ?? -1) || time(b) - time(a),
    }[by] || (() => 0);
  return [...items].sort(order);
}

/** Facet values with counts, most common first, for the filter menus. */
export function facets(items) {
  const count = (values) => {
    const map = new Map();
    for (const v of values) map.set(v, (map.get(v) || 0) + 1);
    return [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  };
  return {
    types: count(items.map((i) => autoTags(i).type)),
    sites: count(items.map((i) => autoTags(i).site)),
    collections: count(items.flatMap((i) => i.collections || [])),
    tags: count(items.flatMap((i) => i.tags || [])),
  };
}
