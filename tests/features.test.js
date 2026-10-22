import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { inspectFeature, buildFeature, validatedFeature } from '../server/features.js';
import { featureHandler, validateSpec } from '../server/features/runtime.mjs';
import { Projects } from '../server/projects.js';
import { parse } from '@babel/parser';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const html = '<section><h2>Contact list</h2><label>Email<input type="email" required></label><button>Subscribe</button><button>Update</button><button>Delete</button><button>Search</button><button>Like</button><button>Continue</button></section>';
async function bundle() {
  const report = inspectFeature(html);
  report.actions.at(-1).operation = 'increment';
  return buildFeature({ html, name: 'Contact list', spec: report });
}
async function temporary(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'reframe-feature-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
async function listen(spec, file, fn) {
  const server = createServer(featureHandler(spec, file));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/reframe/${spec.id}`;
  const post = async body => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  try { return await fn(url, post); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('arbitrary captures expose ambiguous intent; authored rules compile frontend/backend and recompile untrusted backups', async () => {
  const r = inspectFeature(html);
  assert.equal(r.fields[0].required, true);
  assert.equal(r.actions.at(-1).operation, 'unresolved');
  await assert.rejects(buildFeature({ html, name: 'Contacts' }), /Define every action/);
  const built = await bundle();
  parse(built.files['Component.tsx'], { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const compiled = ts.transpile(built.files['Component.tsx'], { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }).replaceAll('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve('react/jsx-runtime'))}`).replaceAll("from 'react'", `from ${JSON.stringify(import.meta.resolve('react'))}`);
  const { default: Component } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  const rendered = renderToStaticMarkup(React.createElement(Component));
  assert.match(rendered, /Saved records/);
  assert.match(rendered, /Loading feature/);
  assert.match(built.files['Component.tsx'], /api\/reframe\/rf_/);
  assert.match(built.files['Component.tsx'], /setfield1/);
  assert.doesNotMatch(built.files['Component.tsx'], /console.info/);
  const imported = structuredClone(built); imported.files['runtime.mjs'] = 'evil()';
  const verified = await validatedFeature({ html, feature: imported });
  assert.notEqual(verified.files['runtime.mjs'], 'evil()');
  await assert.rejects(validatedFeature({ html: html + '<p>Changed</p>', feature: built }), /source changed/);
  await assert.rejects(buildFeature({ html: '<label>Password<input type="password"></label><button>Register</button>', name: 'Auth' }), /Authentication actions need/);
  await assert.rejects(buildFeature({ html: '<label>Plan<select><option>Pro</option></select></label><button>Save</button>', name: 'Plan' }), /choice-model/);
  const invalid = structuredClone(built.spec); invalid.actions[0].operation = 'navigate'; invalid.actions[0].target = 'javascript:evil()';
  assert.throws(() => validateSpec(invalid), /Navigation/);
  const noFields = await buildFeature({ html: '<button>Like</button>', name: 'Favorite' });
  parse(noFields.files['Component.tsx'], { sourceType: 'module', plugins: ['jsx', 'typescript'] });
});

test('generated API validates, persists, searches, updates, deletes, toggles and counts with concurrency and retry protection', () => temporary(async dir => {
  const b = await bundle(), file = path.join(dir, 'data.json');
  await listen(b.spec, file, async (url, post) => {
    let version = 0;
    const input = (action, values = { field1: 'member@example.org' }, extra = {}) => ({ action, values, version, requestId: randomUUID(), ...extra });
    const invalid = await post(input('action1', { field1: 'bad email' })); assert.equal(invalid.status, 400);
    assert.equal((await post(input('action1', { field1: '' }))).status, 400);
    const body = input('action1'), first = await post(body); assert.equal(first.status, 200); version = first.data.version;
    const recordId = first.data.records[0].id;
    const replay = await post(body); assert.equal(replay.data.records.length, 1); assert.equal(replay.data.version, version);
    assert.equal((await post({ ...body, values: { field1: 'another@example.org' } })).status, 409);
    const race = await Promise.all([post(input('action6')), post(input('action6'))]);
    assert.equal(race.filter(r => r.status === 200).length, 1); version++;
    assert.equal((await post(input('action2', { field1: 'updated@example.org' }, { recordId }))).status, 200); version++;
    const search = await post({ action: 'action4', query: 'updated' }); assert.equal(search.data.records.length, 1);
    assert.equal((await post({ action: 'action4', query: 'absent' })).data.records.length, 0);
    const toggle = await post(input('action5')); assert.equal(toggle.data.toggles.action5, true); version++;
    assert.equal((await post(input('action3', {}, { recordId: 'missing' }))).status, 404);
    const deleted = await post(input('action3', {}, { recordId })); assert.equal(deleted.data.records.length, 0); version++;
    const state = await (await fetch(url)).json(); assert.equal(state.counters.action6, 1); assert.equal(state.version, version);
    assert.equal((await fetch(url, { headers: { origin: 'https://evil.example' } })).status, 403);
    const corrupt = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }); assert.equal(corrupt.status, 400);
  });
  await listen(b.spec, file, async url => { const s = await (await fetch(url)).json(); assert.equal(s.toggles.action5, true); assert.equal(s.counters.action6, 1); });
}));

async function projectFixture(dir) {
  const root = path.join(dir, 'app'); await mkdir(path.join(root, 'src'), { recursive: true });
  const original = 'export default function App(){return <main><section></section></main>}';
  await writeFile(path.join(root, 'src/App.tsx'), original);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', dependencies: { react: '19' }, devDependencies: { vite: '6' }, scripts: { dev: 'vite', build: 'vite build' } }));
  const service = new Projects(path.join(dir, 'state')), project = await service.connect(root);
  const targets = await service.targets(project.id, 'src/App.tsx');
  const request = { projectId: project.id, file: 'src/App.tsx', pointId: targets.points[0].id, hash: targets.hash, html, name: 'ReframeContacts', feature: await bundle() };
  return { service, project, root, original, request };
}
test('full-stack integration reviews every file, preserves scripts, survives restart and undoes without deleting runtime data', () => temporary(async dir => {
  const { service, root, original, request } = await projectFixture(dir);
  const plan = await service.plan(request);
  assert.equal(plan.fullStack, true); assert.equal(plan.analysis.status, 'analyzed');
  assert.deepEqual(plan.analysis.files.sort(), ['Component.tsx', 'feature.json', 'native-server.mjs', 'runtime.mjs', 'server.mjs', 'services.mjs']);
  assert.equal(plan.review.policy.status, 'passed');
  assert.ok(plan.changes.some(c => c.file === 'reframe/server.mjs'));
  assert.equal(await readFile(path.join(root, 'src/App.tsx'), 'utf8'), original);
  await service.apply(plan.id);
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.dev, 'vite'); assert.equal(pkg.scripts['reframe:dev'], 'node reframe/server.mjs');
  const changedFeature = structuredClone(request.feature);
  changedFeature.spec.actions[0] = { ...changedFeature.spec.actions[0], operation: 'details', message: 'Our own authored behavior' };
  const freshTargets = await service.targets(request.projectId, request.file);
  const update = await service.plan({ ...request, hash: freshTargets.hash, pointId: freshTargets.points[0].id, feature: changedFeature });
  assert.equal(update.after, plan.after);
  assert.ok(update.changes.some(c => c.file.endsWith('Component.tsx')));
  await service.apply(update.id);
  await assert.rejects(service.undo(plan.id), /newer edits/);
  await service.undo(update.id);
  const dataDir = path.join(root, '.reframe/data'); await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'keep.json'), '{"saved":true}');
  await new Projects(path.join(dir, 'state')).undo(plan.id);
  assert.equal(await readFile(path.join(root, 'src/App.tsx'), 'utf8'), original);
  assert.equal(await readFile(path.join(dataDir, 'keep.json'), 'utf8'), '{"saved":true}');
  await assert.rejects(readFile(path.join(root, 'reframe/server.mjs')), /ENOENT/);
}));
test('multi-file integration rejects stale configuration and symlinks, and refuses undo over later edits', () => temporary(async dir => {
  const { service, root, request } = await projectFixture(dir);
  const plan = await service.plan(request);
  await writeFile(path.join(root, '.gitignore'), '# later edit');
  await assert.rejects(service.apply(plan.id), /changed since review/);
  assert.doesNotMatch(await readFile(path.join(root, 'src/App.tsx'), 'utf8'), /import ReframeContacts/);
  const fresh = await service.plan(request); await service.apply(fresh.id);
  const schema = path.join(root, 'reframe/features', request.feature.spec.id, 'feature.json');
  await writeFile(schema, 'later edits');
  await assert.rejects(service.undo(fresh.id), /newer edits/);
  await rm(path.join(root, 'reframe'), { recursive: true });
  await symlink(path.join(dir, 'outside'), path.join(root, 'reframe'));
  await assert.rejects(service.changeSource(await service.get(request.projectId), 'reframe/server.mjs'), /Symlink/);
}));

test('failed multi-file writes roll back and a prepared crash journal can be recovered after restart', () => temporary(async dir => {
  const { service, root, original, request } = await projectFixture(dir);
  const plan = await service.plan(request);
  const atomic = service.atomic.bind(service);
  let failOnce = true;
  service.atomic = async (file, ...args) => {
    if (failOnce && file.endsWith('Component.tsx')) { failOnce = false; throw new Error('Simulated disk failure'); }
    return atomic(file, ...args);
  };
  await assert.rejects(service.apply(plan.id), /Simulated disk failure/);
  assert.equal(await readFile(path.join(root, 'src/App.tsx'), 'utf8'), original);
  assert.equal((await service.history()).length, 0);
  const journal = path.join(dir, 'state/changes', `${plan.id}.json`);
  await writeFile(journal, JSON.stringify({ ...plan, state: 'prepared' }));
  await writeFile(path.join(root, 'src/App.tsx'), plan.after);
  await new Projects(path.join(dir, 'state')).undo(plan.id);
  assert.equal(await readFile(path.join(root, 'src/App.tsx'), 'utf8'), original);
  assert.equal((await service.history()).length, 0);
}));
