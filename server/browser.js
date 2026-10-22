import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { referenceResource, referenceUrl } from './browser-network.js';
import { cleanHtml, extract } from './capture.js';
import {readRendered,replicaItem} from './replica.js';

async function settle(entry) {
  if(entry.dialog)return;
  await Promise.race([entry.page.waitForLoadState('load',{timeout:10000}).catch(()=>{}),entry.dialogSignal]);
  if(entry.dialog)return;
  await entry.page.waitForFunction(()=>[...document.querySelectorAll('link[rel~=stylesheet]')].every(link=>link.disabled||link.sheet)&&document.fonts.status==='loaded',null,{timeout:5000}).catch(()=>{});
  for(let n=0;n<10&&(entry.pending||entry.queue.length);n++)await new Promise(resolve=>setTimeout(resolve,150));
  await entry.page.waitForTimeout(120);
}
async function loadWholePage(entry) {
  const page=entry.page,position=await page.evaluate(()=>({x:scrollX,y:scrollY}));let limited=false;
  try{
    for(let n=0;n<5;n++){const more=page.getByRole('button',{name:/^(?:show more(?: photos)?|load more)$/i}).filter({visible:true}).first();if(!await more.count()||await more.isDisabled()||await more.evaluate(el=>!!el.closest('form')))break;await more.click();await page.waitForTimeout(150);if(n===4)limited=true;}
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(150);
    for(let n=0;n<40;n++){
      if(entry.dialog)break;
      const state=await page.evaluate(()=>({y:scrollY,height:innerHeight,total:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0)}));
      if(state.y+state.height>=state.total-2)break;
      if(state.y>20000||n===39){limited=true;break;}
      await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),state.y+Math.round(state.height*.8));
      await page.waitForTimeout(150);
    }
    await settle(entry);
  }finally{if(!entry.dialog)await page.evaluate(p=>window.scrollTo({left:p.x,top:p.y,behavior:'instant'}),position).catch(()=>{});}
  return limited;
}

export async function scrapePage(page) {
  return page.evaluate(()=>{
    const text=(document.body?.innerText||'').trim(),headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(el=>({level:Number(el.tagName[1]),text:el.textContent.trim()})).filter(h=>h.text);
    const links=[...document.querySelectorAll('a[href]')].filter(el=>/^https?:/.test(el.href)).map(el=>({text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,300),url:el.href}));
    const images=[...document.images].filter(el=>/^https?:/.test(el.currentSrc||el.src)).map(el=>({alt:el.alt,url:el.currentSrc||el.src,width:el.naturalWidth,height:el.naturalHeight,loaded:el.complete&&el.naturalWidth>0}));
    const controls=[...document.querySelectorAll('button,input,textarea,select,[role=button]')].map(el=>({tag:el.tagName.toLowerCase(),type:el.getAttribute('type')||'',label:(el.labels?.[0]?.innerText||el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.innerText||'').trim().slice(0,300),disabled:!!el.disabled,options:el.tagName==='SELECT'?[...el.options].slice(0,100).map(option=>({label:option.text,value:option.value})):undefined}));
    return {url:location.href,title:document.title,text:text.slice(0,100000),headings:headings.slice(0,200),links:links.slice(0,500),images:images.slice(0,300),controls:controls.slice(0,300),counts:{text:text.length,headings:headings.length,links:links.length,images:images.length,controls:controls.length},truncated:text.length>100000||headings.length>200||links.length>500||images.length>300||controls.length>300};
  });
}

export class ReferenceBrowser {
  constructor({ resource = referenceResource } = {}) {
    this.resource = resource;
    this.tabs = new Map();
    this.timer = setInterval(() => {
      for (const [id, entry] of this.tabs) if (Date.now() - entry.used > 20 * 60_000 && !entry.busy) void this.closeTab(id);
    }, 60_000);
    this.timer.unref();
  }
  async start() {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      // Deny all Chromium-native network traffic, including requests not covered by routing.
      this.denyProxy = createServer((_req, res) => { res.writeHead(403); res.end(); });
      this.denyProxy.on('connect', (_req, socket) => socket.destroy());
      await new Promise(resolve => this.denyProxy.listen(0, '127.0.0.1', resolve));
      const options = { headless: true, chromiumSandbox: true, proxy: { server: `http://127.0.0.1:${this.denyProxy.address().port}` }, args: ['--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-quic'] };
      try { this.browser = await chromium.launch({ ...options, channel: 'chrome' }); }
      catch {
        try { this.browser = await chromium.launch(options); }
        catch { this.denyProxy.close(); this.starting = null; throw new Error('Install Google Chrome, or run npx playwright install chromium, then retry.'); }
      }
      this.browser.on('disconnected', () => { this.tabs.clear(); this.starting = null; this.denyProxy?.close(); });
    })();
    return this.starting;
  }
  list() {
    return [...this.tabs].map(([id, t]) => ({ id, title: t.title || 'New tab', url: t.page.url(), mobile: t.mobile }));
  }
  async create() {
    await this.start();
    if (this.tabs.size >= 4) throw new Error('Up to four reference tabs can be open. Close one first.');
    const id = randomUUID();
    // Reserve before awaiting creation so concurrent requests cannot exceed the tab limit.
    const entry = { used: Date.now(), busy: true, title: 'New tab', mobile: false, blocked: 0, requests: 0, pending: 0, queue:[], bytes: 0, selection: null, images:new Set(),issues:[],writeOrigin:null,popup:null,page: { url: () => 'about:blank' } };
    this.tabs.set(id, entry);
    try {
      entry.context = await this.browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', acceptDownloads: false, permissions: [], javaScriptEnabled: true });
      await entry.context.routeWebSocket('**/*', socket => socket.close());
      await entry.context.route('**/*', async route => {
        const request = route.request();
        let fetching = false;
        try {
          if(request.isNavigationRequest()){
            let frame;try{frame=request.frame();}catch{}
            if(!frame||frame.page()!==entry.page){entry.popup=referenceUrl(request.url()).href;await route.abort();return;}
          }
          if(request.isNavigationRequest()&&request.frame()===entry.page.mainFrame()){
            entry.requests=0;entry.bytes=0;entry.blocked=0;entry.issues=[];entry.images.clear();entry.scanLimited=false;entry.popup=null;
          }
          const method=request.method();
          if(!['GET','HEAD','OPTIONS'].includes(method)&&new URL(request.url()).origin!==entry.writeOrigin)throw new Error('Submission blocked. Enable submissions for this origin, then retry the action.');
          if (++entry.requests > 1200 || entry.bytes > 64_000_000) throw new Error('Page resource budget reached (1,200 requests / 64 MB).');
          if(entry.pending>=16)await new Promise(resolve=>entry.queue.push(resolve));
          entry.pending++; fetching = true;
          const response = await this.resource(request.url(), await request.allHeaders(),{method,body:request.postDataBuffer()});
          entry.bytes += response.body.length;
          if(response.status>=400)entry.issues.push({type:request.resourceType(),url:request.url().split('?')[0],reason:`HTTP ${response.status}`});
          if(response.status===200&&/^image\/(?:png|jpeg|webp|gif|avif)(?:;|$)/i.test(response.headers['content-type']||''))entry.images.add(request.url());
          await route.fulfill(response);
        } catch(error) { entry.blocked++; entry.issues.push({type:request.resourceType(),url:request.url().split('?')[0],reason:error.message.slice(0,200)});await route.abort().catch(() => {}); }
        finally { if (fetching) {entry.pending--;entry.queue.shift()?.();} if(entry.issues.length>100)entry.issues.splice(0,entry.issues.length-100); }
      });
      entry.page = await entry.context.newPage();
      entry.page.setDefaultTimeout(10000);
      entry.page.setDefaultNavigationTimeout(25000);
      entry.page.on('popup', popup => {if(/^https?:/.test(popup.url()))entry.popup=popup.url();void popup.close();});
      entry.page.on('dialog', dialog => {entry.dialog=dialog;entry.dialogInfo={id:randomUUID(),type:dialog.type(),message:dialog.message().slice(0,2000),defaultValue:dialog.defaultValue().slice(0,2000)};entry.dialogResolve?.();});
      entry.page.on('download', download => void download.cancel());
      entry.page.on('pageerror',error=>{if(entry.issues.length<100)entry.issues.push({type:'script',url:entry.page.url().split('?')[0],reason:error.message.slice(0,200)});});
      entry.page.on('framenavigated', frame => { if (frame === entry.page.mainFrame()) {entry.selection = null;if(entry.writeOrigin&&new URL(frame.url()).origin!==entry.writeOrigin)entry.writeOrigin=null;} });
      entry.busy = false;
      entry.lastSnapshot={id,tabs:this.list(),url:'about:blank',title:'New tab',mobile:false,image:'data:image/jpeg;base64,'+(await entry.page.screenshot({type:'jpeg',quality:70})).toString('base64'),viewport:entry.page.viewportSize(),selection:null,blocked:0};
      return { id, tabs: this.list() };
    } catch (e) { this.tabs.delete(id); await entry.context?.close(); throw e; }
  }
  async closeTab(id) {
    const entry = this.tabs.get(id);
    if (!entry) return { tabs: this.list() };
    this.tabs.delete(id); await entry.context?.close();
    return { tabs: this.list() };
  }
  async close() {
    clearInterval(this.timer);
    await this.browser?.close();
    this.denyProxy?.close();
  }
  async act({ id, action, url, x, y, toX, toY, pointerY, mobile, text, key, allowWrites, accept, origin, clickCount=1, fullPage=false, depth = 0, snapshot = true }) {
    const entry = this.tabs.get(id);
    if (!entry) throw new Error('This tab closed or expired. Open a new reference tab.');
    if (entry.busy) throw new Error('This tab is still working. Try again shortly.');
    entry.busy = true; entry.used = Date.now();
    const page = entry.page;
    entry.dialogSignal=new Promise(resolve=>{entry.dialogResolve=resolve;});
    const untilDialog=promise=>Promise.race([promise,entry.dialogSignal]);
    const paused=()=>({...entry.lastSnapshot,tabs:this.list(),url:page.url(),dialog:entry.dialogInfo});
    const watchdog = setTimeout(() => void this.closeTab(id), 75000);
    watchdog.unref();
    try {
      if(entry.dialog&&action==='snapshot')return paused();
      if(entry.dialog&&action!=='dialog')throw new Error('Respond to the website dialog before continuing.');
      if(action==='dialog'){
        if(!entry.dialog||typeof accept!=='boolean'||(text!==undefined&&(typeof text!=='string'||text.length>2000)))throw new Error('Choose a response to the current website dialog.');
        const dialog=entry.dialog;entry.dialog=null;entry.dialogInfo=null;
        if(accept)await dialog.accept(text);else await dialog.dismiss();
        await settle(entry);
      }
      else if (action === 'navigate') {
        const target = referenceUrl(url);
        entry.blocked = 0; entry.requests = 0; entry.bytes = 0;entry.issues=[];entry.popup=null;
        try { const response=await untilDialog(page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 25000 }));if(response?.status()>=400)throw new Error(`Website returned HTTP ${response.status()}.`); }
        catch (e) { if (!/Timeout/.test(e.message)) throw new Error('Website could not load. It may block automated browsers or redirect to an unavailable address.'); }
      } else if (action === 'back' || action === 'forward') {
        await untilDialog(page[action === 'back' ? 'goBack' : 'goForward']({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}));
      } else if (action === 'reload') {
        if (page.url() !== 'about:blank') await untilDialog(page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}));
      } else if (action === 'viewport') {
        entry.mobile = mobile === true; entry.selection = null;
        await page.setViewportSize(entry.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
      } else if (['click', 'pick','probe','hover','drag'].includes(action)) {
        const size = page.viewportSize();
        if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x >= size.width || y >= size.height || !Number.isInteger(depth) || depth < 0 || depth > 8) throw new Error('Pick a point inside the visible page.');
        if (action === 'click') {if(![1,2].includes(clickCount))throw new Error('Choose a single or double click.');entry.selection = null; await untilDialog(page.mouse.click(x, y,{clickCount})); }
        else if(action==='hover')await page.mouse.move(x,y);
        else if(action==='drag'){
          if(![toX,toY].every(Number.isFinite)||toX<0||toY<0||toX>=size.width||toY>=size.height)throw new Error('Drag inside the visible page.');
          entry.selection=null;await page.mouse.move(x,y);await page.mouse.down();try{await page.mouse.move(toX,toY,{steps:12});}finally{await page.mouse.up();}
        }
        else {
          const picked = await page.evaluate(({ x, y, depth, probe }) => {
            let el = document.elementFromPoint(x, y);
            if (!(el instanceof HTMLElement)) el = el?.closest('a,button')||el?.parentElement;
            el=el?.closest('a,button,input,textarea,select,summary')||el;
            for (let n = 0; n < depth; n++) if (el?.parentElement && el.parentElement !== document.body) el = el.parentElement;
            if (probe) {
              // Hover preview: report what a pick here would select without changing the page or the selection.
              if (!el || el === document.body || el === document.documentElement) return null;
              const r = el.getBoundingClientRect();
              return { tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 60), bounds: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(innerWidth, r.right) - Math.max(0, r.x), height: Math.min(innerHeight, r.bottom) - Math.max(0, r.y) } };
            }
            if (!el || el === document.body || el === document.documentElement) throw new Error('Select a component, rather than the entire document.');
            document.querySelector('[data-rf-picked]')?.removeAttribute('data-rf-picked');el.setAttribute('data-rf-picked','true');
            const rect = el.getBoundingClientRect(), clone = el.cloneNode(true);
            for (const node of [clone, ...clone.querySelectorAll('[href],[src]')]) for (const attr of ['href', 'src']) if (node.hasAttribute(attr)) { try { node.setAttribute(attr, new URL(node.getAttribute(attr), document.baseURI).href); } catch { node.removeAttribute(attr); } }
            for (const node of [clone,...clone.querySelectorAll('input,textarea')]) { node.removeAttribute('value'); if (node.tagName === 'TEXTAREA') node.textContent = ''; }
            return { html: clone.outerHTML.slice(0, 500_001), tag: el.tagName.toLowerCase(), name: (el.querySelector('h1,h2,h3')?.textContent || el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 80), bounds: { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.min(innerWidth, rect.right) - Math.max(0, rect.x), height: Math.min(innerHeight, rect.bottom) - Math.max(0, rect.y) } };
          }, { x, y, depth, probe: action === 'probe' });
          if (action === 'probe') return { probe: picked };
          entry.selection = picked;
          if (entry.selection.html.length > 500_000) { entry.selection = null; throw new Error('This element is too large. Pick a smaller component.'); }
          entry.selection.referenceImage = 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 65, clip: entry.selection.bounds, timeout: 5000 })).toString('base64');
          entry.selection.capturedAt = new Date().toISOString();
        }
      } else if (action === 'scroll') {
        if (!Number.isFinite(y) || Math.abs(y) > 1000) throw new Error('Invalid scroll distance.');
        entry.selection = null;
        const size = page.viewportSize();
        await page.mouse.move(Number.isFinite(x) ? Math.max(0, Math.min(size.width - 1, x)) : size.width / 2, Number.isFinite(pointerY)?Math.max(0,Math.min(size.height-1,pointerY)):size.height / 2);
        await page.mouse.wheel(0, y);
      } else if (action === 'text') {
        if (typeof text !== 'string' || text.length > 2000) throw new Error('Enter up to 2,000 characters.');
        if(!await page.evaluate(()=>{const el=document.activeElement;return !!el&&(el.isContentEditable||el.matches('textarea:not(:disabled),iframe,input:not(:disabled):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=file])'));}))throw new Error('Click an editable website field before typing.');
        await untilDialog(page.keyboard.insertText(text)); entry.selection = null;
      } else if (action === 'enter') { await untilDialog(page.keyboard.press('Enter')); entry.selection = null;
      } else if(action==='key'){
        if(!['Tab','Shift+Tab','Enter','Escape','Backspace','Delete','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Space','ControlOrMeta+A'].includes(key))throw new Error('Unsupported browser key.');
        await untilDialog(page.keyboard.press(key));entry.selection=null;
      } else if(action==='permissions'){
        if(typeof allowWrites!=='boolean'||origin!==new URL(page.url()).origin||!/^https?:/.test(page.url()))throw new Error('Choose the current website origin.');
        entry.writeOrigin=allowWrites?origin:null;
      } else if(action==='prepare'){
        entry.scanLimited=await loadWholePage(entry);
      } else if(action==='scrape'){
        entry.scanLimited=await loadWholePage(entry);if(entry.dialog)throw new Error('Respond to the website dialog before scraping.');return {...await scrapePage(page),scanLimited:entry.scanLimited,capturedAt:new Date().toISOString()};
      } else if(action==='screenshot'){
        if(fullPage)entry.scanLimited=await loadWholePage(entry);else await settle(entry);
        if(entry.dialog)throw new Error('Respond to the website dialog before capturing a screenshot.');
        const size=await page.evaluate(()=>({width:innerWidth,height:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0)}));
        const truncated=fullPage&&size.height>20000;
        const screenshot=await page.screenshot({type:'jpeg',quality:85,timeout:15000,animations:'disabled',...(truncated?{clip:{x:0,y:0,width:size.width,height:20000}}:{fullPage})});
        return {url:page.url(),title:await page.title(),image:'data:image/jpeg;base64,'+screenshot.toString('base64'),fullPage,width:size.width,height:fullPage?Math.min(size.height,20000):page.viewportSize().height,truncated,scanLimited:!!entry.scanLimited};
      } else if (action === 'extract') {
        entry.scanLimited=await loadWholePage(entry);
        if(entry.dialog)throw new Error('Respond to the website dialog before capturing sections.');
        return extract(await page.content(), page.url());
      } else if (action === 'capture') {
        if (!entry.selection) throw new Error('Pick an element first.');
        const s=entry.selection,item=await replicaItem([await readRendered(page,'[data-rf-picked]')],s.name,{resource:this.resource});
        return {items:[{...item,referenceImage:s.referenceImage,capturedAt:s.capturedAt}]};
      } else if (action !== 'snapshot') throw new Error('Unknown browser action.');
      if(entry.dialog)return paused();
      if(['navigate','reload','back','forward','viewport','click','key','enter'].includes(action))await settle(entry);
      if(['hover','scroll','drag','text'].includes(action))await page.waitForTimeout(150);
      if(entry.dialog)return paused();
      const title=await untilDialog(page.title());if(entry.dialog)return paused();entry.title=title.slice(0,120);
      if(snapshot===false)return {id,url:page.url(),title:entry.title};
      const screenshot = await untilDialog(page.screenshot({ type: 'jpeg', quality: 70, timeout: 5000 }));if(entry.dialog)return paused();
      const documentState=await untilDialog(page.evaluate(()=>({scrollX,scrollY,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,ready:document.readyState,images:document.images.length,loadedImages:[...document.images].filter(img=>img.complete&&img.naturalWidth>0).length})));if(entry.dialog)return paused();
      entry.lastSnapshot={ id, tabs: this.list(), url: page.url(), title: entry.title, mobile: entry.mobile, image: 'data:image/jpeg;base64,' + screenshot.toString('base64'), viewport: page.viewportSize(), selection: entry.selection ? { name: entry.selection.name, tag: entry.selection.tag, bounds: entry.selection.bounds } : null, blocked: entry.blocked,document:documentState,network:{requests:entry.requests,pending:entry.pending+entry.queue.length,bytes:entry.bytes,issues:entry.issues.slice(-30)},writeOrigin:entry.writeOrigin,popup:entry.popup,scanLimited:!!entry.scanLimited,dialog:null };
      return entry.lastSnapshot;
    } finally { clearTimeout(watchdog); entry.busy = false;entry.dialogResolve=null; }
  }
}
