import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse } from '@babel/parser';
import { demoCatalog } from '../src/commerce-catalog.js';
import { Shop,validateCatalog,featureHandler } from '../server/features/commerce.mjs';
import { inspectFeature,buildFeature,validatedFeature } from '../server/features.js';
import { Projects } from '../server/projects.js';
const html='<section><h2>Captured phone</h2><a href="https://example.com/details">Learn more</a><a href="https://example.com/buy">Buy</a></section>';
async function bundle(){const report=inspectFeature(html);return buildFeature({html,name:'Phone cart',spec:{id:'rf_123456abcdef',commerce:demoCatalog('Captured phone'),actions:report.actions.map((a,i)=>({...a,operation:i?'product-options':'product-details'}))}});}
async function fixture(fn){const dir=await mkdtemp(path.join(tmpdir(),'reframe-commerce-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('product packages canonically export frontend, priced cart backend and source without trusting imported code',()=>fixture(async dir=>{
  const b=await bundle();assert.equal(Object.keys(b.files).length,7);await assert.rejects(buildFeature({html,name:'Private cart',spec:{...b.spec,authRequired:true}}),/account-scoped/);parse(b.files['Component.tsx'],{sourceType:'module',plugins:['typescript','jsx']});assert.ok(b.files['commerce.mjs'].includes('class Shop'));assert.doesNotMatch(b.files['Component.tsx'],/window\.location\.(assign|replace|href)/);assert.equal(b.spec.commerce.variants.length,12);
  const imported=structuredClone(b);imported.files['commerce.mjs']='untrusted()';assert.notEqual((await validatedFeature({html,feature:imported})).files['commerce.mjs'],'untrusted()');
  const root=path.join(dir,'app');await mkdir(path.join(root,'src'),{recursive:true});await writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{react:'19'},devDependencies:{vite:'6'}}));await writeFile(path.join(root,'src/App.tsx'),'export default function App(){return <main><p>Welcome</p></main>}');
  const service=new Projects(path.join(dir,'state')),project=await service.connect(root),target=await service.targets(project.id,'src/App.tsx');
  const plan=await service.plan({projectId:project.id,file:'src/App.tsx',pointId:target.points[0].id,hash:target.hash,html,name:'ReframePhone',feature:b});assert.ok(plan.changes.some(c=>c.file.endsWith('/commerce.mjs')));await service.apply(plan.id);assert.ok((await readFile(path.join(root,'reframe/server.mjs'),'utf8')).includes('spec.commerce'));assert.ok((await readFile(path.join(root,'reframe/features/'+b.spec.id+'/commerce.mjs'),'utf8')).includes('class Shop'));const installed=await import(pathToFileURL(path.join(root,'reframe/features/'+b.spec.id+'/commerce.mjs')).href);const api=createServer(installed.featureHandler(b.spec,path.join(root,'.reframe/cart.json')));await new Promise(r=>api.listen(0,'127.0.0.1',r));try{const r=await fetch(`http://127.0.0.1:${api.address().port}/api/reframe/${b.spec.id}`);assert.equal(r.status,200);assert.equal((await r.json()).variants.length,12);}finally{await new Promise(r=>api.close(r));}
  await service.undo(plan.id);assert.equal(await readFile(path.join(root,'src/App.tsx'),'utf8'),'export default function App(){return <main><p>Welcome</p></main>}');
}));
test('catalog and persisted schema validation reject duplicate options, forged prices and destructive implicit migrations',()=>fixture(async dir=>{
  const catalog=demoCatalog('Phone');for(const edit of [c=>c.variants[0].priceCents=1.2,c=>c.variants[1].options=c.variants[0].options,c=>c.product.secret='key',c=>c.variants[0].initialStock=-1]){const bad=structuredClone(catalog);edit(bad);assert.throws(()=>validateCatalog(bad));}
  const file=path.join(dir,'cart.json'),shop=new Shop(file,catalog);await shop.setItem({variantId:catalog.variants[0].id,quantity:2,version:0});const old=await readFile(file,'utf8');await assert.rejects(shop.reserve({version:0,requestId:randomUUID()}),/changed elsewhere/);assert.equal(await readFile(file,'utf8'),old);
  const changed=structuredClone(catalog);changed.variants[0].id='new-variant';await assert.rejects(new Shop(file,changed).get(),/migration/);assert.equal(await readFile(file,'utf8'),old);
}));
test('portable shop HTTP persists totals and orders, rejects tampering, races, foreign requests and unavailable stock',()=>fixture(async dir=>{
  const b=await bundle(),file=path.join(dir,'cart.json'),server=createServer(featureHandler(b.spec,file));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/api/reframe/${b.spec.id}`;
  const post=async body=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  try{
    const state=await(await fetch(url)).json(),v=state.variants[0];assert.equal(state.cart.quantity,0);
    assert.equal((await post({operation:'cart',variantId:v.id,quantity:1,version:0,priceCents:1})).status,400);
    assert.equal((await post({operation:'reserve',version:0,requestId:randomUUID()})).status,400);
    const sold=state.variants.find(v=>v.stock===0);assert.equal((await post({operation:'cart',variantId:sold.id,quantity:1,version:0})).status,409);
    const results=await Promise.all([post({operation:'cart',variantId:v.id,quantity:2,version:0}),post({operation:'cart',variantId:v.id,quantity:3,version:0})]);assert.equal(results.filter(r=>r.status===200).length,1);let cart=await(await fetch(url)).json();assert.equal(cart.cart.totalCents,v.priceCents*cart.cart.quantity);
    const body={operation:'reserve',version:cart.version,requestId:randomUUID()},order=await post(body);assert.equal(order.status,200);assert.equal(order.data.cart.quantity,0);assert.equal((await post(body)).data.order.id,order.data.order.id);assert.equal(JSON.parse(await readFile(file,'utf8')).orders.length,1);assert.equal(order.data.lastOrder.totalCents,cart.cart.totalCents);
    assert.equal((await fetch(url,{headers:{Origin:'https://foreign.invalid'}})).status,403);assert.equal((await fetch(url,{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    assert.equal((await fetch(url,{method:'POST',body:'{',headers:{'Content-Type':'application/json'}})).status,400);
    const restarted=new Shop(file,b.spec.commerce);assert.equal((await restarted.get()).lastOrder.id,order.data.order.id);
  }finally{await new Promise(r=>server.close(r));}
}));
