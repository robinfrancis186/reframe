import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Process-local evidence only: restarting or updating REA always starts a fresh cache.
const completed = new Map(),
  inFlight = new Map();
const maxCacheBytes = 16 * 1024 * 1024;
let cacheBytes = 0;
let queue = Promise.resolve(),
  pending = 0;
export const sourceDigest = (files) =>
  createHash('sha256')
    .update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex');
export async function analyzeSource(source) {
  if (typeof source !== 'string' || !source.trim())
    throw new Error('Paste JavaScript or TypeScript source under 500 KB.');
  return analyzeFiles({ 'component.tsx': source });
}
/** @param {Record<string, string>} files */
export async function analyzeFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files))
    throw new Error('Provide source files for analysis.');
  const entries = Object.entries(files);
  if (
    !entries.length ||
    entries.length > 20 ||
    entries.some(
      ([name, text]) =>
        !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\.(?:js|jsx|ts|tsx|mjs|json)$/.test(name) ||
        typeof text !== 'string' ||
        !text.trim(),
    ) ||
    entries.reduce((n, [, text]) => n + Buffer.byteLength(text), 0) > 500000
  )
    throw new Error('Use 1–20 source files with plain filenames, under 500 KB total.');
  // Snapshot before any await so queued analysis and its digest describe the same bytes.
  const snapshot = Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
  const digest = sourceDigest(snapshot);
  const started = performance.now();
  const pkg = JSON.parse(
    await readFile(path.join(root, 'node_modules/rea-agents/package.json'), 'utf8'),
  );
  const key = `${pkg.version}:${digest}`;
  const cached = completed.get(key);
  if (cached) {
    completed.delete(key);
    completed.set(key, cached);
    return {
      ...JSON.parse(cached.text),
      reused: true,
      elapsedMs: Math.round(performance.now() - started),
    };
  }
  if (inFlight.has(key)) {
    return {
      ...structuredClone(await inFlight.get(key)),
      reused: true,
      elapsedMs: Math.round(performance.now() - started),
    };
  }
  if (pending >= 4)
    throw Object.assign(new Error('Analysis queue is full. Try again shortly.'), { status: 429 });
  pending++;
  const work = queue.then(async () => {
    let folder;
    try {
      folder = await mkdtemp(path.join(tmpdir(), 'reframe-analysis-'));
      await Promise.all(
        entries.map(([name, text]) => writeFile(path.join(folder, name), text, { mode: 0o600 })),
      );
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          path.join(root, 'node_modules/rea-agents/scripts/rea.mjs'),
          'analyze-javascript-application',
          folder,
          '--json',
        ],
        { timeout: 60000, maxBuffer: 32_000_000, env: { ...process.env, NO_COLOR: '1' } },
      );
      const report = JSON.parse(stdout);
      if (typeof report.evidence_id !== 'string' || !report.normalized_result?.graph)
        throw new Error('REA returned an incomplete evidence record.');

      return {
        report,
        engine: `REA ${pkg.version}`,
        files: entries.map(([name]) => name),
        sourceDigest: digest,
        analyzedAt: new Date().toISOString(),
        limitation:
          'Static analysis of supplied frontend/backend source; not proof of runtime behavior, recovery of private logic, or native binary analysis.',
      };
    } catch (error) {
      throw new Error(`Source analysis failed: ${String(error.message).slice(0, 500)}`, {
        cause: error,
      });
    } finally {
      try {
        if (folder) await rm(folder, { recursive: true, force: true });
      } finally {
        pending--;
      }
    }
  });
  inFlight.set(key, work);
  queue = work.then(
    () => {},
    () => {},
  );
  try {
    const result = await work;
    const text = JSON.stringify(result),
      bytes = Buffer.byteLength(text);
    if (bytes <= maxCacheBytes) {
      while (completed.size >= 8 || cacheBytes + bytes > maxCacheBytes) {
        const oldest = completed.keys().next().value;
        cacheBytes -= completed.get(oldest).bytes;
        completed.delete(oldest);
      }
      completed.set(key, { text, bytes });
      cacheBytes += bytes;
    }
    return { ...result, reused: false, elapsedMs: Math.round(performance.now() - started) };
  } finally {
    inFlight.delete(key);
  }
}
export function analysisSummary(result) {
  const { report, engine, files, sourceDigest, limitation } = result;
  return {
    status: 'analyzed',
    reused: !!result.reused,
    analyzedAt: result.analyzedAt,
    elapsedMs: result.elapsedMs,
    engine,
    files,
    sourceDigest,
    evidenceId: report.evidence_id,
    nodes: report.normalized_result.graph.nodes?.length || 0,
    unknowns: Array.isArray(report.normalized_result.semantic_graph?.unknowns)
      ? report.normalized_result.semantic_graph.unknowns.length
      : null,
    limitations: report.limitations || [],
    limitation,
  };
}
