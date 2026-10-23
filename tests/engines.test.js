import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '@babel/parser';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { engineStatus, policyReview, reviewFeature } from '../server/engines.js';
import { analyzeFiles, sourceDigest } from '../server/analyze.js';
import { refineSourceComments, refineCopy } from '../server/refine.js';
import { buildFeature } from '../server/features.js';

test('engine availability is read from installed files and Ponytail checks real imports', async () => {
  const status = await engineStatus();
  assert.equal(status.ponytail.available, true);
  const policy = await readFile(new URL('../vendor/ponytail/rules.md', import.meta.url));
  assert.equal(status.ponytail.sha256, createHash('sha256').update(policy).digest('hex'));
  assert.equal(status.rea.version, '6.7.0');
  assert.equal(status.rea.available, true);
  assert.equal(status.turnitout.available, false);
  assert.equal(status.turnitout.replacement, 'Reframe Copy Polish');
  const clean = await policyReview({
    'Component.tsx': "import React from 'react'; export default () => <p>Ready</p>",
    'server.mjs': "import fs from 'node:fs'; import './runtime.mjs';",
  });
  assert.equal(clean.status, 'passed');
  assert.deepEqual(clean.dependencies, ['react']);
  const extra = await policyReview({
    'component.js':
      "import lodash from 'lodash'; export { value } from 'another-package'; const x = import('dynamic-package'); const y = require('required-package');",
  });
  assert.equal(extra.status, 'review-needed');
  assert.deepEqual(extra.addedDependencies.sort(), [
    'another-package',
    'dynamic-package',
    'lodash',
    'required-package',
  ]);
  await assert.rejects(policyReview({ 'broken.tsx': 'export default () => <div>' }));
});

test('independent comment polish changes only parsed comments and protects tooling, strings and expressions', () => {
  const source = `/*! Utilize this licensed work in order to learn. */
// @ts-ignore utilize in order to
// eslint-disable-next-line utilize
// shortcut: utilize this until replaced
/** @param utilize in order to facilitate */
// c8 ignore next in order to facilitate
/// <reference path="utilize" />
const literal = "Utilize in order to facilitate";
const template = \`commence prior to \${literal}\`;
const regex = /utilize/;
// Utilize this in order to facilitate setup.
/* Commence prior to rendering. */
export default () => <p title="utilize">{literal}</p>;`;
  const result = refineSourceComments(source);
  assert.equal(result.edits.length, 2);
  assert.match(result.code, /\/\/ Use this to help setup\./);
  assert.match(result.code, /\/\* Start before rendering\. \*\//);
  const ast = (code) => parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const executable = (code) =>
    JSON.stringify(ast(code).program, (key, value) =>
      ['start', 'end', 'loc', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)
        ? undefined
        : value,
    );
  assert.equal(executable(source), executable(result.code));
  assert.match(result.code, /licensed work in order to learn/);
  assert.match(result.code, /@ts-ignore utilize in order to/);
  assert.match(result.code, /@param utilize in order to facilitate/);
  assert.match(result.code, /c8 ignore next in order to facilitate/);
  assert.match(result.code, /reference path="utilize"/);
  assert.throws(() => refineSourceComments('const = broken;'));
  const copy = refineCopy(
    '<p aria-label="utilize">Utilize this in order to commence.</p><code>utilize</code>',
  );
  assert.match(copy.html, /aria-label="utilize">Use this to start/);
  assert.match(copy.html, /<code>utilize<\/code>/);
});

test('real REA covers generated frontend, backend and schema without executing supplied source', async () => {
  const html = '<section><p>Utilize this in order to commence.</p><button>Like</button></section>';
  const bundle = await buildFeature({ html, name: 'Favorite' });
  const review = await reviewFeature(bundle.files, html);
  assert.equal(review.policy.status, 'passed');
  assert.equal(review.copy.edits, 1);
  assert.equal(review.analysis.engine, 'REA 6.7.0');
  assert.deepEqual(review.analysis.files.sort(), [
    'Component.tsx',
    'feature.json',
    'native-server.mjs',
    'runtime.mjs',
    'server.mjs',
    'services.mjs',
  ]);
  assert.ok(review.analysis.evidenceId);
  assert.ok(review.analysis.nodes > 0);
  assert.ok(review.analysis.limitations.length);
  assert.equal(review.sourceDigest, review.analysis.sourceDigest);
  const polished = await buildFeature({
    html: refineCopy(html).html,
    name: bundle.spec.name,
    spec: bundle.spec,
  });
  assert.equal(polished.spec.id, bundle.spec.id);
  assert.deepEqual(polished.spec.actions, bundle.spec.actions);
  assert.notEqual(polished.sourceHash, bundle.sourceHash);
  assert.equal(polished.files['runtime.mjs'], bundle.files['runtime.mjs']);
  const sources = {
    'danger.js': "throw new Error('SOURCE_EXECUTED'); export function pure(x) { return x + 1; }",
  };
  const result = await analyzeFiles(sources);
  assert.equal(result.sourceDigest, sourceDigest(sources));
  assert.ok(JSON.stringify(result.report.normalized_result).includes('pure'));
  for (const invalid of [
    null,
    {},
    { '../escape.js': 'export const x = 1;' },
    { 'blank.js': '' },
    { 'large.js': 'x'.repeat(500001) },
  ])
    await assert.rejects(analyzeFiles(invalid));
  assert.equal(
    sourceDigest({ 'b.js': 'b', 'a.js': 'a' }),
    sourceDigest({ 'a.js': 'a', 'b.js': 'b' }),
  );
});
