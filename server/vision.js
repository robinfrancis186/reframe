import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extract } from './capture.js';
import { reconstructionFrames } from './fit.js';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
let compiler, pending = 0;
async function binary() {
  if (!compiler) compiler = (async () => {
    if (process.platform !== 'darwin') throw new Error('Local OCR requires macOS Vision. Configure OpenAI for this operating system.');
    const source = path.join(root, 'server/ocr.swift');
    const hash = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 16);
    const folder = path.join(root, '.reframe/bin'); await mkdir(folder, { recursive: true, mode: 0o700 });
    const output = path.join(folder, 'ocr-' + hash);
    try { await access(output); } catch { await run('xcrun', ['swiftc', source, '-O', '-o', output], { timeout: 120000, maxBuffer: 1000000 }); }
    return output;
  })().catch(error => { compiler = null; throw error; });
  return compiler;
}
export async function localVisionStatus() {
  try { await binary(); return { available: true, engine: 'macOS Vision OCR', limitation: 'Local text and label reconstruction. Graphics, exact layout and hidden behavior require review.' }; }
  catch { return { available: false, engine: 'macOS Vision OCR', limitation: 'macOS Vision and the Swift command-line compiler are required for local OCR.' }; }
}
const escape = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function observedMarkup(observation) {
  if (!observation || !Array.isArray(observation.blocks) || observation.blocks.length > 200) throw new Error('Invalid OCR observations.');
  const blocks = observation.blocks.filter(b => typeof b.text === 'string' && b.text.trim() && b.text.length <= 2000 && Array.isArray(b.bounds) && b.bounds.length === 4 && b.bounds.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1));
  blocks.sort((a, b) => Math.abs(a.bounds[1] - b.bounds[1]) < .015 ? a.bounds[0] - b.bounds[0] : a.bounds[1] - b.bounds[1]);
  if (!blocks.length) throw new Error('No readable text found. Crop a clearer component, import its hierarchy, or configure OpenAI vision.');
  let heading = false;
  const html = blocks.map(block => {
    const text = block.text.trim(), safe = escape(text);
    if (/^(?:email(?: address)?|name|first name|last name|search|password|phone(?: number)?)$/i.test(text)) {
      const type = /email/i.test(text) ? 'email' : /password/i.test(text) ? 'password' : /search/i.test(text) ? 'search' : 'text';
      return `<label>${safe}<input type="${type}" aria-label="${safe}"></label>`;
    }
    if (/^(?:(?:add|save|submit|subscribe|update|delete|remove|search|find|like|follow|count|increment|reset|clear|continue|sign in|sign up|buy|learn more|check in)(?:\s+(?:record|contact|item|now|in))?)$/i.test(text)) return `<button>${safe}</button>`;
    if (!heading && text.length <= 100 && !/^\d/.test(text)) { heading = true; return `<h2>${safe}</h2>`; }
    return `<p>${safe}</p>`;
  }).join('\n');
  return `<section>${html}</section>`;
}
export async function reconstructLocal(body) {
  const frames = reconstructionFrames(body);
  if (pending >= 2) throw Object.assign(new Error('Local reconstruction is busy. Try again shortly.'), { status: 429 });
  pending++;
  let folder;
  try {
    const executable = await binary(); folder = await mkdtemp(path.join(tmpdir(), 'reframe-ocr-'));
    const observations = [];
    for (const [index, frame] of frames.entries()) {
      const file = path.join(folder, `${index}.image`);
      await writeFile(file, Buffer.from(frame.image.split(',')[1], 'base64'), { mode: 0o600 });
      const { stdout } = await run(executable, [file], { timeout: 30000, maxBuffer: 1000000 });
      observations.push(JSON.parse(stdout));
    }
    const result = extract(observedMarkup(observations[0]), frames.length > 1 ? 'Local video / camera OCR' : 'Local screenshot OCR');
    result.items = result.items.map(item => ({ ...item, kind: 'screenshot', referenceImage: frames[0].image, evidence: `macOS Vision OCR of ${frames.length} selected frame(s). Editable text and label-based control suggestions; layout, control roles and business rules need review. No private logic was recovered.` }));
    return { ...result, engine: 'macOS Vision OCR', observations: observations.map((o, i) => ({ ...o, time: frames[i].time ?? 0 })) };
  } finally { try { if (folder) await rm(folder, { recursive: true, force: true }); } finally { pending--; } }
}
