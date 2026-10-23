import postcss from 'postcss';
import { withDocumentAtWidths } from './fidelity.js';
import { referenceResource } from './browser-network.js';

// Clean-export CSS minimiser. Captured CSS reproduces a component exactly, but most of it restates what the browser
// would compute anyway: the computed-style snapshot spells out every margin, border and default value, and the page
// root carries every design-system variable of the source site. This removes what provably changes nothing:
//
// 1. Declarations: the export is rendered at every captured width, each declaration is removed in turn, and it stays
//    removed only if no element's box or computed style (including ::before/::after) changes at any width. Groups are
//    tested together and split only when a group matters, so hundreds of declarations need few checks.
// 2. Variables: custom properties that nothing references, directly or through other variables, are dropped.
// 3. Shorthands: complete, equally weighted margin, padding, inset-style and border sides are collapsed.
//
// Rules a single static render cannot judge are never touched: hover/focus/active and other state selectors,
// pseudo-elements, @media/@supports/@container contents, keyframes, @font-face, vendor-prefixed and repeated
// properties. The result is checked again by the export's fidelity score before it is used.

const STATEFUL =
  /:(?:hover|focus(?:-visible|-within)?|active|visited|checked|disabled|enabled|target|open|placeholder-shown|invalid|valid)\b|::?[\w-]*(?:before|after|placeholder|marker|selection|backdrop|file-selector-button)\b/;
const MARKER = '--rf-rule';
const MAX_WIDTHS = 10;

/** Width-only media queries (optionally with screen/all) can be judged by rendering at the right widths. */
const widthOnly = (params) =>
  !String(params)
    .toLowerCase()
    .replace(/\b(?:only|screen|all|and)\b/g, '')
    .replace(/\(\s*(?:min|max)-width\s*:\s*[\d.]+(?:px|em|rem)\s*\)/g, '')
    .replace(/[\s,]/g, '');
/** Viewport widths at which each min/max-width boundary starts to apply (1em = 16px in media queries). */
function breakpoints(root) {
  const widths = new Set();
  root.walkAtRules('media', (rule) => {
    // Only blocks holding rules the render test can edit need their ranges covered.
    let editable = false;
    rule.walkRules((inner) => {
      if (!STATEFUL.test(inner.selector) && inner.nodes.some((n) => n.type === 'decl'))
        editable = true;
    });
    if (!editable || !widthOnly(rule.params)) return;
    for (const m of rule.params.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/gi)) {
      const px = Number(m[2]) * (m[3].toLowerCase() === 'px' ? 1 : 16);
      widths.add(Math.ceil(m[1].toLowerCase() === 'min' ? px : px + 1));
    }
  });
  return [...widths].filter((w) => w >= 320 && w <= 2560);
}
/** Rules the render test can judge: not stateful, and only inside width-only @media (or @layer). */
function testable(rule, mediaTested) {
  if (STATEFUL.test(rule.selector)) return false;
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type !== 'atrule') return false;
    if (parent.name === 'layer') continue;
    if (parent.name !== 'media' || !mediaTested || !widthOnly(parent.params)) return false;
  }
  return true;
}

/** Declarations of a top-level style rule that the render test may remove. */
function candidates(rule) {
  const counts = new Map();
  rule.walkDecls((d) => counts.set(d.prop, (counts.get(d.prop) || 0) + 1));
  return rule.nodes.filter(
    (d) =>
      d.type === 'decl' &&
      !d.prop.startsWith('-') && // custom properties and vendor-prefixed properties are kept here
      counts.get(d.prop) === 1, // repeated properties are fallbacks for other browsers
  );
}

const declarations = (style) =>
  [
    ...String(style || '').matchAll(
      /(--[\w-]+|[a-zA-Z-]+)\s*:\s*((?:[^;"'(]|"[^"]*"|'[^']*'|\([^)]*\))*)/g,
    ),
  ]
    .map(([, prop, value]) => [prop.trim(), value.trim()])
    .filter(([, value]) => value);

// ---- Runs in the rendered page (each width) ----------------------------------------------------------------------
function install({ scope, marker }) {
  const sheet = /** @type {HTMLStyleElement} */ (document.getElementById('rf-min')).sheet,
    rules = new Map();
  const collect = (list) => {
    for (const rule of list)
      if (rule instanceof CSSStyleRule) {
        const id = rule.style.getPropertyValue(marker).trim();
        if (id) rules.set(id, rule);
      } else if ('cssRules' in rule) collect(rule.cssRules); // @media and other grouping rules
  };
  collect(sheet.cssRules);
  const body = document.querySelector('.' + scope + '-body'),
    elements = [...document.querySelectorAll('.' + scope + ', .' + scope + ' *')],
    index = new Map(elements.map((el, i) => [el, i]));
  const signature = (el, pseudo) => {
    const style = getComputedStyle(el, pseudo);
    let text = '';
    for (let i = 0; i < style.length; i++)
      if (style[i] !== marker) text += style.getPropertyValue(style[i]) + '\u0001';
    return text;
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 4)).join(',');
  };
  const base = elements.map((el) => ({
    box: box(el),
    style: signature(el, null),
    before: signature(el, '::before'),
    after: signature(el, '::after'),
  }));
  // The scope, html and body wrappers paint nothing themselves; what they pass on by inheritance shows up in the
  // component's own elements, so only those are compared by style (every box, wrappers included, is compared).
  const painted = new Set(elements.filter((el) => body && body !== el && body.contains(el)));
  /** @type {any} */ (window).__rfMin = {
    rules,
    body,
    elements,
    index,
    signature,
    box,
    base,
    painted,
  };
  return { rules: rules.size, elements: elements.length };
}

function apply({ list, restore }) {
  const { rules, body } = /** @type {any} */ (window).__rfMin;
  for (const { rule, prop, value, important } of list) {
    const style = rule === 'inline' ? body?.style : rules.get(rule)?.style;
    if (!style) continue;
    if (restore) style.setProperty(prop, value, important ? 'important' : '');
    else style.removeProperty(prop);
  }
}

function unchanged(list) {
  const { rules, body, elements, index, signature, box, base, painted } = /** @type {any} */ (
    window
  ).__rfMin;
  // Any element can move when a box changes size, so every box is compared.
  for (let i = 0; i < elements.length; i++) if (box(elements[i]) !== base[i].box) return false;
  // Computed styles can only change for elements a tested rule matches, and their descendants (inheritance).
  const affected = new Set();
  for (const { rule } of list) {
    let matched;
    try {
      matched =
        rule === 'inline' ? [body] : [...document.querySelectorAll(rules.get(rule).selectorText)];
    } catch {
      matched = elements;
    }
    for (const el of matched) {
      if (!index.has(el)) continue;
      if (painted.has(el)) affected.add(el);
      for (const child of el.querySelectorAll('*')) if (painted.has(child)) affected.add(child);
    }
  }
  for (const el of affected) {
    const i = index.get(el),
      was = base[i];
    if (
      signature(el, null) !== was.style ||
      signature(el, '::before') !== was.before ||
      signature(el, '::after') !== was.after
    )
      return false;
  }
  return true;
}
// -------------------------------------------------------------------------------------------------------------------

/** Collapses four equal-weight sides into the shorthand, using the shortest equivalent form. */
function shorthands(root) {
  const sides = ['top', 'right', 'bottom', 'left'];
  const box = (values) => {
    const [t, r, b, l] = values;
    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return `${t} ${r}`;
    if (r === l) return `${t} ${r} ${b}`;
    return values.join(' ');
  };
  let collapsed = 0;
  root.walkRules((rule) => {
    /** @type {[string, string[], (values: string[]) => string | null][]} */
    const groups = [
      ['margin', sides.map((s) => `margin-${s}`), box],
      ['padding', sides.map((s) => `padding-${s}`), box],
      [
        'border',
        sides.map((s) => `border-${s}`),
        (v) => (v.every((x) => x === v[0]) ? v[0] : null),
      ],
      ['overflow', ['overflow-x', 'overflow-y'], (v) => (v[0] === v[1] ? v[0] : v.join(' '))],
    ];
    for (const [shorthand, longhands, combine] of groups) {
      const found = longhands.map((prop) =>
        rule.nodes.filter((n) => n.type === 'decl' && n.prop === prop),
      );
      if (found.some((list) => list.length !== 1)) continue;
      const decls = found.map((list) => list[0]);
      if (decls.some((d) => d.important !== decls[0].important)) continue;
      // Any other property of the same family (e.g. border-left-color, margin-inline) could interleave with the
      // longhands in the cascade, so the rule is left as written.
      if (
        rule.nodes.some(
          (n) =>
            n.type === 'decl' &&
            (n.prop === shorthand || n.prop.startsWith(shorthand + '-')) &&
            !longhands.includes(n.prop),
        )
      )
        continue;
      const value = combine(decls.map((d) => d.value));
      if (!value) continue;
      decls[0].cloneBefore({ prop: shorthand, value });
      decls.forEach((d) => d.remove());
      collapsed++;
    }
  });
  return collapsed;
}

/** Removes custom properties that nothing uses, directly or through other variables. */
function unusedVariables(root, inline, markup) {
  const refs = (text) => [...String(text).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  const definitions = new Map(); // name -> values
  const define = (name, value) => definitions.set(name, [...(definitions.get(name) || []), value]);
  root.walkDecls(/^--/, (d) => define(d.prop, d.value));
  for (const [prop, value] of inline) if (prop.startsWith('--')) define(prop, value);
  const used = new Set();
  const visit = (name) => {
    if (used.has(name)) return;
    used.add(name);
    for (const value of definitions.get(name) || []) refs(value).forEach(visit);
  };
  root.walkDecls((d) => {
    if (!d.prop.startsWith('--')) refs(d.value).forEach(visit);
  });
  for (const [prop, value] of inline) if (!prop.startsWith('--')) refs(value).forEach(visit);
  refs(markup).forEach(visit); // inline styles on elements
  let removed = 0;
  root.walkDecls(/^--/, (d) => {
    if (!used.has(d.prop)) {
      d.remove();
      removed++;
    }
  });
  const kept = inline.filter(([prop]) => !prop.startsWith('--') || used.has(prop));
  return { removed: removed + inline.length - kept.length, inline: kept };
}

/**
 * Minimises a clean export's stylesheet and page-root style.
 * @param {{css: string, markup: string, scope: string, fonts?: Record<string, string>, page: any, rootStyle?: string}} input
 * @param {{browser?: any, resource?: any, widths?: number[], budgetMs?: number}} [options]
 * @returns {Promise<{css:string, rootStyle:string, stats:object}>}
 */
export async function minimizeCss(
  { css, markup, scope, fonts = {}, page, rootStyle = '' },
  { browser, resource = referenceResource, widths = [], budgetMs = 20000 } = {},
) {
  const started = Date.now(),
    deadline = started + budgetMs;
  const root = postcss.parse(css),
    tested = root.clone(),
    tested_rules = [];
  let declarationsBefore = 0;
  root.walkDecls(() => {
    declarationsBefore++;
  });
  // Render at the captured widths and at one width inside every range between the stylesheet's breakpoints, so a
  // rule inside a width-based @media block is tested wherever it applies. With too many ranges, @media is left as is.
  const base = [page.viewport || 1280, ...widths].filter(
      (w) => Number.isInteger(w) && w >= 200 && w <= 4000,
    ),
    ranges = [320, ...breakpoints(root)],
    mediaTested = new Set([...base, ...ranges]).size <= MAX_WIDTHS;
  const sizes = [...new Set(mediaTested ? [...base, ...ranges] : base)].sort((a, b) => b - a);
  // Mark each eligible rule (walk order is the rule's id) so the rendered copy can be edited rule by rule.
  let order = 0;
  tested.walkRules((node) => {
    const i = order++;
    if (!testable(node, mediaTested)) return;
    const list = candidates(node);
    if (!list.length) return;
    node.append({ prop: MARKER, value: String(i) });
    tested_rules.push({
      id: String(i),
      decls: list.map((d) => ({
        rule: String(i),
        prop: d.prop,
        value: d.value,
        important: !!d.important,
      })),
    });
  });
  const inline = declarations(rootStyle);
  const inlineCandidates = inline
    .filter(([prop]) => !prop.startsWith('-'))
    .map(([prop, value]) => ({
      rule: 'inline',
      prop,
      value: value.replace(/\s*!important$/, ''),
      important: /!important$/.test(value),
    }));

  const inlined = tested
    .toString()
    .replace(/url\("\.\/(fonts\/[\w.]+)"\)/g, (all, file) =>
      fonts[file] ? `url("data:font/${file.split('.').pop()};base64,${fonts[file]}")` : all,
    );
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style id="rf-min">${inlined.replace(/<\/style/gi, '')}</style><style>html,body{margin:0;padding:0;background:${page.backdrop || '#ffffff'}}</style></head><body>${markup}</body></html>`;

  const removed = [];
  let tests = 0,
    complete = true;
  await withDocumentAtWidths(html, page, sizes, { browser, resource }, async (tabs) => {
    await Promise.all(tabs.map((tab) => tab.evaluate(install, { scope, marker: MARKER })));
    const test = async (list) => {
      tests++;
      await Promise.all(tabs.map((tab) => tab.evaluate(apply, { list, restore: false })));
      const same = (await Promise.all(tabs.map((tab) => tab.evaluate(unchanged, list)))).every(
        Boolean,
      );
      if (!same) await Promise.all(tabs.map((tab) => tab.evaluate(apply, { list, restore: true })));
      return same;
    };
    const prune = async (list) => {
      if (Date.now() > deadline) {
        complete = false;
        return;
      }
      if (await test(list)) return void removed.push(...list);
      if (list.length === 1) return;
      const middle = Math.ceil(list.length / 2);
      await prune(list.slice(0, middle));
      await prune(list.slice(middle));
    };
    for (const rule of tested_rules) await prune(rule.decls);
    if (inlineCandidates.length) await prune(inlineCandidates);
  });

  // Apply the proven removals to the real stylesheet (no markers), then tidy.
  const gone = new Set(
    removed.filter((d) => d.rule !== 'inline').map((d) => d.rule + '\u0001' + d.prop),
  );
  order = 0;
  root.walkRules((node) => {
    const i = order++;
    node.each((d) => {
      if (d.type === 'decl' && gone.has(String(i) + '\u0001' + d.prop)) d.remove();
    });
  });
  const inlineGone = new Set(removed.filter((d) => d.rule === 'inline').map((d) => d.prop));
  const variables = unusedVariables(
    root,
    inline.filter(([prop]) => !inlineGone.has(prop)),
    // The page-root style being minimised is passed separately; only the component's own inline styles count here.
    markup
      .replace(new RegExp(`(class="${scope}-body")\\s*style="[^"]*"`), '$1')
      .replace(/class="[^"]*"/g, ''),
  );
  const collapsed = shorthands(root);
  let emptied = 0;
  root.walkRules((rule) => {
    if (!rule.nodes.length) {
      rule.remove();
      emptied++;
    }
  });
  // Grouping blocks left empty disappear; neighbouring rules with the same selector, and neighbouring media blocks with
  // the same query, merge (cascade order is unchanged).
  root.walkAtRules((rule) => {
    if (rule.nodes && !rule.nodes.length && rule.name !== 'font-face') rule.remove();
  });
  root.walkRules((rule) => {
    const next = rule.next();
    if (next?.type !== 'rule' || next.selector !== rule.selector) return;
    for (const decl of rule.nodes.filter((n) => n.type === 'decl'))
      if (
        next.nodes.some(
          (n) => n.type === 'decl' && n.prop === decl.prop && !!n.important === !!decl.important,
        )
      )
        decl.remove(); // the later declaration wins anyway
    next.prepend(...rule.nodes.map((n) => n.clone()));
    rule.remove();
    emptied++;
  });
  let merged = 0;
  root.walkAtRules('media', (rule) => {
    const next = rule.next();
    if (next?.type === 'atrule' && next.name === 'media' && next.params === rule.params) {
      next.prepend(...rule.nodes.map((n) => n.clone()));
      rule.remove();
      merged++;
    }
  });
  let declarationsAfter = 0;
  root.walkDecls(() => {
    declarationsAfter++;
  });
  return {
    css: root.toString(),
    rootStyle: variables.inline.map(([prop, value]) => `${prop}:${value}`).join(';'),
    stats: {
      declarationsBefore: declarationsBefore + inline.length,
      declarationsAfter: declarationsAfter + variables.inline.length,
      redundantDeclarations: removed.length,
      unusedVariables: variables.removed,
      shorthands: collapsed,
      emptyRules: emptied,
      mergedMedia: merged,
      mediaTested,
      widths: sizes,
      tests,
      complete,
      ms: Date.now() - started,
    },
  };
}
