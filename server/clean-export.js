import { load } from 'cheerio';
import postcss from 'postcss';
import { validateVariants } from './capture-variants.js';
import { snapshotRules } from './fidelity.js';

const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
const dynamic =
  /:(?:hover|focus(?:-visible|-within)?|active|visited|checked|disabled|enabled|target|open)\b|::[\w-]+/;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Name and prune only rules demonstrably unrelated to the captured tree; unsupported selectors stay intact. */
export function cleanStyles(code, item, names = {}) {
  const site = item.feature.spec.website,
    $ = load(site.pages[0].html, null, false),
    map = new Map(),
    used = new Set(),
    warnings = [];
  $('[data-rf-rendered]').each((_, el) => {
    const id = el.attribs['data-rf-rendered'],
      role = el.attribs.role || el.name;
    const label =
      el.attribs['aria-label'] ||
      el.attribs.name ||
      (/^(h[1-6]|button|a)$/.test(el.name) ? $(el).text() : '');
    const hint = slug(names[id] || `${role}${label ? ' ' + label : ''}`) || 'element';
    let name = `${code.scope}-${hint}`,
      n = 2;
    while (used.has(name)) name = `${code.scope}-${hint}-${n++}`;
    used.add(name);
    map.set(id, name);
  });
  const replace = (text) =>
    text.replace(
      new RegExp(escape(code.scope) + '-(\\d+)(?![\\w-])', 'g'),
      (all, id) => map.get(id) || all,
    );
  const dom = load(code.markup, null, false),
    css = postcss.parse(code.css);
  let removed = 0;
  css.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const keep = rule.selectors.filter((selector) => {
      if (dynamic.test(selector)) return true;
      try {
        return dom(selector).length > 0;
      } catch {
        return true;
      }
    });
    if (!keep.length) {
      rule.remove();
      removed++;
    } else rule.selectors = keep;
  });
  const animationNames = new Map();
  css.walkAtRules((rule) => {
    if (/keyframes$/i.test(rule.name)) {
      const previous = rule.params;
      rule.params = code.scope + '-' + slug(previous);
      animationNames.set(previous, rule.params);
    }
  });
  css.walkDecls((decl) => {
    if (/^animation(?:-name)?$/.test(decl.prop))
      for (const [old, name] of animationNames)
        decl.value = decl.value.replace(new RegExp('\\b' + escape(old) + '\\b', 'g'), name);
  });
  // Merge equal adjacent rule groups without changing cascade order or rule specificity.
  css.walkRules((rule) => {
    const next = rule.next();
    if (
      next?.type === 'rule' &&
      next.nodes.map((n) => n.toString()).join(';') ===
        rule.nodes.map((n) => n.toString()).join(';')
    ) {
      next.selector = rule.selector + ',' + next.selector;
      rule.remove();
    }
  });
  const variants = validateVariants(item.captureVariants),
    breakpoints = [];
  postcss.parse(site.css).walkAtRules('media', (rule) => {
    for (const m of rule.params.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|rem|em)/g)) {
      const n = Number(m[2]) * (m[3] === 'px' ? 1 : site.pages[0].rem || 16);
      breakpoints.push(m[1] === 'min' ? n - 0.02 : n);
    }
  });
  const defaults = variants.filter((v) => v.state === 'default').sort((a, b) => b.width - a.width);
  const rulesFor = (v) =>
    snapshotRules(v.website.css).flatMap((rule) =>
      rule.ids.map((id) => ({ id, values: Object.fromEntries(rule.declarations) })),
    );
  const records = new Map(variants.map((v) => [v.width + ':' + v.state, rulesFor(v)]));
  let measured = '';
  for (let n = 0; n < defaults.length; n++) {
    const base = defaults[n],
      next = defaults[n - 1],
      boundary = next
        ? breakpoints.filter((b) => b >= base.width && b < next.width).sort((a, b) => a - b)[0]
        : null;
    const stateRules = [];
    const baseRules = records.get(base.width + ':default') || [];
    for (const state of ['default', 'hover', 'focus']) {
      const stateVariant = variants.find((v) => v.width === base.width && v.state === state);
      if (!stateVariant) continue;
      for (const { id, values } of records.get(base.width + ':' + state) || []) {
        if (!map.has(String(id))) continue;
        const normal = baseRules.find((r) => r.id === id)?.values || {};
        const declarations = Object.entries(values).filter(
          ([property, value]) => state === 'default' || normal[property] !== value,
        );
        if (!declarations.length) continue;
        const root = map.get('0'),
          selector =
            state === 'default'
              ? `.${map.get(String(id))}`
              : id === 0
                ? `.${root}${state === 'hover' ? ':hover' : ':focus-within'}`
                : `.${root}${state === 'hover' ? ':hover' : ':focus-within'} .${map.get(String(id))}`;
        stateRules.push(
          `.${code.scope} ${selector}:not(#rf-measured){${declarations.map(([p, v]) => p + ':' + v).join(';')}}`,
        );
      }
    }
    if (!next) measured += stateRules.join('');
    else if (boundary !== undefined && boundary !== null)
      measured += `@media(max-width:${boundary}px){${stateRules.join('')}}`;
    else
      warnings.push(
        `${base.width}px was measured, but the source declares no breakpoint for this interval. Its original responsive CSS is retained; no breakpoint was invented.`,
      );
  }
  const formatted = replace(css.toString() + measured);
  return {
    css: formatted,
    map,
    replace,
    removed,
    warnings,
    rootSelector: '.' + (map.get('0') || code.scope),
  };
}

/** Only semantic controls with unambiguous relationships receive independently authored state. */
export function interactionBindings(html) {
  const $ = load(html, null, false),
    bindings = {},
    initial = {},
    patterns = [],
    menus = [];
  let count = 0;
  const key = (el) => el.attribs['data-rf-rendered'];
  const attach = (el, props) => {
    const id = key(el);
    if (id !== undefined) bindings[id] = { ...(bindings[id] || {}), ...props };
  };
  const controlled = (id) =>
    id &&
    $('[id]')
      .toArray()
      .filter((el) => el.attribs.id === id);
  $('[role="tablist"]').each((_, list) => {
    const tabs = $(list).find('[role="tab"]').toArray(),
      panels = tabs.map((t) => controlled(t.attribs['aria-controls']));
    if (
      tabs.length < 2 ||
      panels.some((p) => p?.length !== 1) ||
      tabs.some((t) => key(t) === undefined)
    )
      return;
    const group = 'tabs' + count++;
    initial[group] = Math.max(
      0,
      tabs.findIndex((t) => t.attribs['aria-selected'] === 'true'),
    );
    patterns.push('tabs');
    tabs.forEach((tab, i) =>
      attach(tab, {
        'aria-selected': `ui.${group}===${i}`,
        tabIndex: `ui.${group}===${i}?0:-1`,
        onClick: `()=>setUi(s=>({...s,${group}:${i}}))`,
        onKeyDown: `event=>tabKey(event,${JSON.stringify(group)},${i},${tabs.length})`,
      }),
    );
    panels.forEach((p, i) =>
      attach(p[0], { 'data-captured-panel': 'true', hidden: `ui.${group}!==${i}` }),
    );
  });
  $('details').each((_, details) => {
    const summary = $(details).children('summary').get(0);
    if (!summary || key(details) === undefined || key(summary) === undefined) return;
    const group = 'disclosure' + count++;
    initial[group] = details.attribs.open !== undefined;
    patterns.push('accordion');
    attach(details, { open: `ui.${group}` });
    attach(summary, {
      onClick: `event=>{event.preventDefault();setUi(s=>({...s,${group}:!s.${group}}));}`,
    });
  });
  $('button[aria-expanded][aria-controls]').each((_, button) => {
    if (bindings[key(button)]) return;
    const targets = controlled(button.attribs['aria-controls']);
    if (targets?.length !== 1 || key(button) === undefined || key(targets[0]) === undefined) return;
    const panel = targets[0],
      dropdown =
        ['menu', 'listbox'].includes(panel.attribs.role) || button.attribs['aria-haspopup'];
    const group = 'disclosure' + count++;
    initial[group] = button.attribs['aria-expanded'] === 'true';
    patterns.push(dropdown ? 'dropdown' : 'accordion');
    if (dropdown) menus.push(group);
    attach(button, {
      'aria-expanded': `ui.${group}`,
      onClick: `()=>setUi(s=>({...s,${group}:!s.${group}}))`,
      onKeyDown: dropdown
        ? `event=>menuKey(event,${JSON.stringify(group)},${JSON.stringify(panel.attribs.id)})`
        : undefined,
    });
    attach(panel, {
      'data-captured-panel': 'true',
      hidden: `!ui.${group}`,
      onKeyDown: dropdown
        ? `event=>menuKey(event,${JSON.stringify(group)},${JSON.stringify(panel.attribs.id)})`
        : undefined,
    });
  });
  $('[aria-roledescription="carousel"]').each((_, carousel) => {
    const slides = $(carousel).find('[aria-roledescription="slide"]').toArray(),
      buttons = $(carousel).find('button').toArray();
    const prev = buttons.find((b) =>
        /^(previous|prev|back)/i.test(b.attribs['aria-label'] || $(b).text()),
      ),
      next = buttons.find((b) => /^next/i.test(b.attribs['aria-label'] || $(b).text()));
    if (slides.length < 2 || !prev || !next || slides.some((s) => key(s) === undefined)) return;
    const group = 'slide' + count++;
    initial[group] = Math.max(
      0,
      slides.findIndex(
        (s) => s.attribs.hidden === undefined && s.attribs['aria-hidden'] !== 'true',
      ),
    );
    patterns.push('carousel');
    attach(prev, {
      onClick: `()=>setUi(s=>({...s,${group}:(Number(s.${group})+${slides.length}-1)%${slides.length}}))`,
    });
    attach(next, {
      onClick: `()=>setUi(s=>({...s,${group}:(Number(s.${group})+1)%${slides.length}}))`,
    });
    slides.forEach((slide, i) =>
      attach(slide, {
        'data-captured-panel': 'true',
        hidden: `ui.${group}!==${i}`,
        'aria-hidden': `ui.${group}!==${i}`,
      }),
    );
  });
  return { bindings, initial, menus, patterns: [...new Set(patterns)] };
}

export const interactionHelpers = `
  function tabKey(event: React.KeyboardEvent<HTMLElement>, group: string, current: number, total: number) {
    const keys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
    if(!keys.includes(event.key)) return;
    event.preventDefault();
    const next = event.key==='Home'?0:event.key==='End'?total-1:(current+(/Left|Up/.test(event.key)?-1:1)+total)%total;
    setUi(s=>({...s,[group]:next}));
    event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }
  function menuKey(event: React.KeyboardEvent<HTMLElement>, group: string, panelId: string) {
    const root=event.currentTarget.closest('[data-captured-root]');
    const panel=root?.querySelector<HTMLElement>('[id="'+CSS.escape(panelId)+'"]');
    const trigger=root?.querySelector<HTMLElement>('[aria-controls="'+CSS.escape(panelId)+'"]');
    if(event.key==='Escape'){event.preventDefault();setUi(s=>({...s,[group]:false}));trigger?.focus();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();setUi(s=>({...s,[group]:true}));
    requestAnimationFrame(()=>{const options=Array.from(panel?.querySelectorAll<HTMLElement>('[role="menuitem"],[role="option"],a[href],button')||[]);const current=options.indexOf(document.activeElement as HTMLElement);const next=event.key==='Home'?0:event.key==='End'?options.length-1:(current+(event.key==='ArrowUp'?-1:1)+options.length)%options.length;options[next]?.focus();});
  }
`;

export function cleanComponent(item, code, jsx, names = {}, style = (_value) => '') {
  const result = cleanStyles(code, item, names),
    page = item.feature.spec.website.pages[0],
    behavior = interactionBindings(page.html);
  const imports = 'import * as React from "react";\n';
  const hooks = behavior.patterns.length
    ? `\n  const [ui, setUi] = React.useState(${JSON.stringify(behavior.initial)});\n  const capturedRoot = React.useRef<HTMLDivElement>(null);\n  React.useEffect(()=>{const outside=(event:PointerEvent)=>{if(!capturedRoot.current?.contains(event.target as Node))setUi(s=>({...s,${behavior.menus.map((g) => g + ':false').join(',')}}));};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);\n${interactionHelpers}`
    : '';
  const typedStyles = (text) =>
    text.replace(
      /style=\{\{([^}]+)\}\}/g,
      (_, body) => 'style={{' + body + '} as React.CSSProperties}',
    );
  const markup = typedStyles(jsx(page.html, code.scope, '          ', behavior.bindings));
  const source = `// Captured from ${page.url.replace(/[\r\n]/g, ' ')}. Independently authored semantic interactions.\n${imports}import "./${code.name}.css";\n\nexport default function ${code.name}() {${hooks}\n  return (\n    <div className="${code.scope}" data-captured-root${behavior.patterns.length ? ' ref={capturedRoot}' : ''}>\n      <div className=${JSON.stringify(code.scope + '-html ' + page.htmlClass)}>\n        <div className="${code.scope}-body"${page.rootStyle ? ' ' + typedStyles('style=' + style(page.rootStyle)) : ''}>\n${markup}\n        </div>\n      </div>\n    </div>\n  );\n}\n`;
  const files = {
    ...code.files,
    [`${code.name}.tsx`]: result.replace(source),
    [`${code.name}.css`]:
      result.css +
      (behavior.patterns.length
        ? `\n.${code.scope} [hidden]{display:none!important}.${code.scope} [data-captured-panel]:not([hidden]){display:revert!important;visibility:visible!important;opacity:1!important}.${code.scope} ${result.rootSelector}{height:auto!important}`
        : ''),
    [`${code.name}.html`]: result.replace(code.files[`${code.name}.html`]),
  };
  files['README.md'] +=
    `\n## Clean & responsive export\n\nRemoved ${result.removed} unused rule groups. Snapshot classes use element roles and labels. Animation names are scoped.\nSupported React interactions: ${behavior.patterns.join(', ') || 'none detected; define other behavior in your destination'}.\nThe HTML export is a static visual reference; React contains the interaction state. Original private logic is not recovered.\n${result.warnings.map((w) => '- ' + w).join('\n')}\n`;
  return {
    ...code,
    files,
    css: files[`${code.name}.css`],
    markup: result.replace(code.markup),
    rootSelector: result.rootSelector,
    mode: 'clean',
    patterns: behavior.patterns,
    warnings: result.warnings,
    removedRules: result.removed,
  };
}
