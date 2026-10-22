import {referenceResource} from './browser-network.js';
import {SNAPSHOT_DEFAULTS,validateReplica} from './replica.js';

// Capture fidelity: render a saved website capture in an isolated, script-free Chromium page and compare it with the
// reference image taken when it was picked. The comparison is structural (SSIM on luminance over 8×8 blocks),
// discounted by each block's color difference and weighted towards detailed blocks, so a match needs the same layout, text placement and colors.
// Source images load through the same pinned public-network broker as the reference browser; nothing else is fetched.
const REFERENCE=/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/;
export const fidelityGrade=score=>score>=90?'Close match':score>=75?'Minor differences':score>=55?'Noticeable differences':'Low match';

export function canScore(item){
  const page=item?.feature?.spec?.website?.pages?.[0];
  return !!(page?.component&&typeof item.referenceImage==='string'&&REFERENCE.test(item.referenceImage));
}

function documentFor(site){
  const page=site.pages[0];
  return `<!doctype html><html lang="en" class="${page.htmlClass.replace(/"/g,'')}"><head><meta charset="utf-8"><style>${site.css.replace(/<\/style/gi,'')}html,body{margin:0;padding:0;background:${page.backdrop||'#ffffff'}}body{${(page.rootStyle||'').replace(/[<>]/g,'')}}</style></head><body>${page.html}</body></html>`;
}

// Runs inside a blank page: decodes both images, aligns them and scores 8×8 blocks.
function compare({reference,rendered,diff}){
  const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Image could not be decoded.'));image.src=src;});
  return Promise.all([load(reference),load(rendered)]).then(([ref,out])=>{
    const scale=Math.min(1,480/ref.naturalWidth),width=Math.max(8,Math.round(ref.naturalWidth*scale)),height=Math.max(8,Math.round(ref.naturalHeight*scale));
    const near=(a,b)=>Math.abs(a-b)<=Math.max(4,b*.1);
    // Same size within 10%: rendering differences in sub-pixel layout are scaled away. Otherwise draw 1:1, so a size
    // mismatch shows up as missing or extra content rather than being hidden by stretching.
    const fitted=near(out.naturalWidth,ref.naturalWidth)&&near(out.naturalHeight,ref.naturalHeight);
    // A light blur and the best of ±1px alignments absorb anti-aliasing and sub-pixel layout differences, which would
    // otherwise dominate small components; real layout, text or color differences are far larger than that.
    const pixels=(image,stretch,dx=0,dy=0)=>{const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.filter='blur(.6px)';if(stretch)context.drawImage(image,dx,dy,width,height);else context.drawImage(image,dx,dy,image.naturalWidth*scale,image.naturalHeight*scale);return context.getImageData(0,0,width,height).data;};
    const a=pixels(ref,true),C1=(.01*255)**2,C2=(.03*255)**2;
    const measure=b=>{const blocks=[];
    for(let by=0;by+8<=height;by+=8)for(let bx=0;bx+8<=width;bx+=8){
      let ma=0,mb=0,ra=0,ga=0,ba=0,rb=0,gb=0,bb=0;const la=[],lb=[];
      for(let y=by;y<by+8;y++)for(let x=bx;x<bx+8;x++){const i=(y*width+x)*4,va=.299*a[i]+.587*a[i+1]+.114*a[i+2],vb=.299*b[i]+.587*b[i+1]+.114*b[i+2];la.push(va);lb.push(vb);ma+=va;mb+=vb;ra+=a[i];ga+=a[i+1];ba+=a[i+2];rb+=b[i];gb+=b[i+1];bb+=b[i+2];}
      ma/=64;mb/=64;let sa=0,sb=0,sab=0;for(let n=0;n<64;n++){sa+=(la[n]-ma)**2;sb+=(lb[n]-mb)**2;sab+=(la[n]-ma)*(lb[n]-mb);}sa/=63;sb/=63;sab/=63;
      const ssim=((2*ma*mb+C1)*(2*sab+C2))/((ma*ma+mb*mb+C1)*(sa+sb+C2)),color=(Math.abs(ra-rb)+Math.abs(ga-gb)+Math.abs(ba-bb))/192;
      // Detailed blocks (text, edges, imagery) count fully; flat background blocks count 15%, so empty space cannot mask a mismatch.
      blocks.push({x:bx,y:by,score:Math.max(0,ssim)*(1-Math.min(.5,color/128)),weight:.15+.85*Math.min(1,Math.sqrt(Math.max(sa,sb))/16)});
    }
    const total=blocks.reduce((sum,block)=>sum+block.weight,0);return {blocks,score:total?blocks.reduce((sum,block)=>sum+block.score*block.weight,0)/total:0};};
    let best=null;for(const dy of [0,-1,1])for(const dx of [0,-1,1]){const m=measure(pixels(out,fitted,dx,dy));if(!best||m.score>best.score)best=m;}
    const {blocks,score}=best;
    let heatmap=null;
    if(diff){
      const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d');context.filter='grayscale(1) opacity(.45)';context.drawImage(ref,0,0,width,height);context.filter='none';
      for(const block of blocks)if(block.score<.85){context.fillStyle=`rgba(229,57,53,${Math.min(.85,(1-block.score)*1.2).toFixed(2)})`;context.fillRect(block.x,block.y,8,8);}
      heatmap=canvas.convertToBlob({type:'image/png'}).then(blob=>blob.arrayBuffer()).then(buffer=>{let binary='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return 'data:image/png;base64,'+btoa(binary);});
    }
    return Promise.resolve(heatmap).then(diffImage=>({score:Math.round(score*1000)/10,fitted,reference:{width:ref.naturalWidth,height:ref.naturalHeight},rendered:{width:out.naturalWidth,height:out.naturalHeight},differing:blocks.filter(block=>block.score<.85).length/Math.max(1,blocks.length),diff:diffImage}));
  });
}

// Renders a website capture in an isolated, script-free page and passes the page to `use`.
const withRendered=(site,options,use)=>withDocument(documentFor(site),site.pages[0],options,use);
async function withDocument(html,page,{browser,resource},use){
  await browser.start();
  const context=await browser.browser.newContext({viewport:{width:page.viewport||1280,height:900},javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
  try{
    await context.route('**/*',async route=>{
      const request=route.request(),url=request.url();
      if(url.startsWith('data:'))return route.continue();
      if(request.method()!=='GET'||!/^https?:/.test(url))return route.abort();
      // Chromium's own request headers (user agent, accept), as in the reference browser; some sites refuse requests without them.
      try{await route.fulfill(await resource(url,{...await request.allHeaders(),referer:page.url}));}catch{await route.abort();}
    });
    const tab=await context.newPage();tab.setDefaultTimeout(15000);
    await tab.setContent(html,{waitUntil:'load',timeout:20000});
    await tab.evaluate(()=>document.fonts.ready);
    return await use(tab);
  }finally{await context.close();}
}

// The computed-style snapshot taken at capture is written as low-specificity rules at the start of the stylesheet, so
// the site's own :hover and state rules still apply. Contextual site rules whose ancestors were not captured can then
// win with the wrong value (e.g. a generic `.button` size). These are the snapshot rules, parsed back.
const SNAPSHOT=/^(\[data-rf-rendered="\d+"\](?:,\[data-rf-rendered="\d+"\])*)\{([^}]*)\}/;
export function snapshotRules(css){
  const rules=[];let rest=css.trimStart(),match;
  while((match=rest.match(SNAPSHOT))){
    rules.push({ids:[...match[1].matchAll(/"(\d+)"/g)].map(m=>Number(m[1])),declarations:[...match[2].matchAll(/([-a-z]+)\s*:\s*((?:[^;"']|"[^"]*"|'[^']*')*)/g)].map(m=>[m[1],m[2].trim()])});
    rest=rest.slice(match[0].length);
  }
  return rules;
}
const MARK='/* reframe:fidelity-repair */';

// Finds snapshot values the site's rules overrode in a rendered page and returns pinning rules with higher specificity.
async function findRepairs(tab,rules){
  const fixes=await tab.evaluate(({rules,defaults})=>{
    const same=(a,b)=>{if(a===b)return true;const x=a.split(/\s+/),y=b.split(/\s+/);return x.length===y.length&&x.every((v,i)=>{const n=parseFloat(v),m=parseFloat(y[i]);return v===y[i]||Number.isFinite(n)&&Number.isFinite(m)&&v.replace(/^[-\d.]+/,'')===y[i].replace(/^[-\d.]+/,'')&&Math.abs(n-m)<=.5;});};
    const groups=new Map();
    for(const {ids,declarations} of rules)for(const id of ids){
      const el=document.querySelector(`[data-rf-rendered="${id}"]`);if(!el)continue;
      // Defaults were omitted from the snapshot to keep it small, but are expected values too.
      const expected=[...Object.entries(defaults).filter(([property])=>!declarations.some(d=>d[0]===property)),...declarations];
      const computed=getComputedStyle(el),wrong=expected.filter(([property,value])=>!same(computed.getPropertyValue(property).trim(),value));
      if(!wrong.length)continue;const block=wrong.map(([property,value])=>property+':'+value).join(';');
      if(!groups.has(block))groups.set(block,[]);groups.get(block).push(id);
    }
    return [...groups].map(([block,ids])=>({block,ids}));
  },{rules,defaults:SNAPSHOT_DEFAULTS});
  return fixes.map(({block,ids})=>ids.map(id=>`[data-rf-rendered="${id}"]:not(#rf-fidelity):not(#rf-fidelity)`).join(',')+'{'+block+'}').join('');
}

// Crops the rendered component with the same fractional box and encoding (JPEG, quality 65) as the reference, so
// rounding and compression artifacts do not count as differences.
async function shoot(tab,site,selector='[data-rf-rendered="0"]'){
  // The saved root carries snapshot index 0; older captures fall back to the first element.
  const root=tab.locator(selector),target=await root.count()?root.first():tab.locator('body > *').first();
  const box=await target.count()?await target.boundingBox():null;
  if(!box||box.width<1||box.height<1)throw new Error('The saved component has no visible content to compare.');
  return tab.screenshot({type:'jpeg',quality:65,animations:'disabled',timeout:10000,fullPage:box.y+box.height>900||box.x+box.width>(site.pages[0].viewport||1280),clip:{x:Math.max(0,box.x),y:Math.max(0,box.y),width:box.width,height:box.height}});
}

async function measure(browser,reference,shot,diff){
  // The comparison needs image events, so it runs in a separate script-enabled context that has no network at all.
  const sealed=await browser.browser.newContext();
  try{
    await sealed.route('**/*',route=>route.abort());
    const result=await (await sealed.newPage()).evaluate(compare,{reference,rendered:'data:image/jpeg;base64,'+shot.toString('base64'),diff});
    return {...result,grade:fidelityGrade(result.score),checkedAt:new Date().toISOString(),...(diff?{renderedImage:'data:image/jpeg;base64,'+shot.toString('base64')}:{diff:undefined})};
  }finally{await sealed.close();}
}

/**
 * At capture: renders once, pins snapshot values the site's own rules overrode (keeping its hover and state rules
 * for everything else), then scores the repaired result. Returns the stylesheet to save and its fidelity.
 */
export async function repairAndScore(item,{browser,resource=referenceResource}={}){
  const site=validateReplica(item.feature.spec.website),css=site.css.split(MARK)[0],rules=snapshotRules(css);
  let repaired=css;
  const shot=await withRendered({...site,css},{browser,resource},async tab=>{
    const pins=rules.length?await findRepairs(tab,rules):'';
    if(pins&&(css+MARK+pins).length<500000){repaired=css+MARK+pins;await tab.evaluate(pins=>{const style=document.createElement('style');style.textContent=pins;document.head.append(style);},pins);}
    return canScore(item)?shoot(tab,site):null;
  });
  return {css:repaired,fidelity:shot?await measure(browser,item.referenceImage,shot,false):null};
}

/** Scores one saved component. `browser` is the shared ReferenceBrowser, whose Chromium and network policy are reused. */
export async function scoreFidelity(item,{browser,resource=referenceResource,diff=false}={}){
  if(!canScore(item))throw new Error('Fidelity needs a component picked in the reference browser, with its original reference image.');
  const site=validateReplica(item.feature.spec.website);
  return measure(browser,item.referenceImage,await withRendered(site,{browser,resource},tab=>shoot(tab,site)),diff);
}

/** Scores exported code (scoped stylesheet and markup) against the reference, the same way as a saved capture. */
export async function scoreExport(item,{css,markup,scope,fonts},{browser,resource=referenceResource}={}){
  if(!canScore(item))return null;
  const site=validateReplica(item.feature.spec.website),page=site.pages[0];
  const inline=css.replace(/url\("\.\/(fonts\/[\w.]+)"\)/g,(all,file)=>fonts[file]?`url("data:font/${file.split('.').pop()};base64,${fonts[file]}")`:all);
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${inline.replace(/<\/style/gi,'')}html,body{margin:0;padding:0;background:${page.backdrop||'#ffffff'}}</style></head><body>${markup}</body></html>`;
  const shot=await withDocument(html,page,{browser,resource},tab=>shoot(tab,site,`.${scope}-0`));
  const {score,grade,fitted,reference,rendered,differing,checkedAt}=await measure(browser,item.referenceImage,shot,false);
  return {score,grade,fitted,reference,rendered,differing,checkedAt};
}
