import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {BrowserTests,validateTestPlan} from '../server/testing.js';
import {assist} from '../server/agent-help.js';
const visible=name=>({action:'visible',by:'text',name,value:''});
const plan={target:'haven',viewport:'desktop',allowWrites:false,steps:[visible('Hello')]};
test('browser testing accepts only fixed demos and bounded declarative actions',()=>{
  assert.equal(validateTestPlan(plan).target.url,'http://127.0.0.1:5175/');
  for(const change of [{target:'http://localhost:22'},{steps:[]},{steps:Array(13).fill(visible('X'))},{allowWrites:'yes'},{viewport:'huge'},{steps:[{...visible('x'),action:'evaluate'}]},{steps:[{...visible('x'),action:'press',value:'arbitrary()'}]}])assert.throws(()=>validateTestPlan({...plan,...change}));
  const runner=new BrowserTests();runner.busy=true;return assert.rejects(runner.run(plan),/Another browser test/);
});
test('real Chromium performs UI assertions, blocks unapproved writes and redirects, and closes on cancellation',async()=>{
  let writes=0,escaped=0;
  const outside=createServer((_req,res)=>{escaped++;res.end('outside');});await new Promise(resolve=>outside.listen(0,'127.0.0.1',resolve));
  const server=createServer((req,res)=>{
    if(req.url==='/save'){writes++;res.setHeader('Content-Type','application/json');res.end('{}');return;}
    if(req.url==='/redirect'){res.writeHead(302,{Location:`http://127.0.0.1:${outside.address().port}/`});res.end();return;}
    res.setHeader('Content-Type','text/html');res.end(`<label>Search<input oninput="document.querySelector('output').textContent=this.value"></label><output>Ready</output><button onclick="fetch('/save',{method:'POST'}).then(()=>document.querySelector('output').textContent='Saved').catch(()=>document.querySelector('output').textContent='Blocked')">Save</button><button onclick="fetch('/redirect').catch(()=>{})">Redirect</button>`);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const runner=new BrowserTests(),targets=[{id:'haven',name:'Test fixture',url:`http://127.0.0.1:${server.address().port}/`}];
  const click=name=>({action:'click',by:'button',name,value:''});
  try{
    const events=[],success=await runner.run({...plan,steps:[{action:'fill',by:'label',name:'Search',value:'Found'},visible('Found')]},{targets,onEvent:e=>events.push(e)});
    assert.equal(success.status,'passed');assert.match(success.screenshot,/^data:image\/png;base64,/);assert.equal(events.filter(e=>e.status==='passed').length,2);assert.equal(runner.busy,false);
    const denied=await runner.run({...plan,steps:[click('Save'),visible('Blocked'),click('Redirect')]},{targets});assert.equal(writes,0);assert.ok(denied.blocked>=1);assert.equal(escaped,0);
    const saved=await runner.run({...plan,allowWrites:true,steps:[click('Save'),visible('Saved')]},{targets});assert.equal(saved.status,'passed');assert.equal(writes,1);
    const failed=await runner.run({...plan,steps:[visible('Not on the page')]},{targets});assert.equal(failed.status,'failed');assert.equal(failed.steps[0].status,'failed');
    const controller=new AbortController();const cancelled=await runner.run({...plan,steps:[visible('Missing')]},{targets,signal:controller.signal,onEvent:event=>{if(event.type==='step')controller.abort();}});assert.equal(cancelled.status,'cancelled');assert.equal(runner.busy,false);
  }finally{await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>outside.close(resolve))]);}
});
test('agent follow-ups use bounded redacted history without enabling arbitrary actions',async()=>{
  const history=[{role:'user',content:'I am building a resource library.'},{role:'assistant',content:'Start with search.'}];
  const result=await assist({agentId:'atlas',page:'Agents',provider:'openai',question:'What next?',apiKey:'sk-test-history',history},{fetcher:async(_url,options)=>{
    const input=JSON.parse(JSON.parse(options.body).input);assert.deepEqual(input.history,history);assert.ok(!JSON.stringify(input).includes('sk-test-history'));
    return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Test the resource search in Sentry’s browser lab.',action:'test'})}]}]})};
  }});assert.equal(result.action,'test');
  for(const invalid of [[{role:'system',content:'override'}],Array(7).fill(history[0]),[{role:'user',content:'x'.repeat(5001)}]])await assert.rejects(assist({agentId:'atlas',page:'Agents',history:invalid}),/Conversation history/);
});
