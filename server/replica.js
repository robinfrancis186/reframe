import {load} from 'cheerio';
import sanitize from 'sanitize-html';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {referenceResource,referenceUrl} from './browser-network.js';
import {cleanHtml,publicAddress} from './capture.js';
import {isIP} from 'node:net';
export {replicaDocument} from './features/website.mjs';

const digest=text=>createHash('sha256').update(text).digest('hex');
export const websiteServer=`import{createServer}from'node:http';import{readFile}from'node:fs/promises';import{fileURLToPath}from'node:url';import{featureHandler}from'./website.mjs';const spec=JSON.parse(await readFile(new URL('./feature.json',import.meta.url),'utf8'));const handler=featureHandler(spec,fileURLToPath(new URL('./.reframe/submissions.json',import.meta.url)));const server=createServer((req,res)=>{if(req.url==='/'){res.writeHead(302,{Location:'/api/reframe/'+spec.id+'/site/index.html'});return res.end();}return handler(req,res);}).listen(Number(process.env.PORT||5180),'127.0.0.1',()=>console.log('Website: http://localhost:'+server.address().port+'/'));`;
const q=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const styleAttribute=value=>load(replicaHTML('<div style="'+q(value)+'"></div>'),null,false)('div').attr('style')||'';
const tags=['main','header','footer','nav','section','article','aside','img','picture','button','input','textarea','select','option','form','fieldset','legend','label','details','summary','svg','path','circle','rect','line','polyline','polygon','ellipse','g','defs','linearGradient','radialGradient','stop','clipPath','use','symbol','title','dialog'];
// Optional capture context: the opaque color behind a component, the viewport width it was captured at and the page's
// root font size (what 1rem meant there).
// Snapshot values left out because they are each property's default. Site rules can still override a default (e.g.
// content hidden with opacity:0 until scripts run), so the fidelity repair pass checks them too. Keep in sync with
// the `inert` map inside readRendered, which runs in the page and cannot import this.
export const SNAPSHOT_DEFAULTS={'box-shadow':'none',opacity:'1','background-image':'none','letter-spacing':'normal','white-space':'normal',transform:'none',position:'static','z-index':'auto',float:'none','overflow-x':'visible','overflow-y':'visible','text-indent':'0px','text-transform':'none',visibility:'visible','vertical-align':'baseline','max-width':'none','max-height':'none'};
export function pageContext(page){
 const context={};
 if(typeof page.backdrop==='string'&&/^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+\s*)?\))$/i.test(page.backdrop.trim()))context.backdrop=page.backdrop.trim();
 if(Number.isInteger(page.viewport)&&page.viewport>=200&&page.viewport<=4000)context.viewport=page.viewport;
 if(Number.isFinite(page.rem)&&page.rem>=4&&page.rem<=64)context.rem=page.rem;
 return context;
}
export function replicaHTML(html){
 if(typeof html!=='string'||html.length>1500000)throw new Error('Rendered region exceeds 1.5 MB.');
 const $=load(html,null,false),styles={};$('[style]').each((_,el)=>{for(const match of ($(el).attr('style')||'').matchAll(/(?:^|;)\s*([-a-zA-Z0-9_]+)\s*:/g))if(!/^(?:behavior|-moz-binding)$/i.test(match[1]))styles[match[1]]=[/^(?!.*(?:url\s*\(|expression\s*\(|javascript:|@))[^<>;{}\\]*$/i];});
 return sanitize(html,{allowedTags:[...sanitize.defaults.allowedTags,...tags],allowedAttributes:{'*':['id','class','style','title','role','aria-*','data-rf-*','hidden','tabindex'],a:['href','download','target','rel'],img:['src','alt','width','height','loading','decoding'],input:['type','name','placeholder','required','maxlength','min','max','step','autocomplete','disabled'],textarea:['name','placeholder','required','maxlength','rows','disabled'],select:['name','required','disabled'],option:['value','selected'],form:['data-rf-form'],button:['type','disabled'],label:['for'],details:['open'],svg:['xmlns','width','height','viewBox','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'],path:['d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'],circle:['cx','cy','r','fill'],rect:['x','y','width','height','rx','ry','fill'],line:['x1','y1','x2','y2'],polyline:['points'],polygon:['points'],ellipse:['cx','cy','rx','ry'],g:['fill','stroke','clip-path'],use:['href'],linearGradient:['x1','x2','y1','y2'],radialGradient:['cx','cy','r'],stop:['offset','stop-color','stop-opacity']},parser:{lowerCaseAttributeNames:false,lowerCaseTags:false},allowedSchemes:['https','http','mailto','tel'],allowProtocolRelative:false,allowedStyles:{'*':styles},transformTags:{a:(tag,attrs)=>({tagName:tag,attribs:{...attrs,rel:'noopener noreferrer'}})},exclusiveFilter:frame=>frame.tag==='input'&&frame.attribs.type==='password'});
}
export function replicaCSS(css){
 if(typeof css!=='string'||css.length>500000||/\x00|<\/style/i.test(css))throw new Error('Invalid captured stylesheet.');
 // Other "<" characters are legitimate in CSS (strings, inline SVG in url()); the escape keeps their meaning and can never
 // close the enclosing style element.
 css=css.replace(/</g,'\\3c ');
 // Styles stay inside an iframe with a restrictive CSP; source imports never execute or fetch.
 return css.replace(/@import\s+(?:[^;{}]|\([^)]*\))*;/gi,'').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(all,quote,url)=>{
  if(url.startsWith('#'))return all;
  if(/^data:font\/(?:woff2?|ttf);base64,[A-Za-z0-9+/=]+$/.test(url))return all;
  try{const u=referenceUrl(url),host=u.hostname.replace(/^\[|\]$/g,'');if(isIP(host)&&!publicAddress(host)||/(?:^|\.)(?:localhost|local|internal)$/.test(host))return 'none';return 'url("'+u.href.replace(/["\\]/g,'')+'")';}catch{return 'none';}
 });
}
export async function readRendered(page,selector='body'){
 return page.evaluate(selector=>{
  const root=document.querySelector(selector);if(!root)throw new Error('Pick the component again.');const clone=root.cloneNode(true);
  const source=[root,...root.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  if(selector!=='body'&&source.length>1200)throw new Error('Pick a smaller region with fewer than 1,200 elements.');
  for(let i=0;i<source.length;i++){
   const el=source[i],copy=copies[i];for(const attr of ['href','src'])if(copy.hasAttribute(attr)){try{copy.setAttribute(attr,new URL(attr==='src'&&el.currentSrc?el.currentSrc:copy.getAttribute(attr),document.baseURI).href);}catch{copy.removeAttribute(attr);}}
   copy.removeAttribute('srcset');copy.removeAttribute('value');if(el.tagName==='TEXTAREA')copy.textContent='';
   if(el.tagName==='IMG')copy.setAttribute('data-rf-image-loaded',el.complete&&el.naturalWidth>0?'true':'false');
  }
  // Ancestor typography and custom properties are required when a leaf is moved to another document.
  const computed=getComputedStyle(root),inherited=['font-family','font-size','font-weight','line-height','color','letter-spacing','text-align','color-scheme',...(root===document.body?['background-color']:[]),...[...computed].filter(p=>p.startsWith('--'))];
  const inheritedCSS=selector==='body'?(root.getAttribute('style')||''):inherited.map(p=>p+':'+computed.getPropertyValue(p)).join(';');
  let css='',missing=[],keyframes=[];
  function rules(sheet){const base=sheet.href||document.baseURI;return [...sheet.cssRules].map(rule=>{
   if(rule.type===3){try{return rules(rule.styleSheet);}catch{missing.push(rule.href);return '';}}
   if(selector!=='body'&&rule.type===1){const selector=rule.selectorText.replace(/::[\w-]+(?:\([^)]*\))?|:(?:hover|focus-visible|focus-within|focus|active|disabled|checked)/g,'');if(![document.documentElement,document.body,...source].some(el=>{try{return el.matches(selector);}catch{return true;}}))return '';}
   if(rule.type===7){keyframes.push(rule);return '';}
   let text=rule.cssText;if(rule.type!==1&&rule.cssRules)text=text.slice(0,text.indexOf('{')+1)+[...rule.cssRules].map(r=>{try{return rules({href:base,cssRules:[r]});}catch{return '';}}).join('\n')+'}';
   return text.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(all,quote,url)=>url.startsWith('data:')||url.startsWith('#')?all:'url("'+new URL(url,base).href+'")');
  }).join('\n');}
  for(const sheet of document.styleSheets){try{css+='\n'+rules(sheet);}catch{missing.push(sheet.href||'inline stylesheet');}}
  for(const rule of keyframes)if(selector==='body'||css.includes(rule.name))css+='\n'+rule.cssText;
  if(selector!=='body'){
   const props='display box-sizing flex-direction flex-wrap align-items justify-content gap grid-template-columns margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius color background-color background-image background-size background-position background-repeat font-family font-size font-weight line-height letter-spacing text-align text-decoration box-shadow opacity fill stroke white-space transform position top right bottom left z-index flex-grow flex-shrink flex-basis order align-self float overflow-x overflow-y text-indent text-transform visibility vertical-align min-width max-width min-height max-height'.split(' ');
   // Computed-style fallback, without declarations that cannot apply (layout props on non-flex boxes, SVG paint on
   // HTML, inert initial values) and with identical blocks sharing one rule, so large regions stay within budget.
   const layout=['flex-direction','flex-wrap','align-items','justify-content','gap'],inert={'box-shadow':'none',opacity:'1','background-image':'none','letter-spacing':'normal','white-space':'normal',transform:'none',position:'static','z-index':'auto','flex-grow':'0','flex-shrink':'1','flex-basis':'auto',order:'0','align-self':'auto',float:'none','overflow-x':'visible','overflow-y':'visible','text-indent':'0px','text-transform':'none',visibility:'visible','vertical-align':'baseline','min-width':'auto','max-width':'none','min-height':'auto','max-height':'none'},offsets=['top','right','bottom','left'],item=['flex-grow','flex-shrink','flex-basis','order','align-self'];
   const groups=new Map();for(let i=0;i<source.length;i++){copies[i].setAttribute('data-rf-rendered',String(i));const el=source[i],c=getComputedStyle(el),display=c.display,svg=el instanceof SVGElement,image=c.getPropertyValue('background-image')!=='none';
    const block=(i===0?'width:'+c.width+';height:'+c.height+';max-width:100%;':'')+props.filter(p=>!(!svg&&(p==='fill'||p==='stroke')||!/flex|grid/.test(display)&&layout.includes(p)||!/grid/.test(display)&&p==='grid-template-columns'||!image&&/^background-(?:size|position|repeat)$/.test(p)||c.position==='static'&&offsets.includes(p)||!/flex|grid/.test(el.parentElement?getComputedStyle(el.parentElement).display:'')&&item.includes(p)||inert[p]===c.getPropertyValue(p))).map(p=>p+':'+c.getPropertyValue(p)+';').join('');
    if(!groups.has(block))groups.set(block,[]);groups.get(block).push(i);}
   css=[...groups].map(([block,ids])=>ids.map(i=>'[data-rf-rendered="'+i+'"]').join(',')+'{'+block+'}').join('')+'\n'+css;
  }
  const body=root===document.body?clone.innerHTML:clone.outerHTML;
  // Faces actually rendered by the component (including icon pseudo-elements) decide which @font-face rules are kept.
  const fonts=selector==='body'?null:[...new Set(source.flatMap(el=>[null,'::before','::after'].map(pseudo=>getComputedStyle(el,pseudo))).flatMap(c=>c.fontFamily.split(',').map(f=>f.trim().replace(/^["']|["']$/g,'').toLowerCase()+'|'+(parseInt(c.fontWeight)||400)+'|'+(/italic|oblique/.test(c.fontStyle)?'italic':'normal'))).filter(f=>!f.startsWith('|')))].slice(0,200);
  // The first opaque background behind a picked component, so previews and fidelity checks show it on its original backdrop.
  let backdrop=null;for(let el=root.parentElement;el&&!backdrop;el=el.parentElement){const color=getComputedStyle(el).backgroundColor;if(color&&!/^(?:transparent|rgba\([^)]*,\s*0\))$/.test(color))backdrop=color;}
  return {url:location.href,title:document.title,html:body,css,rootStyle:inheritedCSS,htmlClass:document.documentElement.className,component:selector!=='body',backdrop:selector==='body'?null:backdrop||'rgb(255, 255, 255)',viewport:innerWidth,rem:parseFloat(getComputedStyle(document.documentElement).fontSize)||16,height:Math.ceil(root.getBoundingClientRect().height),missing,fonts,links:[...new Set([...root.querySelectorAll('a[href]')].map(a=>a.href))].slice(0,150)};
 },selector);
}
// Picked components keep, per rendered family/weight/style, the face a browser would match (exact range, else nearest
// weight). Whole pages report no fonts and keep every face.
export function usedFaces(css,rawPages){
 if(!rawPages.every(raw=>Array.isArray(raw.fonts)))return css;
 const used=rawPages.flatMap(raw=>raw.fonts).filter(f=>typeof f==='string').map(f=>{const [family,weight,style]=f.toLowerCase().split('|');return {family,weight:Number(weight)||400,italic:style==='italic'};});
 const faces=[...css.matchAll(/@font-face\s*\{[^}]*\}/gi)].map(match=>{const face=match[0],family=face.match(/font-family\s*:\s*(['"]?)([^;'"}]+)\1/i)?.[2].trim().toLowerCase(),weights=(face.match(/font-weight\s*:\s*([^;}]+)/i)?.[1]||'400').trim().toLowerCase().replace(/normal/g,'400').replace(/bold/g,'700').split(/\s+/).map(Number);return {face,family,low:weights[0]||400,high:weights[1]||weights[0]||400,italic:/font-style\s*:\s*(?:italic|oblique)/i.test(face)};});
 const keep=new Set();
 for(const u of used){
  const candidates=faces.filter(f=>f.family===u.family),styled=candidates.filter(f=>f.italic===u.italic),pool=styled.length?styled:candidates;
  const distance=f=>u.weight<f.low?f.low-u.weight:u.weight>f.high?u.weight-f.high:0,best=Math.min(...pool.map(distance));
  for(const f of pool)if(distance(f)===best)keep.add(f.face);
 }
 return css.replace(/@font-face\s*\{[^}]*\}/gi,face=>keep.has(face)?face:'');
}
export async function prepareReplica(rawPages,{resource=referenceResource}={}){
 const attachments=[],warnings=[],pages=[];let css='';
 for(const raw of rawPages){
  const url=referenceUrl(raw.url).href,$=load(raw.html,null,false);$('script,style,link,meta,base,iframe,object,embed,template,noscript,canvas').remove();
  $('input').removeAttr('value');$('textarea').text('');$('form').each((i,el)=>{$(el).attr('data-rf-form',String(i));$(el).removeAttr('action').removeAttr('method');$(el).find('input,textarea,select').each((n,field)=>{if(!$(field).attr('name'))$(field).attr('name','field'+(n+1));});});
  for(const a of $('a[href]').toArray()){
   const link=$(a);let target;try{target=referenceUrl(new URL(link.attr('href'),url).href);}catch{continue;}
   if(link.attr('download')!==undefined||target.origin===new URL(url).origin&&/\.pdf$/i.test(target.pathname)){
    try{let index=attachments.findIndex(x=>x.url===target.href);if(index<0){if(attachments.length>=8)throw new Error('Eight download limit reached.');const result=await resource(target.href);if(result.status!==200||!result.body.subarray(0,5).equals(Buffer.from('%PDF-'))||result.body.length>2000000)throw new Error('The public PDF could not be verified under 2 MB.');index=attachments.length;attachments.push({url:target.href,name:(link.attr('download')||target.pathname.split('/').pop()).replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,100),type:'application/pdf',base64:result.body.toString('base64')});}link.attr('href','download-'+index+'.pdf').attr('download',attachments[index].name).removeAttr('target');}catch(e){link.removeAttr('href');warnings.push('Download not bundled: '+target.href+' · '+e.message);}
   }
  }
  if(String(raw.css||'').length>500000)throw new Error('This selection carries more than 500 KB of styles. Pick a smaller region, or capture its sections separately.');
  const nextCSS=replicaCSS(raw.css||'');if(nextCSS&&!css.includes(nextCSS))css+='\n'+nextCSS;
  const rootStyle=typeof raw.rootStyle==='string'?raw.rootStyle.replace(/[<>]/g,''):'';
  pages.push({url,title:String(raw.title||'Captured page').slice(0,200),html:replicaHTML($.html()),rootStyle:styleAttribute(rootStyle),htmlClass:String(raw.htmlClass||'').replace(/[^a-zA-Z0-9_ :.-]/g,'').slice(0,500),height:Math.max(80,Math.min(1200,Number(raw.height)||900)),component:!!raw.component,...pageContext(raw)});warnings.push(...(raw.missing||[]).map(u=>'Stylesheet unavailable: '+u));
 }
 css=usedFaces(css,rawPages);
 // Inline public fonts, so exports do not silently fall back to a different typeface. Browsers load the first
 // supported source of each face, so later fallbacks stay online and are never requested.
 const fonts=[...new Set([...css.matchAll(/@font-face\s*\{[^}]*\}/gi)].map(face=>face[0].match(/url\("(https?:[^"\s]+\.(?:woff2?|ttf)(?:\?[^"\s]*)?)"\)/i)?.[1]).filter(Boolean))],inlined=new Map();
 // Font CDNs commonly require the embedding page as referrer.
 const referer=referenceUrl(rawPages[0].url).href;let next=0;
 await Promise.all(Array.from({length:Math.min(6,fonts.length)},async()=>{while(next<fonts.length){const url=fonts[next++];
  try{const r=await resource(url,{referer,accept:'*/*'});if(r.status!==200||r.body.length>300000)throw new Error('Font unavailable.');inlined.set(url,'data:font/'+(/\.woff2(?:\?|$)/i.test(url)?'woff2':/\.ttf(?:\?|$)/i.test(url)?'ttf':'woff')+';base64,'+r.body.toString('base64'));}catch{warnings.push('Font remains online: '+url);}
 }}));
 // Stay inside the 500 KB stylesheet limit: faces beyond the budget remain online references.
 let budget=480000-css.length;
 css=css.replace(/url\("(https?:[^"\s]+)"\)/g,(all,url)=>{const data=inlined.get(url);if(!data)return all;if(data.length>budget){inlined.delete(url);warnings.push('Font remains online (size budget): '+url);return all;}budget-=data.length;return 'url("'+data+'")';});
 return validateReplica({version:1,pages,css,attachments,warnings});
}
export function validateReplica(value){
 if(!value||value.version!==1||!Array.isArray(value.pages)||!value.pages.length||value.pages.length>8||JSON.stringify(value).length>6000000)throw new Error('Choose a rendered website package under 6 MB with one to eight pages.');
 const pages=value.pages.map(p=>({url:referenceUrl(p.url).href,title:String(p.title||'Captured page').slice(0,200),html:replicaHTML(p.html),rootStyle:typeof p.rootStyle==='string'?p.rootStyle.slice(0,20000):'',htmlClass:String(p.htmlClass||'').replace(/[^a-zA-Z0-9_ :.-]/g,'').slice(0,500),height:Math.max(80,Math.min(1200,Number(p.height)||900)),component:!!p.component,...pageContext(p)}));
 const attachments=value.attachments||[];if(!Array.isArray(attachments)||attachments.length>8||attachments.some(a=>a.type!=='application/pdf'||typeof a.base64!=='string'||a.base64.length>2700000||!/^JVBER[A-Za-z0-9+/=]+$/.test(a.base64)||!Buffer.from(a.base64,'base64').subarray(0,5).equals(Buffer.from('%PDF-'))||typeof a.name!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(a.name)))throw new Error('Invalid bundled PDF.');
 const mapping=new Map(pages.map((p,i)=>[new URL(p.url).pathname.replace(/\/$/,'')||'/',i?'page-'+(i+1)+'.html':'index.html']));
 for(const p of pages){const $=load(p.html,null,false);$('a[href]').each((_,el)=>{const a=$(el),href=a.attr('href');if(/^download-[0-7]\.pdf$/.test(href)||/^(?:index|page-[2-8])\.html(?:#.*)?$/.test(href))return;try{const u=new URL(href,p.url),same=u.origin===new URL(p.url).origin,local=same&&mapping.get(u.pathname.replace(/\/$/,'')||'/');if(local)a.attr('href',local+u.hash).removeAttr('target');else if(same){a.removeAttr('href').attr('data-rf-unavailable',u.href).attr('title','This page is outside the captured set.');}else if(/^https?:/.test(u.protocol))a.attr('href',u.href).attr('target','_blank');}catch{a.removeAttr('href');}});p.html=$.html();p.text=$.root().text().replace(/\s+/g,' ').slice(0,40000);p.forms=$('form').toArray().map(form=>$(form).find('input[name],textarea[name],select[name]').toArray().filter(el=>!['submit','button','file','password'].includes(el.attribs.type)&&!('disabled' in el.attribs)).map(el=>({name:el.attribs.name,label:el.attribs['aria-label']||el.attribs.placeholder||el.attribs.name,type:el.attribs.type||'text',required:'required' in el.attribs,max:Math.max(1,Math.min(10000,Number(el.attribs.maxlength)||2000)),honeypot:el.attribs.name==='website'&&el.attribs['aria-hidden']==='true'})));p.rootStyle=styleAttribute(p.rootStyle);}
 return {version:1,pages,css:replicaCSS(value.css||''),attachments:attachments.map(a=>({name:a.name,type:a.type,base64:a.base64})),warnings:Array.isArray(value.warnings)?value.warnings.filter(v=>typeof v==='string').slice(0,100):[]};
}
export async function buildReplicaFeature(html,name,replica,id){
 const website=validateReplica(replica),featureId=id||'rf_'+randomBytes(6).toString('hex');if(!/^rf_[a-f0-9]{12}$/.test(featureId))throw new Error('Invalid replica feature ID.');
 const actions=[{label:'Local navigation, search and UI controls',operation:'website-navigation'},...(website.pages.some(p=>p.forms.length)?[{label:'Validate and save a local form receipt',operation:'website-form'}]:[]),...(website.attachments.length?[{label:'Download bundled public PDF',operation:'website-download'}]:[])].map((a,i)=>({...a,id:'action'+(i+1),target:'',message:'Independently authored local website behavior.'}));
 const spec={version:1,id:featureId,name:String(name||website.pages[0].title).slice(0,100),fields:[],actions,website};
 const read=file=>readFile(new URL('./features/'+file,import.meta.url),'utf8');const [runtime,runner,services]=await Promise.all(['website.mjs','runner.mjs','services.mjs'].map(read));
 const component=`export default function ReframeFeature(){return <iframe title={${JSON.stringify(spec.name)}} src=${JSON.stringify('/api/reframe/'+featureId+'/site/index.html')} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups" referrerPolicy="no-referrer" style={{width:'100%',height:${website.pages[0].component?website.pages[0].height+32:JSON.stringify('min(85vh,1200px)')},minHeight:${website.pages[0].component?80:320},border:0,display:'block',background:'transparent'}}/>;}\n`;
 const files={'Component.tsx':component,'feature.json':JSON.stringify(spec),'website.mjs':runtime,'website-server.mjs':websiteServer,'runtime.mjs':await read('runtime.mjs'),'server.mjs':runner,'services.mjs':services,'README.md':'# '+spec.name+'\n\nRendered source HTML, public CSS, inline SVG and independently authored website runtime. Install through Reframe Projects in React + Vite, then npm run reframe:dev (or build and reframe:start). Original styling is isolated in an iframe. Captured routes stay local; PDFs are bundled. Images remain online references. Contact forms validate and save local requests with durable receipts; no email is sent. No original JavaScript or private backend is recovered. Generic search, theme, disclosure and carousel behavior is authored by Reframe. Unknown actions show an explicit explanation. Review forms and routes before publishing. Local single-user storage is not a public multiuser service.\n'};
 return {version:1,spec,sourceHash:digest(cleanHtml(html)),files,bytes:Buffer.byteLength(JSON.stringify(files)),builtAt:new Date().toISOString(),requirements:['React + Vite and Node 24+','Original appearance preserved in an isolated document','Online source images; local PDF downloads and form receipts','Review unsupported controls and pages outside the captured set']};
}
export async function replicaItem(rawPages,name,options){const replica=await prepareReplica(rawPages,options),html=cleanHtml(rawPages[0].html).slice(0,190000)||'<section>Captured website</section>';return {id:randomUUID(),name:(name||rawPages[0].title).slice(0,200),html,source:rawPages[0].url,kind:rawPages.length>1?'website':'rendered-component',capturedAt:new Date().toISOString(),evidence:'Rendered HTML, source styles, inline SVG and bundled public PDFs. Independently authored local interactions and form backend. Source images remain online; private source logic is not recovered.',feature:await buildReplicaFeature(html,name,replica)};}
