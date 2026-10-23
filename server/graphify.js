import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceDigest } from './analyze.js';

const python =
  process.env.GRAPHIFY_PYTHON || path.join(homedir(), '.local/share/uv/tools/graphifyy/bin/python');
const run = promisify(execFile),
  script = fileURLToPath(new URL('./graphify-source.py', import.meta.url));
const env = { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1', NO_COLOR: '1' };
let status,
  pending = 0;
export function graphifyStatus() {
  return (status ??= run(
    python,
    ['-c', 'from importlib.metadata import version; print(version("graphifyy"))'],
    { env, timeout: 5000, maxBuffer: 10000 },
  )
    .then(({ stdout }) => ({
      available: true,
      version: stdout.trim(),
      scope: 'Local AST source graph. No model calls or execution of supplied code.',
    }))
    .catch(() => ({
      available: false,
      version: null,
      scope: 'Run npm run graphify:setup; set GRAPHIFY_PYTHON if installed elsewhere.',
    })));
}
export async function graphifySource(code) {
  if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > 500000)
    throw new Error('Provide JavaScript/TypeScript source under 500 KB.');
  if (pending)
    throw Object.assign(new Error('A Graphify check is already running.'), { status: 429 });
  if (!(await graphifyStatus()).available)
    throw new Error('Graphify is unavailable. Run npm run graphify:setup.');
  pending++;
  let folder;
  try {
    folder = await mkdtemp(path.join(tmpdir(), 'reframe-graphify-'));
    await writeFile(path.join(folder, 'component.tsx'), code, { mode: 0o600 });
    const { stdout } = await run(python, [script, folder], {
      env,
      timeout: 20000,
      maxBuffer: 8000000,
    });
    const graph = JSON.parse(stdout);
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
      throw new Error('Invalid graph.');
    return {
      engine: 'Graphify ' + (await graphifyStatus()).version,
      sourceDigest: sourceDigest({ 'component.tsx': code }),
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      graph: { nodes: graph.nodes.slice(0, 3000), edges: graph.edges.slice(0, 6000) },
      truncated: graph.nodes.length > 3000 || graph.edges.length > 6000,
      limitation:
        'Static AST relationships, including upstream inferred edges; not private-logic recovery or runtime proof. Displayed graph is bounded to 3000 nodes / 6000 edges.',
    };
  } catch {
    throw new Error(
      'Graphify could not analyze this source. Check supported syntax and the installed Python environment.',
    );
  } finally {
    try {
      if (folder) await rm(folder, { recursive: true, force: true });
    } finally {
      pending--;
    }
  }
}
