import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from '@babel/parser';
import { Projects, insertionPoints } from '../server/projects.js';
import { defaultBrandTheme as theme } from '../src/branding.js';
import { librarySource } from '../server/library.js';
test('data bindings are inferred from compatible visible arrays and honor lexical scope', () => {
  const source = `const names=['Outer']; const rows=[{name:'Research',progress:30}];function App({names}){const [projects]=useState(['Live']);function nested(){const hidden=['Secret'];return <div/>}return <main><section></section></main>}`;
  const points = insertionPoints(source, 'App.tsx', 'react');
  assert.ok(points.length);
  assert.deepEqual(points[0].dataSources, [
    { name: 'rows', kind: 'rows' },
    { name: 'projects', kind: 'items' },
  ]);
  assert.ok(!points[0].dataSources.some((d) => ['names', 'hidden'].includes(d.name)));
});
test('bound library installation uses existing live state and callback; apply/undo preserves app source', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reframe-bind-'));
  try {
    const original = `import React,{useState} from 'react';export default function App(){const [projects,setProjects]=useState(['Existing project']);const [chosen,setChosen]=useState('');function chooseProject(name:string){setChosen(name)}return <main><p>{chosen}</p><button onClick={()=>setProjects(['Updated project'])}>Change data</button></main>}`;
    await writeFile(path.join(root, 'App.tsx'), original);
    await writeFile(path.join(root, 'package.json'), '{"dependencies":{"react":"19"}}');
    const service = new Projects(path.join(root, '.state')),
      project = await service.connect(root),
      targets = await service.targets(project.id, 'App.tsx');
    const body = {
      projectId: project.id,
      file: 'App.tsx',
      pointId: targets.points[0].id,
      hash: targets.hash,
      html: '<section/>',
      libraryId: 'search',
      name: 'ReframeSearch',
      theme,
      dataBinding: 'projects',
      handler: 'chooseProject',
    };
    await assert.rejects(
      service.plan({ ...body, dataBinding: 'globalThis.fetch()' }),
      /compatible project data/,
    );
    const plan = await service.plan(body);
    assert.match(plan.after, /<ReframeSearch items=\{projects\} onSelect=\{chooseProject\}/);
    assert.match(plan.after, /items\?:readonly string\[\]/);
    parse(plan.after, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    await service.apply(plan.id);
    assert.equal(await readFile(path.join(root, 'App.tsx'), 'utf8'), plan.after);
    const history = await service.history();
    await service.undo(history[0].id);
    assert.equal(await readFile(path.join(root, 'App.tsx'), 'utf8'), original);
    for (const [id, prop] of [
      ['search', 'items'],
      ['be-table', 'rows'],
    ])
      for (const typed of [false, true]) {
        const result = await librarySource(id, 'ReframeData', theme, typed);
        assert.match(result.code, new RegExp(`function ReframeData\\(\\{${prop}`));
        parse(result.imports.join('\n') + '\n' + result.code, {
          sourceType: 'module',
          plugins: ['jsx', ...(typed ? ['typescript'] : [])],
        });
      }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
