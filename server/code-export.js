import postcss from 'postcss';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { validateReplica } from './replica.js';

// Exports a picked website component as plain source: a React component (JSX) or static HTML, one stylesheet scoped
// under a single wrapper class so it cannot leak into the destination app, and embedded fonts as separate files.
// No original scripts are included; the markup and styles are the sanitized capture.
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const SVG_TAGS = Object.fromEntries(
  [
    'linearGradient',
    'radialGradient',
    'clipPath',
    'textPath',
    'foreignObject',
    'feGaussianBlur',
    'feOffset',
    'feBlend',
    'feColorMatrix',
    'feComposite',
    'feFlood',
    'feMerge',
    'feMergeNode',
    'animateTransform',
  ].map((tag) => [tag.toLowerCase(), tag]),
);
const ATTRIBUTES = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  autocomplete: 'autoComplete',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  crossorigin: 'crossOrigin',
  enctype: 'encType',
  'accept-charset': 'acceptCharset',
  'http-equiv': 'httpEquiv',
  'xlink:href': 'xlinkHref',
  'xml:space': 'xmlSpace',
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  referrerpolicy: 'referrerPolicy',
  spellcheck: 'spellCheck',
  contenteditable: 'contentEditable',
  inputmode: 'inputMode',
  enterkeyhint: 'enterKeyHint',
};
const BOOLEAN = new Set([
  'disabled',
  'required',
  'open',
  'hidden',
  'multiple',
  'checked',
  'selected',
  'readonly',
  'autofocus',
  'novalidate',
  'reversed',
  'loop',
  'muted',
  'controls',
  'playsinline',
]);
// Attributes that only drive Reframe's capture and replica runtime.
// Whitespace between two of these never renders, so it is left out of the JSX.
const BLOCK = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'dd',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'thead',
  'tfoot',
  'tr',
  'td',
  'th',
  'ul',
  'picture',
  'source',
  'option',
  'select',
]);
// Properties a component inherits from the page's html/body.
const INHERITED =
  /^(?:--|font|color$|line-height|letter-spacing|word-spacing|text-(?:align|indent|transform|rendering|shadow|decoration-skip|size-adjust|underline)|white-space|direction|cursor|quotes|tab-size|hyphens|-webkit-(?:font-smoothing|text-size-adjust|tap-highlight-color)|-moz-osx-font-smoothing|font-feature-settings|font-variant|writing-mode|caret-color|accent-color|color-scheme)/i;
const INTERNAL = /^data-rf-(?:picked|unavailable|form|image-loaded|isolate)$/;

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
export const componentName = (name) => {
  const words = String(name || '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  const id = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return /^[A-Z]/.test(id) ? id.slice(0, 60) : 'Captured' + id.slice(0, 50) || 'CapturedComponent';
};
const scopeFor = (item) =>
  'rfx-' +
  createHash('sha256')
    .update(String(item.feature?.spec?.id || item.id))
    .digest('hex')
    .slice(0, 6);

function styleObject(style) {
  const entries = [];
  for (const [, property, value] of String(style).matchAll(
    /(--[\w-]+|[a-zA-Z-]+)\s*:\s*((?:[^;"'(]|"[^"]*"|'[^']*'|\([^)]*\))*)/g,
  )) {
    if (!value.trim()) continue;
    const key = property.startsWith('--') ? property : camel(property.replace(/^-ms-/, 'ms-'));
    entries.push(
      `${/^[A-Za-z]\w*$/.test(key) ? key : JSON.stringify(key)}: ${JSON.stringify(value.trim())}`,
    );
  }
  return entries.length ? `{{ ${entries.join(', ')} }}` : '';
}

/** Rewrites captured CSS so every rule applies only inside the wrapper, and moves embedded fonts to files. */
export function scopeCss(css, scope, rem = 16) {
  const fonts = {},
    root = postcss.parse(css);
  const page = new RegExp(`\\.${scope}-(?:html|body)(?:[.#[:][^\\s>+~]*)?$`);
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const selectors = rule.selectors.map((selector) => {
      const local = selector
        .trim()
        .replace(/\[data-rf-rendered="(\d+)"\]/g, (_, n) => `.${scope}-${n}`)
        .replace(/(^|[\s>+~(,])(?::root|html)(?=$|[\s>+~.#[:)])/g, `$1.${scope}-html`)
        .replace(/(^|[\s>+~(,])body(?=$|[\s>+~.#[:)])/g, `$1.${scope}-body`);
      return `.${scope} ${local}`;
    });
    // Rules for the page's html/body now style the wrapper: keep what children inherit (type, color, variables), not
    // the page's own background, spacing or height.
    const roots = selectors.filter((selector) => page.test(selector)),
      others = selectors.filter((selector) => !page.test(selector));
    if (!roots.length) {
      rule.selectors = selectors;
      return;
    }
    const inherited = rule.clone({ selectors: roots });
    inherited.walkDecls((decl) => {
      if (!INHERITED.test(decl.prop)) decl.remove();
    });
    if (others.length) {
      rule.selectors = others;
      if (inherited.nodes.length) rule.before(inherited);
    } else if (inherited.nodes.length) rule.replaceWith(inherited);
    else rule.remove();
  });
  root.walkDecls((decl) => {
    // rem meant the source page's root font size; exported code must not depend on the destination's.
    if (/\drem\b/i.test(decl.value) && !/url\(/i.test(decl.value))
      decl.value = decl.value.replace(
        /(-?\d*\.?\d+)rem\b/gi,
        (_, n) => `${Math.round(parseFloat(n) * rem * 1000) / 1000}px`,
      );
    decl.value = decl.value.replace(
      /url\(\s*(["']?)data:font\/(woff2|woff|ttf);base64,([A-Za-z0-9+/=]+)\1\s*\)/g,
      (_, quote, type, data) => {
        const file = `fonts/${createHash('sha256').update(data).digest('hex').slice(0, 16)}.${type}`;
        fonts[file] = data;
        return `url("./${file}")`;
      },
    );
  });
  return { css: root.toString(), fonts };
}

/** Converts sanitized capture markup to JSX, turning snapshot indexes into scoped class names. */
export function toJsx(html, scope, indent = '          ') {
  const $ = load(html, null, false);
  const attributes = (el) => {
    const out = [],
      classes = [];
    for (const [name, value] of Object.entries(el.attribs || {})) {
      if (INTERNAL.test(name)) continue;
      if (name === 'data-rf-rendered') {
        classes.push(`${scope}-${value}`);
        continue;
      }
      if (name === 'class') {
        classes.unshift(...value.split(/\s+/).filter(Boolean));
        continue;
      }
      if (name === 'style') {
        const object = styleObject(value);
        if (object) out.push('style=' + object);
        continue;
      }
      // Typed field values are never exported; option values are needed for the select to work.
      if (name === 'selected' || name === 'srcset' || (name === 'value' && el.name !== 'option'))
        continue;
      if (name === 'checked') {
        out.push('defaultChecked');
        continue;
      }
      const prop =
        ATTRIBUTES[name] ||
        (/^(?:aria|data)-/.test(name)
          ? name
          : name.includes('-') || name.includes(':')
            ? camel(name.replace(':', '-'))
            : name);
      out.push(
        BOOLEAN.has(name) && (value === '' || value === name)
          ? prop
          : `${prop}=${JSON.stringify(value)}`,
      );
    }
    if (el.name === 'select') {
      const chosen = $(el).find('option[selected]').first().attr('value');
      if (chosen !== undefined) out.push('defaultValue=' + JSON.stringify(chosen));
    }
    if (el.name === 'form') out.push('onSubmit={(event) => event.preventDefault()}');
    if (classes.length) out.unshift(`className=${JSON.stringify(classes.join(' '))}`);
    return out.length ? ' ' + out.join(' ') : '';
  };
  const walk = (node, pad) => {
    if (node.type === 'text') {
      const text = node.data;
      if (/\S/.test(text)) return pad + '{' + JSON.stringify(text.replace(/\s+/g, ' ')) + '}';
      const near = (sibling) =>
        !sibling ||
        (sibling.type === 'tag' && BLOCK.has(sibling.name)) ||
        sibling.type === 'comment';
      return text.length && !(near(node.prev) && near(node.next)) ? pad + '{" "}' : '';
    }
    if (node.type !== 'tag') return '';
    const tag = SVG_TAGS[node.name] || node.name;
    if (VOID.has(node.name)) return `${pad}<${tag}${attributes(node)} />`;
    if (node.name === 'textarea')
      return `${pad}<textarea${attributes(node)} defaultValue=${JSON.stringify($(node).text())} />`;
    const children = (node.children || []).map((child) => walk(child, pad + '  ')).filter(Boolean);
    return children.length
      ? `${pad}<${tag}${attributes(node)}>\n${children.join('\n')}\n${pad}</${tag}>`
      : `${pad}<${tag}${attributes(node)} />`;
  };
  return $.root()
    .contents()
    .toArray()
    .map((node) => walk(node, indent))
    .filter((line) => line.trim() && line.trim() !== '{" "}')
    .join('\n');
}

/** Static HTML for the same markup, with snapshot indexes as scoped classes. */
function toHtml(html, scope) {
  const $ = load(html, null, false);
  $('*').each((_, el) => {
    for (const name of Object.keys(el.attribs)) if (INTERNAL.test(name)) $(el).removeAttr(name);
    const index = $(el).attr('data-rf-rendered');
    if (index !== undefined) {
      $(el).removeAttr('data-rf-rendered').addClass(`${scope}-${index}`);
    }
  });
  return $.html();
}

export function canExportCode(item) {
  return !!item?.feature?.spec?.website?.pages?.[0]?.component;
}

/** Builds the export files for one saved component. Fonts are returned base64-encoded; everything else is text. */
export function exportComponentCode(item) {
  if (!canExportCode(item))
    throw new Error('Code export is available for components picked in the reference browser.');
  const site = validateReplica(item.feature.spec.website),
    page = site.pages[0],
    scope = scopeFor(item),
    name = componentName(item.name);
  const scoped = scopeCss(site.css, scope, page.rem || 16),
    fonts = scoped.fonts;
  // The picked element sat at a page position (often fixed, absolute or sticky). As a component it joins the normal
  // flow of wherever it is placed; relative positioning keeps it the anchor for its own positioned children. !important
  // outranks the capture's pinned snapshot values for these few properties only.
  const css =
    scoped.css +
    `\n.${scope} .${scope}-0.${scope}-0{position:relative!important;inset:auto!important;transform:none!important;float:none!important;z-index:auto!important}\n`;
  const htmlClass = [
    `${scope}-html`,
    ...String(page.htmlClass || '')
      .split(/\s+/)
      .filter(Boolean),
  ].join(' ');
  const header = `Captured from ${page.url} with Reframe. Markup and styles only: no original scripts are included.`;
  const component = `// ${header}\n// Styles are scoped under .${scope}; images stay online at their source URLs.\nimport "./${name}.css";\n\nexport default function ${name}() {\n  return (\n    <div className=${JSON.stringify(scope)}>\n      <div className=${JSON.stringify(htmlClass)}>\n        <div className=${JSON.stringify(scope + '-body')}${page.rootStyle ? ' style=' + styleObject(page.rootStyle) : ''}>\n${toJsx(page.html, scope)}\n        </div>\n      </div>\n    </div>\n  );\n}\n`;
  const markup = `<div class="${scope}"><div class="${htmlClass.replace(/"/g, '')}"><div class="${scope}-body"${page.rootStyle ? ` style="${page.rootStyle.replace(/"/g, '&quot;')}"` : ''}>${toHtml(page.html, scope)}</div></div></div>`;
  const preview = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${item.name.replace(/[<&]/g, '')}</title>\n<!-- ${header.replace(/--/g, '')} -->\n<link rel="stylesheet" href="./${name}.css">\n<style>body{margin:0;padding:16px;background:${page.backdrop || '#ffffff'}}</style>\n</head>\n<body>\n${markup}\n</body>\n</html>\n`;
  const fontList = Object.keys(fonts);
  const readme = `# ${name}\n\n${header}\n\n## Files\n\n- \`${name}.tsx\` — React component (works in any React 18+ app; rename to .jsx for JavaScript projects).\n- \`${name}.css\` — styles scoped under \`.${scope}\`, imported by the component.\n- \`${name}.html\` — the same markup as static HTML.\n${fontList.length ? `- \`fonts/\` — ${fontList.length} font file${fontList.length === 1 ? '' : 's'} embedded at capture time, referenced by the stylesheet. These belong to their foundries: check the licence before shipping, or switch to a bundled open font.\n` : ''}\n## Notes\n\n- Interactions (menus, carousels, form submission) are not recreated; connect your own handlers. Forms have submission disabled.\n- Links point to the original site; images load from it. Download images you are permitted to reuse and update their URLs.\n- \`rem\` sizes were converted to pixels using the original page's root font size, so they do not depend on your app's.\n`;
  return {
    name,
    scope,
    files: {
      [`${name}.tsx`]: component,
      [`${name}.css`]: css,
      [`${name}.html`]: preview,
      'README.md': readme,
    },
    fonts,
    markup,
    css,
  };
}
