// Reads a rendered element (or the whole body) for capture: sanitizable markup, the stylesheet rules that apply to it,
// a computed-style snapshot and capture context (fonts, backdrop, viewport, root font size).
// It runs inside the captured page — through Playwright in the reference browser, and as generated code in the browser
// extension (npm run extension:build) — so it must stay self-contained: no imports and no outer references.
export function renderedSnapshot(selector){
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
}
