import {chromium,request as playwrightRequest} from 'playwright';
import {createServer} from 'node:http';

export const testTargets = [
  {id:'haven',name:'Haven · integrated demo',url:'http://127.0.0.1:5175/'},
  {id:'fieldnotes',name:'Fieldnotes · product demo',url:'http://127.0.0.1:5174/'},
];
export function validateTestPlan(input,targets=testTargets){
  const target=targets.find(t=>t.id===input?.target);
  if(!target||!['desktop','mobile'].includes(input.viewport)||typeof input.allowWrites!=='boolean'||!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>12)throw new Error('Choose a demo, viewport and 1–12 test steps.');
  const steps=input.steps.map(step=>{
    if(!step||!['visible','click','fill','press'].includes(step.action)||!['label','text','button','placeholder'].includes(step.by)||typeof step.name!=='string'||!step.name.trim()||step.name.length>200||typeof step.value!=='string'||step.value.length>500||step.action==='press'&&!['Enter','Tab','Escape','Space','ArrowDown','ArrowUp'].includes(step.value))throw new Error('Use a supported action, exact visible label and a value under 500 characters.');
    return {action:step.action,by:step.by,name:step.name.trim(),value:step.value};
  });
  return {target,viewport:input.viewport,allowWrites:input.allowWrites,steps};
}
export class BrowserTests {
  busy=false;
  async run(input,{signal,onEvent=()=>{},targets=testTargets}={}){
    const plan=validateTestPlan(input,targets);
    if(this.busy)throw new Error('Another browser test is running. Wait or cancel it first.');
    signal?.throwIfAborted();this.busy=true;
    let browser,context,page,timer,proxy,http;
    const result={target:plan.target,viewport:plan.viewport,startedAt:new Date().toISOString(),status:'failed',steps:[],errors:[],warnings:[],blocked:0,screenshot:null};
    let cancelled=false,timedOut=false;
    const stop=()=>{cancelled=true;void browser?.close().catch(()=>{});};
    const send=value=>onEvent(value);
    try{
      signal?.addEventListener('abort',stop,{once:true});
      timer=setTimeout(()=>{timedOut=true;stop();},60000);
      send({type:'progress',message:'Sentry is opening an isolated Chromium browser.'});
      // Native browser traffic is denied; routed HTTP may reach only this selected demo.
      proxy=createServer((_req,res)=>{res.writeHead(403);res.end();});proxy.on('connect',(_req,socket)=>socket.destroy());
      await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
      const options={headless:true,chromiumSandbox:true,proxy:{server:`http://127.0.0.1:${proxy.address().port}`},args:['--proxy-bypass-list=<-loopback>','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--disable-quic']};
      try{browser=await chromium.launch({...options,channel:'chrome'});}catch{browser=await chromium.launch(options);}
      if(cancelled)throw new Error('Test stopped.');
      context=await browser.newContext({viewport:plan.viewport==='mobile'?{width:390,height:844}:{width:1280,height:900},serviceWorkers:'block',acceptDownloads:false,permissions:[]});
      http=await playwrightRequest.newContext({ignoreHTTPSErrors:false});
      await context.routeWebSocket('**/*',socket=>socket.close());
      let requests=0;
      await context.route('**/*',async route=>{
        try{
          const request=route.request();
          if(++requests>600||new URL(request.url()).origin!==new URL(plan.target.url).origin||!plan.allowWrites&&!['GET','HEAD'].includes(request.method())){result.blocked++;await route.abort();return;}
          const response=await http.fetch(request.url(),{method:request.method(),headers:await request.allHeaders(),data:request.postDataBuffer()||undefined,maxRedirects:0,timeout:10000});
          try{await route.fulfill({response});}finally{await response.dispose();}
        }catch{await route.abort().catch(()=>{});}
      });
      page=await context.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(15000);
      context.on('page',popup=>{if(popup!==page)void popup.close();});
      page.on('dialog',dialog=>void dialog.dismiss());page.on('download',download=>void download.cancel());
      const issue=(list,text)=>{if(list.length<15)list.push(text.slice(0,400));};
      page.on('pageerror',error=>issue(result.errors,error.message));
      page.on('console',msg=>{if(msg.type()==='error')issue(result.errors,msg.text());if(msg.type()==='warning')issue(result.warnings,msg.text());});
      page.on('response',response=>{if(response.status()>=400)issue(result.errors,`HTTP ${response.status()} · ${new URL(response.url()).pathname}`);});
      const response=await page.goto(plan.target.url,{waitUntil:'domcontentloaded'});
      if(!response?.ok())throw new Error('Demo did not load successfully. Start its development server.');
      for(const [index,step]of plan.steps.entries()){
        if(cancelled)throw new Error('Test stopped.');
        send({type:'step',index,status:'running'});
        const locator=step.by==='button'?page.getByRole('button',{name:step.name,exact:true}):step.by==='label'?page.getByLabel(step.name,{exact:true}):step.by==='placeholder'?page.getByPlaceholder(step.name,{exact:true}):page.getByText(step.name,{exact:true});
        try{
          if(step.action==='visible'){await locator.waitFor({state:'visible'});await locator.scrollIntoViewIfNeeded();}
          else if(step.action==='fill')await locator.fill(step.value);
          else if(step.action==='press')await locator.press(step.value);
          else await locator.click();
          result.steps.push({index,status:'passed'});send({type:'step',index,status:'passed'});
        }catch{result.steps.push({index,status:'failed',error:'Element missing, ambiguous, or not actionable. Check its exact label and expected state.'});send({type:'step',...result.steps.at(-1)});break;}
      }
      if(cancelled)throw new Error('Test stopped.');
      result.status=result.steps.length===plan.steps.length&&result.steps.every(s=>s.status==='passed')?(result.errors.length?'passed-with-issues':'passed'):'failed';
    }catch(error){result.errors.push(cancelled?(timedOut?'Test exceeded 60 seconds.':'Test cancelled.'):error.message);result.status=cancelled&&!timedOut?'cancelled':'failed';}
    finally{
      if(!cancelled&&page&&!page.isClosed())try{result.screenshot='data:image/png;base64,'+(await page.screenshot({timeout:3000})).toString('base64');}catch{}
      clearTimeout(timer);signal?.removeEventListener('abort',stop);
      await browser?.close().catch(()=>{});await http?.dispose().catch(()=>{});proxy?.close();this.busy=false;
    }
    result.finishedAt=new Date().toISOString();
    result.limitation='Only these explicit assertions ran, in a fresh browser session. External requests and popups are blocked. Demo backend writes, if enabled, are real and are not rolled back.';
    return result;
  }
}
