import { load } from 'cheerio';
import { cleanHtml } from './capture.js';
import { parse } from '@babel/parser';

// Deliberately conservative: only visible prose changes, never code, attributes or behavior.
const phrases = [
  [/\bin order to\b/gi, 'to'],
  [/\bat this point in time\b/gi, 'now'],
  [/\ba wide range of\b/gi, 'many'],
  [/\butilize\b/gi, 'use'],
  [/\butilizing\b/gi, 'using'],
  [/\bfacilitate\b/gi, 'help'],
  [/\bcommence\b/gi, 'start'],
  [/\bprior to\b/gi, 'before'],
];
export function refineCopy(html) {
  if (typeof html !== 'string' || !html.trim() || html.length > 500_000)
    throw new Error('Choose component HTML under 500 KB.');
  const before = cleanHtml(html),
    $ = load(before, null, false),
    edits = [];
  function walk(node, protectedText = false) {
    const protectedNode =
      protectedText ||
      ['code', 'pre', 'textarea', 'kbd', 'samp', 'script', 'style'].includes(node.name);
    if (node.type === 'text' && !protectedNode) {
      const original = node.data;
      node.data = refineText(node.data);
      if (node.data !== original) edits.push({ before: original.trim(), after: node.data.trim() });
    }
    for (const child of node.children || []) walk(child, protectedNode);
  }
  walk($.root()[0]);
  return {
    before,
    html: $.html(),
    edits,
    engine: 'Reframe Copy Polish',
    limitation:
      'Conservative wording suggestions. Review meaning and tone; this is not an AI detector or a guarantee of human authorship.',
  };
}

export function refineText(text) {
  for (const [pattern, replacement] of phrases)
    text = text.replace(pattern, (match) =>
      /^[A-Z]/.test(match) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement,
    );
  return text;
}
export function refineSourceComments(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > 500000)
    throw new Error('Use JavaScript or TypeScript source under 500 KB.');
  const ast = parse(source, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'] });
  const edits = [];
  let code = source;
  for (const comment of [...ast.comments].reverse()) {
    // Comments can carry type, bundler and coverage semantics, so leave directives untouched.
    if (
      /^!|^\s*[:*]|@\w|copyright|sourceMappingURL|sourceURL|eslint|prettier|shortcut:|__PURE__|__NO_SIDE_EFFECTS__|istanbul|\bc8\b|\bv8\b|webpack|vite|rollup|<reference|<amd-/i.test(
        comment.value,
      )
    )
      continue;
    const before = source.slice(comment.start, comment.end),
      after = refineText(before);
    if (before !== after) {
      code = code.slice(0, comment.start) + after + code.slice(comment.end);
      edits.unshift({ before, after });
    }
  }
  parse(code, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'] });
  return {
    code,
    edits,
    engine: 'Reframe Copy Polish',
    limitation:
      'Independent JS/TS comment-only wording review. Strings, identifiers, executable code and tool directives are preserved. No detector or authorship claims.',
  };
}
