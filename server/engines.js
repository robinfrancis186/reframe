import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { parse } from '@babel/parser';
import { analyzeFiles, analysisSummary, sourceDigest } from './analyze.js';
import { refineCopy, refineSourceComments } from './refine.js';
import { graphifyStatus } from './graphify.js';
import toolchain from '../vendor/toolchain.json' with { type: 'json' };

const policyFile = new URL('../vendor/ponytail/rules.md', import.meta.url);
const reaPackage = new URL('../node_modules/rea-agents/package.json', import.meta.url);
export async function engineStatus() {
  const [policy, rea] = await Promise.allSettled([
    readFile(policyFile, 'utf8'),
    readFile(reaPackage, 'utf8').then(async (text) => {
      await access(new URL('../node_modules/rea-agents/scripts/rea.mjs', import.meta.url));
      return JSON.parse(text).version;
    }),
  ]);
  return {
    versionsCheckedAt: toolchain.checkedAt,
    graphify: { ...(await graphifyStatus()), latestVerified: toolchain.graphify.version },
    ponytail:
      policy.status === 'fulfilled'
        ? {
            available: true,
            version: toolchain.ponytail.version,
            latestVerified: toolchain.ponytail.version,
            kind: 'instruction-policy',
            bytes: Buffer.byteLength(policy.value),
            sha256: createHash('sha256').update(policy.value).digest('hex'),
            limitation:
              'Instruction policy plus bounded generator checks; no standalone optimizer or proof of minimality.',
          }
        : { available: false, limitation: 'Bundled policy cannot be read.' },
    rea: {
      available: rea.status === 'fulfilled',
      version: rea.status === 'fulfilled' ? rea.value : null,
      scope:
        'Local JavaScript/TypeScript frontend and backend static analysis. Native decompilers and runtime instrumentation are not integrated.',
    },
    turnitout: {
      available: false,
      replacement: 'Reframe Copy Polish',
      scope:
        'Independent UI copy, JS/TS comments, TXT, Markdown, LaTeX and DOCX review with protected citation fields.',
      limitation:
        'The original core is inaccessible. Our independent replacement offers conservative wording review; no detector-evasion or human-authorship guarantees.',
    },
  };
}
export function featureSources(files) {
  const sources = Object.fromEntries(
    Object.entries(files).filter(([name]) => /\.(?:tsx?|jsx?|mjs|json)$/.test(name)),
  );
  if (sources['feature.json']) {
    const spec = JSON.parse(sources['feature.json']);
    if (spec.website)
      sources['feature.json'] = JSON.stringify({
        ...spec,
        website: {
          pages: spec.website.pages.map((p) => ({ url: p.url, title: p.title, forms: p.forms })),
          contentSha256: createHash('sha256').update(JSON.stringify(spec.website)).digest('hex'),
          note: 'HTML, CSS and PDF content are non-executable data; the authored runtime is analyzed separately.',
        },
      });
  }
  if (!Object.keys(sources).length) throw new Error('No source files to review.');
  return sources;
}
export async function policyReview(files) {
  const status = (await engineStatus()).ponytail;
  if (!status.available) throw new Error(status.limitation);
  const dependencies = new Set(),
    builtins = new Set(builtinModules.map((n) => n.replace(/^node:/, '')));
  let bytes = 0;
  for (const [name, code] of Object.entries(files)) {
    bytes += Buffer.byteLength(code);
    if (/\.json$/.test(name)) {
      JSON.parse(code);
      continue;
    }
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    function dependency(value) {
      if (
        typeof value === 'string' &&
        !value.startsWith('.') &&
        !value.startsWith('node:') &&
        !builtins.has(value)
      )
        dependencies.add(value);
    }
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration'
      )
        dependency(node.source?.value);
      if (node.type === 'ImportExpression') dependency(node.source?.value);
      if (node.type === 'CallExpression' && node.callee?.name === 'require')
        dependency(node.arguments[0]?.value);
      for (const [key, value] of Object.entries(node))
        if (
          ![
            'loc',
            'comments',
            'extra',
            'leadingComments',
            'trailingComments',
            'innerComments',
          ].includes(key)
        ) {
          if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === 'object') walk(value);
        }
    }
    walk(ast.program);
  }
  const added = [...dependencies].filter(
    (d) => !['react', 'react/jsx-runtime', 'vite'].includes(d),
  );
  return {
    status: added.length ? 'review-needed' : 'passed',
    policySha256: status.sha256,
    bytes,
    dependencies: [...dependencies].sort(),
    addedDependencies: added,
    files: Object.keys(files),
    checks: [
      'Bundled Ponytail policy readable',
      'Generated JS/TS parses without execution',
      'External imports counted against React/Vite baseline',
    ],
    limitation:
      'Bounded structural checks inspired by Ponytail; not an optimizer or a guarantee that every line is necessary.',
  };
}
export async function reviewFeature(files, html) {
  const sources = featureSources(files);
  const policy = await policyReview(sources);
  const copy = refineCopy(html);
  const comments = Object.entries(sources)
    .filter(([name]) => !name.endsWith('.json'))
    .map(([file, source]) => ({ file, edits: refineSourceComments(source).edits.length }));
  const analysis = analysisSummary(await analyzeFiles(sources));
  return {
    checkedAt: new Date().toISOString(),
    sourceDigest: sourceDigest(sources),
    analysis,
    policy,
    copy: {
      engine: copy.engine,
      edits: copy.edits.length,
      suggestions: copy.edits
        .slice(0, 20)
        .map((e) => ({ before: e.before.slice(0, 200), after: e.after.slice(0, 200) })),
      comments,
      limitation: copy.limitation,
    },
  };
}
