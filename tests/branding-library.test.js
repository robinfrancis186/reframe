import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from '@babel/parser';
import ts from 'typescript';
import { detectBranding, detectTokens, cssColor } from '../server/branding.js';
import { librarySource } from '../server/library.js';
import { catalog } from '../src/library/catalog.js';
import { themeStyle } from '../src/branding.js';
import { Projects } from '../server/projects.js';
const theme = { name:'Test', primary:'#176e9b', background:'#ffffff', text:'#112233', font:'system-ui, sans-serif', radius:12, brandName:'Test brand', tagline:'Made for you' };
test('branding resolves aliases, modern colors, font and radius; separates light and dark', () => {
  assert.equal(cssColor('#abc'), '#aabbcc');
  assert.equal(cssColor('rgb(255 0 0)'), '#ff0000');
  assert.equal(cssColor('hsl(120 100% 25%)'), '#008000');
  assert.equal(cssColor('220 100% 50%'), '#0055ff');
  assert.equal(cssColor('oklch(1 0 0)'), '#ffffff');
  assert.equal(cssColor('oklch(0 0 0)'), '#000000');
  assert.equal(cssColor('rgba(10,20,30,.5)'), null);
  const files = [{path:'theme.css',text:':root{--brand:#abc;--primary:var(--brand);--background:#fff;--foreground:rgb(20 30 40);--radius:.75rem;--font-sans:"Space Grotesk", sans-serif} .dark{--primary:#765432;--background:#111} @media(prefers-color-scheme:dark){:root{--foreground:#eee}} @media(max-width:500px){:root{--primary:#ff0000}}'}];
  const light = detectTokens(files), dark = detectTokens(files,'dark');
  assert.deepEqual(light.theme,{primary:'#aabbcc',background:'#ffffff',text:'#141e28',radius:12,font:'"Space Grotesk", sans-serif'});
  assert.equal(dark.theme.primary,'#765432'); assert.equal(dark.theme.text,'#eeeeee');
  assert.ok(light.evidence.every(e => e.file === 'theme.css'));
  assert.deepEqual(detectTokens([{path:'cycle.css',text:':root{--primary:var(--a);--a:var(--primary)}'}]).theme,{});
  assert.throws(() => themeStyle({...theme,font:'sans-serif; color:red'}), /Invalid/);
  assert.throws(() => themeStyle({...theme,brandName:0}), /Invalid/);
  assert.equal(themeStyle({...theme,primary:'#ffff00'})['--rf-on-primary'],'#000000');
});
test('command palette exports self-contained navigation state rather than example command handlers', async()=>{
  for(const typed of [true,false]){
    const result=await librarySource('be-command-palette','ReframeCommands',theme,typed);
    assert.equal(result.minimal.stateFields,3);assert.equal(result.minimal.actionCallbacks,0);assert.equal(result.minimal.addedDependencies,0);
    assert.ok(!result.code.includes('Connect app navigation in the exported source.'));
    assert.match(result.code,/onKeyDownCapture/);assert.match(result.code,/event\.key\s*===\s*['"]Escape['"]/);assert.match(result.code,/event.preventDefault/);assert.match(result.code,/element.innerText/);
    assert.ok(!result.code.includes("['Open project','Browse components','Project branding']"));
    parse(result.imports.join('\n')+'\n'+result.code,{sourceType:'module',plugins:['jsx',...(typed?['typescript']:[])]});
  }
});
test('branding scans only bounded local public theme inputs and reports metadata evidence', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'reframe-brand-'));
  try {
    const root = path.join(dir,'app'); await mkdir(root); await mkdir(path.join(root,'src'));
    await writeFile(path.join(root,'index.html'),'<title>Haven · Workspace</title><meta name="description" content="A considered workspace">');
    await writeFile(path.join(root,'src','style.css'),':root{--primary:#176e9b;background:#f2f5f7;color:#22394a;font-family:system-ui,sans-serif}');
    await writeFile(path.join(root,'.env'), 'PRIVATE_KEY=do-not-read');
    await writeFile(path.join(dir,'outside.css'),':root{--primary:#ff0000}');
    await symlink(path.join(dir,'outside.css'),path.join(root,'outside.css'));
    const result = await detectBranding(root);
    assert.equal(result.theme.primary,'#176e9b'); assert.equal(result.theme.background,'#f2f5f7');
    assert.equal(result.theme.brandName,'Haven'); assert.equal(result.theme.tagline,'A considered workspace');
    assert.equal(result.filesScanned,2); assert.ok(!JSON.stringify(result).includes('PRIVATE_KEY'));
    await assert.rejects(detectBranding(root,'invalid'), /light or dark/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('every original exports only its own runnable logic, with collision-safe imports and valid JSX/TSX', async () => {
  for (const entry of catalog) {
    for (const typed of [false,true]) {
      const generated = await librarySource(entry.id,'ReframeExample',theme,typed);
      const source = generated.imports.join('\n') + '\n' + generated.code;
      parse(source,{sourceType:'module',plugins:['jsx',...(typed?['typescript']:[])]});
      const result = ts.transpileModule(source,{fileName:typed?'Component.tsx':'Component.jsx',reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
      assert.equal(result.diagnostics.length,0,entry.id);
      assert.equal(generated.minimal.addedDependencies,0);
      assert.equal((source.match(/function ReframeExampleView/g)||[]).length,1);
      assert.equal(source.includes('console.info'),false);
      assert.ok(source.length < 14000);
    }
  }
  await assert.rejects(librarySource('unknown','ReframeExample',theme),/Choose/);
  await assert.rejects(librarySource('tabs','bad-name',theme),/capital/);
  await assert.rejects(librarySource('tabs','ReframeExample',{...theme,logo:'javascript:alert(1)'}),/Invalid/);
});
test('original library integration retains behavior, avoids handler stubs, applies branding, and undoes safely', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'reframe-library-'));
  try {
    const root = path.join(dir,'app'); await mkdir(root);
    const original='import { useState } from "react"; export default function App(){const [x]=useState(1);return <main><h1>Existing {x}</h1></main>}';
    await writeFile(path.join(root,'App.tsx'),original);
    await writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{react:'19'}}));
    await writeFile(path.join(root,'style.css'),':root{--primary:#176e9b}');
    const service = new Projects(path.join(dir,'state')), project = await service.connect(root), target = await service.targets(project.id,'App.tsx');
    const body = {projectId:project.id,file:'App.tsx',pointId:target.points[0].id,hash:target.hash,html:'<section><h2>Library tabs</h2></section>',libraryId:'tabs',theme,name:'ReframeWorkspaceTabs'};
    const fit = await service.fit(body); assert.equal(fit.decision.status,'review'); assert.equal(fit.themeTokens.primary,theme.primary); assert.equal(fit.categories.find(c=>c.name==='Action wiring').score,100);
    const plan = await service.plan(body);
    assert.match(plan.after,/role="tablist"/); assert.match(plan.after,/\.useState\(0\)/); assert.match(plan.after,/ArrowRight/); assert.ok(!plan.after.includes('console.info'));
    parse(plan.after,{sourceType:'module',plugins:['jsx','typescript']});
    assert.equal(await readFile(path.join(root,'App.tsx'),'utf8'),original);
    await service.apply(plan.id); assert.equal(await readFile(path.join(root,'App.tsx'),'utf8'),plan.after);
    await service.undo(plan.id); assert.equal(await readFile(path.join(root,'App.tsx'),'utf8'),original);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('all exported originals typecheck together in a strict React TypeScript destination', async () => {
  const dir = await mkdtemp(path.join(process.cwd(),'.reframe-library-check-'));
  try {
    const file = path.join(dir,'All.tsx');
    const sources = await Promise.all(catalog.map(async (entry,index) => { const generated = await librarySource(entry.id,'ReframeOriginal' + index,theme,true); return generated.imports.join('\n') + '\n' + generated.code; }));
    await writeFile(file,sources.join('\n'));
    const program = ts.createProgram([file],{strict:true,noEmit:true,skipLibCheck:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,esModuleInterop:true});
    const errors = ts.getPreEmitDiagnostics(program);
    assert.equal(errors.length,0,ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>"\n"}));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
