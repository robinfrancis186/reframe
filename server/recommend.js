import { parse } from '@babel/parser';
import { load } from 'cheerio';
import { catalog } from '../src/library/catalog.js';

const needs = [
  {
    label: 'browsing records and collections',
    words:
      /\b(records?|notes?|contacts?|collections?|directory|library|catalog|tasks?|projects?)\b/i,
    kinds: ['search', 'table', 'sortable', 'files'],
    prefer: ['search', 'be-table'],
  },
  {
    label: 'booking and scheduling',
    words:
      /\b(bookings?|appointments?|events?|calendar|scheduling|schedule|dates?|availability|travel|reservations?)\b/i,
    kinds: ['dates', 'picker', 'timeline'],
    prefer: ['be-availability-scheduler', 'be-date-range-picker'],
  },
  {
    label: 'analytics and reporting',
    words: /\b(dashboard|analytics|metrics?|reports?|revenue|statistics|charts?)\b/i,
    kinds: ['chart', 'number', 'table'],
    prefer: ['be-composition-chart', 'be-donut-chart', 'be-table'],
  },
  {
    label: 'navigation between sections',
    words: /\b(workspace|navigation|sections?|pages?|tabs?|dashboard|settings)\b/i,
    kinds: ['tabs', 'navigation', 'breadcrumb', 'command'],
    prefer: ['tabs', 'be-command-palette'],
  },
  {
    label: 'forms and preferences',
    words: /\b(forms?|preferences?|settings|filters?|options?|selection|inputs?)\b/i,
    kinds: ['choices', 'select', 'switch', 'slider', 'input', 'theme'],
    prefer: ['be-multi-select', 'switch'],
  },
  {
    label: 'feedback after an action',
    words:
      /\b(save|saved|submit|send|update|delete|upload|forms?|feedback|notifications?|status)\b/i,
    kinds: ['toast', 'notice', 'alert', 'feedback'],
    prefer: ['toast', 'be-notification-stack'],
  },
  {
    label: 'onboarding and help',
    words: /\b(onboarding|welcome|help|guide|steps?|getting started|sign.?up|register)\b/i,
    kinds: ['steps', 'accordion', 'tooltip', 'signup', 'otp'],
    prefer: ['steps', 'accordion'],
  },
  {
    label: 'product and checkout controls',
    words: /\b(shop|store|cart|products?|checkout|commerce|quantity)\b/i,
    kinds: ['quantity', 'card', 'gallery', 'choices'],
    prefer: ['quantity', 'be-card'],
  },
  {
    label: 'visual content and portfolios',
    words: /\b(photos?|images?|gallery|portfolio|artwork|media)\b/i,
    kinds: ['gallery', 'card', 'upload'],
    prefer: ['be-image-viewer', 'be-infinite-masonry'],
  },
  {
    label: 'files and documents',
    words: /\b(files?|folders?|documents?|uploads?|attachments?)\b/i,
    kinds: ['files', 'upload', 'search'],
    prefer: ['be-file-tree', 'be-file-upload'],
  },
  {
    label: 'assistant and chat interfaces',
    words: /\b(assistant|chat|copilot|prompts?|llm|openai|artificial intelligence|ai)\b/i,
    kinds: ['agent'],
    prefer: ['be-prompt-input', 'be-message-scroller'],
  },
  {
    label: 'brand presentation',
    words: /\b(brand|landing|marketing|portfolio|profile|about)\b/i,
    kinds: ['brand', 'card', 'accordion'],
    prefer: ['brand', 'be-card'],
  },
  {
    label: 'trading or wallet interfaces',
    words: /\b(trading|wallet|exchange|prediction market|swap)\b/i,
    kinds: ['wallet', 'swap'],
    prefer: ['be-wallet-card'],
  },
];
const stop = new Set(
  'the and for with from this that your app component original local pattern state working section'.split(
    ' ',
  ),
);
const tokens = (text) =>
  new Set(
    (text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || [])
      .filter((word) => !stop.has(word))
      .map((word) => (word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)),
  );
const tagFeatures = {
  nav: 'navigation',
  table: 'table',
  dialog: 'overlay',
  select: 'select',
  textarea: 'input',
  fieldset: 'forms',
  img: 'gallery',
  video: 'gallery',
};

export function screenSignals(text, framework) {
  const words = [],
    present = new Set(),
    variants = new Set();
  if (framework === 'react' || framework === 'react-native') {
    const ast = parse(text, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    function walk(node, visible = false) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'JSXElement') {
        const tag = node.openingElement.name.name;
        if (tag === 'style' || tag === 'script') return;
        if (tagFeatures[tag]) present.add(tagFeatures[tag]);
        if (tag === 'input') present.add('forms');
        visible = true;
      }
      if (node.type === 'JSXText') words.push(node.value);
      if (node.type === 'JSXAttribute') {
        const name = node.name.name,
          value = node.value?.value;
        if (
          ['role', 'type', 'aria-label', 'title', 'placeholder'].includes(name) &&
          typeof value === 'string'
        ) {
          words.push(value);
          if (value === 'tablist') present.add('tabs');
          if (name === 'type' && value === 'search') present.add('search');
          if (name === 'type' && ['date', 'datetime-local'].includes(value)) present.add('dates');
          if (name === 'role' && ['status', 'alert'].includes(value)) present.add('notice');
        }
        return;
      }
      if (node.type === 'StringLiteral' && visible && node.value.length < 160)
        words.push(node.value);
      if (
        node.type === 'ObjectProperty' &&
        (node.key?.name || node.key?.value) === 'variant' &&
        typeof node.value?.value === 'string'
      )
        variants.add(node.value.value);
      for (const [key, value] of Object.entries(node))
        if (!['loc', 'extra', 'comments'].includes(key)) {
          if (Array.isArray(value)) value.forEach((child) => walk(child, visible));
          else if (value && typeof value === 'object') walk(value, visible);
        }
    }
    walk(ast.program);
  } else {
    const clean = text.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (value) =>
      value.startsWith('"') ? value : ' ',
    );
    for (const match of clean.matchAll(
      /\b(?:Text|Button|TextField|Label|navigationTitle)\s*\(\s*(?:text\s*=\s*|verbatim\s*:\s*)?"((?:\\.|[^"\\])*)"/g,
    ))
      words.push(match[1]);
    const masked = clean.replace(/"(?:\\.|[^"\\])*"/g, '""');
    for (const [feature, expression] of Object.entries({
      tabs: /\bTabView\b|\bTabRow\b/,
      search: /\.searchable\b/,
      dates: /\bDatePicker\b|\bDatePickerDialog\b/,
      forms: /\bTextField\b|\bOutlinedTextField\b|\bForm\b/,
      navigation: /\bNavigationStack\b|\bNavigationRail\b/,
      table: /\bTable\b/,
      gallery: /\bImage\b/,
      chart: /\bChart\b/,
    }))
      if (expression.test(masked)) present.add(feature);
  }
  return {
    words: words.join(' ').slice(0, 30000),
    present,
    variants,
    features: new Set(text.match(/\brf_[a-f0-9]{12}\b/g) || []),
  };
}

export function recommendComponents({
  screens,
  branding,
  clipboard = [],
  goal = '',
  next = false,
  vite = false,
  totalScreens = screens.length,
  semantic = false,
}) {
  const signals = screens.map(
    (screen) => screen.signals || screenSignals(screen.text, screen.framework),
  );
  const context =
    signals.map((s) => s.words).join(' ') +
    ' ' +
    screens.map((s) => s.path).join(' ') +
    ' ' +
    (branding.theme.brandName || '') +
    ' ' +
    (branding.theme.tagline || '');
  const present = new Set(signals.flatMap((s) => [...s.present])),
    variants = new Set(signals.flatMap((s) => [...s.variants])),
    features = new Set(signals.flatMap((s) => [...s.features]));
  const positiveGoal = goal.replace(
    /\b(?:no|avoid|without|skip|exclude)\s+(?:any\s+)?(?:external\s+)?(?:charts?|ai|auth|forms?|modals?|animations?|backend|services?|apis?)\b/gi,
    ' ',
  );
  const sourceNeeds = needs.filter((need) => need.words.test(context)),
    goalNeeds = needs.filter((need) => need.words.test(positiveGoal));
  const framework = screens[0]?.framework;
  const client = !next || screens.some((s) => /^[\s;]*["']use client["']/.test(s.text));
  const material2 =
    framework === 'compose' && screens.some((s) => /androidx\.compose\.material\./.test(s.text));
  const warnings = [];
  if (next && !client)
    warnings.push('Choose an existing Next.js client screen for interactive Originals.');
  if (material2) warnings.push('This screen uses Material 2; the installer requires Material 3.');
  if (framework === 'react-native')
    warnings.push(
      'Originals and full-stack features do not have a React Native installer. Only compatible basic clipboard captures are considered.',
    );
  const seenLibrary = new Set();
  const candidates = [];
  for (const item of clipboard) {
    const entry = catalog.find((e) => e.id === item.libraryId);
    if (item.libraryId && !entry) continue;
    if (entry) {
      if (seenLibrary.has(entry.id)) continue;
      seenLibrary.add(entry.id);
    }
    candidates.push({ entry, item, origin: 'clipboard' });
  }
  candidates.push(
    ...catalog
      .filter((entry) => !seenLibrary.has(entry.id))
      .map((entry) => ({ entry, origin: 'original' })),
  );
  const negative = (kind) =>
    [
      ...goal.matchAll(
        /\b(?:no|avoid|without|skip|exclude)\s+(?:any\s+)?(?:external\s+)?(charts?|ai|auth|forms?|modals?|animations?|backend|services?|apis?)\b/gi,
      ),
    ].some(([, word]) =>
      (
        ({
          chart: ['chart', 'number'],
          ai: ['agent'],
          auth: ['signup', 'otp'],
          form: ['input', 'forms', 'choices', 'select'],
          modal: ['overlay'],
          animation: ['motion'],
        })[word.toLowerCase().replace(/s$/, '')] || []
      ).includes(kind),
    );
  const noServices =
    /\b(?:no|avoid|without|skip|exclude)\s+(?:any\s+)?(?:external\s+)?(?:services?|apis?)\b/i.test(
      goal,
    );
  const noBackend = /\b(?:no|avoid|without|skip|exclude)\s+(?:any\s+)?backend\b/i.test(goal);
  const ranked = [];
  for (const candidate of candidates) {
    const { entry, item, origin } = candidate;
    if (material2) continue;
    if (
      entry &&
      (!['react', 'swiftui', 'compose'].includes(framework) ||
        !client ||
        variants.has(entry.props.variant))
    )
      continue;
    if (item?.featureId && features.has(item.featureId)) continue;
    if (
      item?.backend &&
      (!['react', 'swiftui', 'compose'].includes(framework) ||
        (framework === 'react' && (!vite || next)))
    )
      continue;
    const $ = item && !entry ? load(item.html, null, false) : null;
    if (!entry && next && !client && $('button,a,input,select,textarea').length) continue;
    if (
      !entry &&
      framework === 'react-native' &&
      $('table,select,video,audio,canvas,svg,details').length
    )
      continue;
    const kinds = entry
      ? [entry.nativeKind]
      : [
          ...new Set([
            ...(item.backend ? ['forms'] : []),
            ...($('input,textarea,select').length ? ['input', 'forms'] : []),
            ...($('nav').length ? ['navigation'] : []),
            ...($('table').length ? ['table'] : []),
            ...($('img').length ? ['gallery'] : []),
            'card',
          ]),
        ];
    const services =
      entry?.requirements ||
      (item?.service
        ? ['Uses the saved external API contract; configure the destination service.']
        : []);
    if (
      kinds.some(negative) ||
      ((noServices || noBackend) && services.length) ||
      (noBackend && item?.backend)
    )
      continue;
    const relevantSource = sourceNeeds.filter((n) => n.kinds.some((k) => kinds.includes(k))),
      relevantGoal = goalNeeds.filter((n) => n.kinds.some((k) => kinds.includes(k)));
    if (!semantic && services.length && !relevantSource.length && !relevantGoal.length) continue;
    if (
      !semantic &&
      ['swap', 'wallet', 'agent'].some((k) => kinds.includes(k)) &&
      !relevantSource.length &&
      !relevantGoal.length
    )
      continue;
    const name = entry?.name || item.name,
      description = entry?.description || item.name;
    const matchTokens = tokens(name + ' ' + description),
      goalTokens = tokens(positiveGoal),
      overlap = [...matchTokens].filter((t) => goalTokens.has(t)).length;
    if (!semantic && goalNeeds.length && !relevantGoal.length && !overlap) continue;
    if (!semantic && !relevantSource.length && !relevantGoal.length && !overlap) {
      if (
        sourceNeeds.length ||
        goalNeeds.length ||
        !['tabs', 'accordion', 'search', 'toast', 'brand', 'switch'].includes(entry?.id)
      )
        continue;
    }
    const existing = kinds.some((k) => present.has(k));
    const wiring =
      !entry && !item.backend && $('button,a,input[type=submit],input[type=button]').length > 0;
    const preference = [...relevantSource, ...relevantGoal].some((n) =>
      n.prefer.includes(entry?.id),
    );
    const score = Math.max(
      0,
      Math.min(
        95,
        48 +
          Math.min(20, relevantSource.length * 10) +
          Math.min(30, relevantGoal.length * 18) +
          Math.min(12, overlap * 4) +
          (existing ? -14 : 6) +
          (preference ? 5 : 0) +
          (origin === 'clipboard' ? 3 : 0) -
          (services.length ? 16 : 0) -
          (wiring ? 12 : 0),
      ),
    );
    const reasons = [];
    if (relevantGoal.length)
      reasons.push('Matches your goal: ' + relevantGoal.map((n) => n.label).join(', ') + '.');
    if (relevantSource.length)
      reasons.push(
        'Screen evidence suggests ' + relevantSource.map((n) => n.label).join(', ') + '.',
      );
    if (!reasons.length)
      reasons.push(
        'A small starting pattern to evaluate; the inspected screen gives limited intent evidence.',
      );
    if (existing)
      reasons.push(
        'A similar control appears in the sampled source; check whether you need another.',
      );
    else if (relevantSource.length || relevantGoal.length)
      reasons.push('This pattern was not detected in the sampled source.');
    const requirements = [
      ...services,
      ...(wiring
        ? ['Define button behavior or select an existing handler before installation.']
        : []),
      ...(item?.backend
        ? [
            'Includes a saved backend contract; destination runtime and account/service setup still need verification.',
          ]
        : []),
    ];
    ranked.push({
      id: entry?.id || item.id,
      libraryId: entry?.id || null,
      itemId: item?.id || null,
      name,
      category: entry?.category || 'Saved capture',
      kind: kinds[0],
      origin,
      score,
      reasons,
      requirements,
      readiness: services.length
        ? 'Connect services'
        : wiring
          ? 'Wire actions'
          : item?.backend
            ? 'Backend included'
            : entry
              ? 'Local UI behavior'
              : $('input,textarea,select').length
                ? 'Local input state'
                : 'Static capture',
      existing,
    });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score || Number(a.existing) - Number(b.existing) || a.name.localeCompare(b.name),
  );
  const selected = [],
    groups = new Set();
  for (const candidate of ranked) {
    if (semantic) {
      selected.push(candidate);
      continue;
    }
    const group =
      candidate.origin === 'clipboard' && !candidate.libraryId
        ? 'clipboard-' + candidate.id
        : candidate.kind;
    if (groups.has(group)) continue;
    selected.push(candidate);
    groups.add(group);
    if (selected.length === 6) break;
  }
  return {
    recommendations: selected,
    framework,
    signals: [...new Set([...sourceNeeds.map((n) => n.label), ...goalNeeds.map((n) => n.label)])],
    warnings,
    inspected: screens.map(({ path, framework }) => ({ path, framework })),
    totalScreens,
    considered: candidates.length,
    limited: !sourceNeeds.length && !goalNeeds.length,
    limitation:
      'Local source and goal matching, not AI inference or a runtime compatibility guarantee. Similar controls can exist in uninspected files. Choose a screen and container for the actual project-fit check.',
  };
}
