import { load } from 'cheerio';
import { cleanHtml, inspectQuality } from './capture.js';
import { generate } from './generate.js';

// These are transparent source heuristics, not a runtime or visual-fidelity benchmark.
export function projectFit({ html, framework, source = '', handler = '', handlers = [], themeEvidence = '', nextApp = false }) {
  if (typeof html !== 'string' || !html.trim() || html.length > 500_000) throw new Error('Choose a component under 500 KB.');
  if (handler && !handlers.includes(handler)) throw new Error('Choose a handler available in this container.');
  const safe = cleanHtml(html), $ = load(safe, null, false);
  const generated = generate(safe, 'ReframeFitPreview', framework);
  const quality = inspectQuality(safe);
  const bytes = Buffer.byteLength(generated.code + '\n' + generated.imports.join('\n'));
  const native = framework !== 'react';
  const unsupported = native ? $('img,video,audio,canvas,svg,table,select,details').length : $('img,video,audio,canvas,svg,select').length;
  const token = /--(?:color-)?primary\s*:/.test(themeEvidence);
  const actions = generated.actions.length;
  const issues = quality.issues.filter(i => !/action|wire|placeholder|link/i.test(i));
  const material2 = framework === 'compose' && /androidx\.compose\.material\./.test(source);
  const serverComponent = framework === 'react' && nextApp && (actions > 0 || $('input,textarea,select').length > 0) && !/^[\s;]*["']use client["']/.test(source);
  const blocked = material2 || serverComponent;
  const categories = [
    { name: 'Framework', weight: 25, score: blocked ? 0 : Math.max(30, 100 - unsupported * 15), reason: blocked ? (material2 ? 'Material 2 screen: this generator requires Material 3.' : 'Interactive Next.js integration requires an existing client component.') : `${framework} generator available. ${unsupported ? `${unsupported} element(s) need manual reconstruction.` : 'Captured elements map to supported primitives.'}` },
    { name: 'Theme', weight: 20, score: framework === 'react' ? (token ? 90 : 55) : framework === 'react-native' ? 65 : 90, reason: framework === 'react' ? (token ? 'Primary color token found in project CSS; typography inherits. Verify cascade in app.' : 'Typography inherits. No primary color token found in inspected CSS; import project tokens.') : framework === 'react-native' ? 'Selected palette is passed as a prop; connect the app theme provider manually.' : 'Uses native semantic fonts and enclosing accent / MaterialTheme.' },
    { name: 'Action wiring', weight: 25, score: actions ? (handler ? 90 : 20) : 100, reason: actions ? `${actions} action(s). ${handler ? `Connected to ${handler}; verify action IDs and business behavior.` : 'Select an existing handler; otherwise actions only log IDs.'}` : 'No action callbacks required.' },
    { name: 'Accessibility', weight: 15, score: Math.max(0, 100 - issues.length * 20), reason: issues.length ? issues.join(' ') : 'No label / alt issues found by basic HTML checks. Screen-reader testing still required.' },
    { name: 'Code size', weight: 15, score: bytes <= 3_072 ? 100 : bytes <= 10_240 ? 80 : bytes <= 30_720 ? 50 : 20, reason: `${(bytes / 1024).toFixed(1)} KB generated source; ${quality.elements} elements. Excludes assets, framework and compiled bundle.` },
  ];
  const themeTokens = {};
  for (const [key, names] of Object.entries({ primary: ['primary', 'color-primary'], background: ['background', 'color-background', 'surface'], text: ['foreground', 'color-text'] })) {
    for (const name of names) {
      const match = themeEvidence.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{6})\\b`, 'i'));
      if (match) { themeTokens[key] = match[1]; break; }
    }
  }
  const score = Math.round(categories.reduce((sum, c) => sum + c.score * c.weight / 100, 0));
  const status = blocked ? 'blocked' : unsupported ? 'adapt' : actions && !handler ? 'connect-actions' : 'review';
  const decision = {
    model: 'Local rules v1', status,
    label: { blocked: 'Choose a supported destination', adapt: 'Reconstruct unsupported elements', 'connect-actions': 'Connect your app’s behavior', review: 'Ready for source review' }[status],
    reason: blocked || unsupported ? categories[0].reason : actions && !handler ? categories[2].reason : 'Supported structure and action wiring are ready to review. Test the result in your app before shipping.',
    frontend: `${quality.elements} captured elements; ${unsupported} need manual reconstruction.`,
    logic: `${generated.minimal.stateFields} local input states; ${actions} action IDs${handler ? ` routed to ${handler}` : ' require your app’s handlers'}.`,
    backend: 'Not recovered. Source URLs and screenshots do not expose private APIs, validation, authentication or data storage.',
  };
  return { score, decision, themeTokens, verdict: blocked ? 'Framework change needed' : score >= 85 ? 'Strong starting fit' : score >= 65 ? 'Some adaptation needed' : 'Review before integrating', categories, bytes, elements: quality.elements, actions, recommendations: categories.filter(c => c.score < 85).map(c => c.reason), limitation: 'Source-based estimate, not a compatibility guarantee or a measure of conversion, visual fidelity or runtime performance.' };
}

export function reconstructionFrames(body) {
  const frames = body.frames ?? (body.image ? [{ image: body.image, time: 0 }] : []);
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 6) throw new Error('Select 1–6 frames.');
  let total = 0;
  for (const frame of frames) {
    if (!frame || typeof frame.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(frame.image) || frame.image.length > 7_000_000 || (frame.time !== undefined && (typeof frame.time !== 'number' || !Number.isFinite(frame.time) || frame.time < 0))) throw new Error('Use valid PNG, JPEG or WebP frames with nonnegative timestamps.');
    total += frame.image.length;
  }
  if (total > 7_000_000) throw new Error('Selected frames exceed 5 MB. Use fewer or smaller frames.');
  return frames;
}
