import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
      const pkg = JSON.parse(
        await readFile(path.join(root, 'node_modules/rea-agents/package.json'), 'utf8'),
      );
      return {
        report,
        engine: `REA ${pkg.version}`,
        files: entries.map(([name]) => name),
        sourceDigest: sourceDigest(files),
        limitation:
          'Static analysis of supplied frontend/backend source; not proof of runtime behavior, recovery of private logic, or native binary analysis.',
      };
    } catch (error) {
      throw new Error(`Source analysis failed: ${String(error.message).slice(0, 500)}`);
    } finally {
      try {
        if (folder) await rm(folder, { recursive: true, force: true });
      } finally {
        pending--;
      }
    }
  });
  queue = work.catch(() => {});
  return work;
}
export function analysisSummary(result) {
  const { report, engine, files, sourceDigest, limitation } = result;
  return {
    status: 'analyzed',
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
