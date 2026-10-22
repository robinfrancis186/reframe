import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Projects} from '../server/projects.js';
import {catalog,libraryItem} from '../src/library/catalog.js';
import {rankWithOpenAI} from '../server/recommend-ai.js';
import {recommendComponents,screenSignals} from '../server/recommend.js';
import {structuredDecision} from '../server/openai.js';
import {assist} from '../server/agent-help.js';
import {helpActions,contextualAgent} from '../src/agent-help.js';
import {sections,sectionFor} from '../src/navigation.js';
import {themes} from '../src/model.ts';

const apiKey='sk-fixture-not-a-live-credential';
const reply=value=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]})});
const choice={key:'original:be-availability-scheduler',score:91,reason:'People need a small coordination tool in this workspace.',missingFeature:'Agree on an available time.'};
const decision={purpose:'A shared workspace for coordinating a small team.',existingUI:['A workspace introduction'],missingFeatures:['Shared time coordination'],questions:[],choices:[choice]};

test('OpenAI reads purpose and UI signals, preserves eligible identities, and feeds real fit → review → apply → undo',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'reframe-ai-project-'));
  try{
    const root=path.join(dir,'app');await mkdir(root);
    const original='export default function App(){return <main><h1>Team workspace</h1><p>sk-embedded-private-secret123</p></main>}';
    await writeFile(path.join(root,'App.tsx'),original);await writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{react:'19'},devDependencies:{vite:'6'}}));
    await writeFile(path.join(root,'.env'),'PRIVATE_SERVER_KEY=not-sent');
    const service=new Projects(path.join(dir,'state')),project=await service.connect(root);
    let request;
    const result=await service.recommendations({id:project.id,provider:'openai',purpose:'Help a small team coordinate',goal:'Agree on a time without endless messages',apiKey}, {fetcher:async(url,options)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,`Bearer ${apiKey}`);request=JSON.parse(options.body);
      assert.equal(request.store,false);assert.equal(request.text.format.strict,true);
      assert.ok(!options.body.includes(apiKey));assert.ok(!options.body.includes('sk-embedded-private-secret123'));assert.ok(!options.body.includes('PRIVATE_SERVER_KEY'));
      assert.ok(!options.body.includes('export default'));assert.match(request.input,/Team workspace/);
      assert.ok(JSON.parse(request.input).candidates.some(c=>c.key===choice.key));return reply(decision);
    }});
    assert.equal(result.provider,'openai');assert.ok(result.model);assert.deepEqual(result.missingFeatures,decision.missingFeatures);
    assert.equal(result.recommendations[0].libraryId,'be-availability-scheduler');assert.equal(result.recommendations[0].score,91);
    assert.ok(result.recommendations[0].reasons.includes(choice.reason));assert.equal(await readFile(path.join(root,'App.tsx'),'utf8'),original);
    const component=libraryItem(catalog.find(c=>c.id===result.recommendations[0].libraryId)),target=await service.targets(project.id,'App.tsx');
    const body={projectId:project.id,file:'App.tsx',pointId:target.points[0].id,hash:target.hash,libraryId:component.libraryId,html:component.html,name:'ReframeSuggestedTeamTime',theme:themes[0]};
    const fit=await service.fit(body);assert.equal(fit.decision.status,'review');
    const plan=await service.plan(body);assert.equal(plan.minimal.addedDependencies,0);assert.ok(plan.analysis.evidenceId);assert.match(plan.after,/type="date"/);
    await service.apply(plan.id);assert.equal(await readFile(path.join(root,'App.tsx'),'utf8'),plan.after);
    await service.undo(plan.id);assert.equal(await readFile(path.join(root,'App.tsx'),'utf8'),original);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('AI cannot invent components, strip service requirements, duplicate choices or turn failure into local results',async()=>{
  const screens=[{path:'App.tsx',framework:'react',text:'export default()=> <main>Welcome</main>'}];screens[0].signals=screenSignals(screens[0].text,'react');
  const branding={theme:{}},report=recommendComponents({screens,branding,vite:true,semantic:true});
  const args={screens,branding,clipboard:[],purpose:'',goal:'',apiKey};
  for(const changes of [{choices:[{...choice,key:'original:not-real'}]},{choices:[choice,choice]},{choices:[{...choice,score:101}]},{choices:Array(7).fill(choice)},{purpose:'a'.repeat(1201)}])await assert.rejects(rankWithOpenAI(report,{...args,fetcher:async()=>reply({...decision,...changes})}),/invalid component/);
  const serviceCandidate=report.recommendations.find(c=>c.kind==='agent');assert.ok(serviceCandidate.requirements.length);
  const selected=await rankWithOpenAI(report,{...args,fetcher:async()=>reply({...decision,choices:[{...choice,key:'original:'+serviceCandidate.libraryId}]})});
  assert.deepEqual(selected.recommendations[0].requirements,serviceCandidate.requirements);assert.equal(selected.recommendations[0].readiness,'Connect services');
  await assert.rejects(rankWithOpenAI(report,{...args,fetcher:async()=>({ok:false,status:429})}),/HTTP 429.*no automatic fallback/);
  await assert.rejects(rankWithOpenAI(report,{...args,fetcher:async()=>({ok:true,json:async()=>({status:'incomplete'})})}),/did not complete/);
  let calls=0;
  const blocked=recommendComponents({screens,branding,next:true,semantic:true});assert.equal(blocked.recommendations.length,0);
  const empty=await rankWithOpenAI(blocked,{...args,fetcher:async()=>{calls++;return reply(decision);}});assert.equal(calls,0);assert.equal(empty.model,null);
});

test('OpenAI transport bounds concurrent requests and provider response sizes',async()=>{
  let release;
  const gate=new Promise(resolve=>release=resolve),options={name:'fixture',schema:{type:'object'},instructions:'Fixture',input:{},apiKey,fetcher:async()=>{await gate;return reply({ok:true});}};
  const first=structuredDecision(options),second=structuredDecision(options);
  try{await assert.rejects(structuredDecision(options),error=>error.status===429);}finally{release();}
  assert.deepEqual(await Promise.all([first,second]),[{ok:true},{ok:true}]);
  await assert.rejects(structuredDecision({...options,fetcher:async()=>new Response('a'.repeat(1000001))}),/safe size limit/);
  await assert.rejects(structuredDecision({...options,apiKey:'bad\nkey'}),/Invalid OpenAI key/);
});

test('specialists provide real local guidance and constrained OpenAI replies, without executing navigation',async()=>{
  for(const [agentId]of Object.entries({scout:1,atlas:1,forge:1,hue:1,sentry:1,relay:1})){
    const result=await assist({agentId,page:'Projects',question:'What should I do?',provider:'local'});
    assert.ok(result.answer.length>80);assert.ok(helpActions[result.action]);assert.equal(result.model,null);
  }
  const body={agentId:'atlas',page:'Projects',provider:'openai',question:'What is useful next?',itemName:'Team notes',html:'<h1>Notes</h1><script>exfiltrate()</script>',apiKey};
  const result=await assist(body,{fetcher:async(_url,options)=>{assert.ok(!options.body.includes('exfiltrate'));assert.ok(!options.body.includes(apiKey));return reply({answer:'Review project suggestions for coordination tools.',action:'recommend'});}});
  assert.equal(result.action,'recommend');assert.ok(result.model);
  await assert.rejects(assist(body,{fetcher:async()=>reply({answer:'Execute arbitrary code',action:'https://evil.invalid'})}),/invalid guidance/);
  await assert.rejects(assist({...body,agentId:'unknown'}),/specialist/);
  await assert.rejects(assist({...body,question:'a'.repeat(1501)}),/1500/);
});

test('five coherent sections retain every feature page and Connections and every helper destination',()=>{
  assert.equal(sections.length,5);
  const pages=sections.flatMap(section=>section.pages.map(([id])=>id));assert.equal(pages.length,12);assert.equal(new Set(pages).size,12);
  for(const page of pages){assert.ok(sectionFor(page).pages.some(([id])=>id===page));assert.ok(contextualAgent(page));}
  for(const action of Object.values(helpActions))if(action.page)assert.ok(pages.includes(action.page));
});
