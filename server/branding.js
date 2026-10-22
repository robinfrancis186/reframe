import { detectNativeTokens } from './branding-native.js';
import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { safeFont } from '../src/branding.js';

const hex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
export function cssColor(value) {
  value = value.trim().toLowerCase();
  if (/^#[a-f0-9]{6}$/.test(value)) return value;
  if (/^#[a-f0-9]{3}$/.test(value)) return '#' + [...value.slice(1)].map(c => c + c).join('');
  const values = value.match(/[-+]?(?:\d*\.)?\d+%?/g) || [];
  if (values.length !== 3) return null; // Translucent colors need the actual composited surface.
  const n = values.map(parseFloat);
  if (value.startsWith('rgb')) return hex(n.map((v, i) => v / (values[i].endsWith('%') ? 100 : 255)));
  if (value.startsWith('hsl') || /^[-+\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(value)) {
    const h = ((n[0] % 360) + 360) % 360 / 30, s = n[1] / 100, l = n[2] / 100, a = s * Math.min(l, 1 - l);
    return hex([0, 8, 4].map(offset => { const k = (offset + h) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }));
  }
  if (value.startsWith('oklch')) {
    if (values[2].endsWith('%')) return null;
    n[1] = n[1] * (values[1].endsWith('%') ? .004 : 1);
    const L = n[0] / (values[0].endsWith('%') ? 100 : 1), a = n[1] * Math.cos(n[2] * Math.PI / 180), b = n[1] * Math.sin(n[2] * Math.PI / 180);
    const l = (L + .3963377774*a + .2158037573*b)**3, m = (L - .1055613458*a - .0638541728*b)**3, s = (L - .0894841775*a - 1.291485548*b)**3;
    return hex([4.0767416621*l - 3.3077115913*m + .2309699292*s, -1.2684380046*l + 2.6097574011*m - .3413193965*s, -.0041960863*l - .7034186147*m + 1.707614701*s].map(c => c <= .0031308 ? 12.92*c : 1.055*c**(1/2.4)-.055));
  }
  return null;
}
const aliases = { primary: ['primary', 'color-primary', 'brand', 'accent', 'accent-color'], background: ['background', 'color-background', 'surface', 'bg'], text: ['foreground', 'color-text', 'text', 'ink'], radius: ['radius', 'border-radius'], font: ['font-sans', 'font', 'font-family'] };
export function detectTokens(files, mode = 'light') {
  const tokens = new Map(), evidence = [], theme = {};
  for (const file of files) {
    const css = file.text.replace(/\/\*[\s\S]*?\*\//g, '');
    const stack = []; let cursor = 0;
    for (const boundary of css.matchAll(/[{}]/g)) {
      if (boundary[0] === '{') { stack.push(css.slice(cursor, boundary.index).trim()); cursor = boundary.index + 1; continue; }
      const selector = stack.pop() || '', declarations = css.slice(cursor, boundary.index); cursor = boundary.index + 1;
      const conditions = stack.filter(s => s.startsWith('@media'));
      if (conditions.some(s => !/prefers-color-scheme\s*:\s*(dark|light)/.test(s))) continue;
      const context = selector + ' ' + conditions.join(' ');
      const dark = /\.dark\b|\[data-theme\s*=\s*["']?dark|prefers-color-scheme\s*:\s*dark/i.test(context);
      if (dark && mode !== 'dark' || /\.light\b|\[data-theme\s*=\s*["']?light|prefers-color-scheme\s*:\s*light/i.test(context) && mode === 'dark') continue;
      // shortcut: static selectors only; runtime theme providers and computed cascades need manual review.
      if (!/\.dark\b|\[data-theme\s*=/.test(selector) && !/(^|,)\s*(?::root|html|body)\s*(,|$)/.test(selector)) continue;
      for (const declaration of declarations.split(';')) {
        const colon = declaration.indexOf(':'); if (colon < 0) continue;
        const key = declaration.slice(0, colon).trim(), value = declaration.slice(colon + 1).replace(/!important\s*$/, '').trim();
      const old = tokens.get(key);
        if (!old?.dark || dark) tokens.set(key, { value, file: file.path, dark });
      }
    }
  }
  function resolve(key, seen = new Set()) {
    if (seen.has(key) || seen.size > 12) return null;
    seen.add(key); const token = tokens.get(key); if (!token) return null;
    return token.value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, name, fallback) => resolve(name, seen) || fallback || 'unresolved');
  }
  for (const [field, names] of Object.entries(aliases)) {
    for (const key of [...names.map(n => '--' + n), ...(field === 'font' ? ['font-family'] : field === 'background' ? ['background-color', 'background'] : field === 'text' ? ['color'] : [])]) {
      const raw = resolve(key); if (!raw) continue;
      let value = ['primary', 'background', 'text'].includes(field) ? cssColor(raw) : raw;
      if (field === 'font' && !safeFont(value)) continue;
      if (field === 'radius') {
        const size = /^(\d*\.?\d+)(px|rem)$/.exec(raw); if (!size) continue;
        value = Math.min(32, Number(size[1]) * (size[2] === 'rem' ? 16 : 1));
      }
      if (value === null) continue;
      theme[field] = value;
      evidence.push({ field, value, file: tokens.get(key).file, token: key, confidence: key.startsWith('--') ? 'high' : 'medium' }); break;
    }
  }
  return { theme, evidence };
}
export async function detectBranding(root, mode = 'light') {
  if (!['light', 'dark'].includes(mode)) throw new Error('Choose light or dark mode.');
  root = await realpath(root);
  const files = [], skipped = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'Pods', 'DerivedData', 'reframe']);
  let visited = 0, bytes = 0, logo;
  async function walk(folder, depth = 0) {
    if (depth > 12 || visited >= 800 || files.length >= 70) return;
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (++visited > 800 || files.length >= 70) break;
      if (entry.name.startsWith('.') || entry.isSymbolicLink() || skipped.has(entry.name)) continue;
      const full = path.join(folder, entry.name), relative = path.relative(root, full);
      const info = await lstat(full);
      if (info.isSymbolicLink() || !(await realpath(full)).startsWith(root + path.sep)) continue;
      if (entry.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!entry.isFile()) continue;
      if (!logo && /^(logo|brand|icon)[\w.-]*\.(png|jpe?g|webp)$/i.test(entry.name) && info.size <= 200000) {
        const data = await readFile(full), ext = /\.png$/i.test(full) ? 'png' : /\.webp$/i.test(full) ? 'webp' : 'jpeg';
        const valid = ext === 'png' ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ext === 'jpeg' ? data[0] === 255 && data[1] === 216 : data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP';
        if (valid) logo = { value: `data:image/${ext};base64,${data.toString('base64')}`, file: relative };
      }
      if (!(/\.(css|html)$/.test(entry.name) || /(?:^|\/)(?:colors|strings|styles|themes)\.xml$/.test(relative) || /(?:Theme|Color|Typography)[\w-]*\.(swift|kt)$/.test(entry.name) || /\.colorset\/Contents\.json$/.test(relative) || entry.name === 'Info.plist' || depth === 0 && entry.name === 'package.json') || info.size > 100000 || bytes + info.size > 700000) continue;
      files.push({ path: relative, text: await readFile(full, 'utf8') }); bytes += info.size;
    }
  }
  await walk(root);
  const result = detectTokens(files.filter(f => f.path.endsWith('.css')), mode);
  const native = detectNativeTokens(files,mode);
  for (const [key,value] of Object.entries(native.theme)) if (result.theme[key] === undefined) { result.theme[key]=value; result.evidence.push(...native.evidence.filter(e=>e.field===key)); }
  const html = files.find(f => f.path === 'index.html') || files.find(f => f.path.endsWith('.html'));
  if (html) {
    const $ = load(html.text), brandName = ($('meta[property="og:site_name"]').attr('content') || $('title').text().split(/[|·]/)[0]).trim().slice(0,100);
    const tagline = ($('meta[name="description"]').attr('content') || '').trim().slice(0,240);
    for (const [field, value] of Object.entries({ brandName, tagline })) if (value) { result.theme[field] = value; result.evidence.push({ field, value, file: html.path, token: 'HTML metadata', confidence: field === 'brandName' ? 'medium' : 'high' }); }
  }
  if (!result.theme.brandName) {
    try { const p = JSON.parse(files.find(f => f.path === 'package.json')?.text || '{}'); const name = p.displayName || p.name; if (typeof name === 'string') { result.theme.brandName = name.slice(0,100); result.evidence.push({ field: 'brandName', value: result.theme.brandName, file: 'package.json', token: 'package name', confidence: 'medium' }); } } catch {}
  }
  if (logo) { result.theme.logo = logo.value; result.evidence.push({ field: 'logo', value: logo.file, file: logo.file, token: 'local image candidate', confidence: 'low' }); }
  return { ...result, mode, filesScanned: files.length, cssFilesScanned: files.filter(f => f.path.endsWith('.css')).length, warnings: ['Static CSS and metadata estimate. Check inferred branding; runtime providers, remote fonts and unsupported theme expressions need manual setup. Native installations inherit unresolved platform colors. Missing fields keep your selected values.'] };
}
