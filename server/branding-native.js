import { load } from 'cheerio';
const colorHex=value=>{const n=value.replace(/^0x/i,'');return /^[0-9a-f]{8}$/i.test(n)&&n.slice(0,2).toLowerCase()==='ff'?'#'+n.slice(2).toLowerCase():/^[0-9a-f]{6}$/i.test(n)?'#'+n.toLowerCase():null;};
const aliases={primary:['primary','colorPrimary','brand_primary'],background:['background','colorBackground','colorSurface','surface'],text:['onBackground','onSurface','colorOnBackground','colorOnSurface','foreground','text']};
function calls(source,name){const results=[];for(const match of source.matchAll(new RegExp('\\b'+name+'\\s*\\(','g'))){let depth=1,i=match.index+match[0].length,start=i;for(;i<source.length&&depth;i++){if(source[i]==='(')depth++;else if(source[i]===')')depth--;}if(!depth)results.push(source.slice(start,i-1));}return results;}
export function detectNativeTokens(files,mode='light') {
  const theme={},evidence=[],tokens=new Map();
  function put(field,value,file,token,confidence='high'){if(value===null||value===undefined||value==='')return;theme[field]=value;evidence.push({field,value,file,token,confidence});}
  const relevant=files.filter(f=>mode==='dark'||!/(values-night|\.dark\.)/.test(f.path)).sort((a,b)=>(/values-night/.test(a.path)?1:0)-(/values-night/.test(b.path)?1:0));
  for(const file of relevant){
    if(/\.xml$/.test(file.path)){
      const $=load(file.text,{xmlMode:true});$('color,item,dimen').each((_,node)=>{const name=$(node).attr('name');if(name)tokens.set(name,{value:$(node).text().trim(),file:file.path});});
      const name=$('string[name="app_name"]').text();if(name)put('brandName',name.slice(0,100),file.path,'app_name');
    }
    if(/Info\.plist$/.test(file.path)){
      const $=load(file.text,{xmlMode:true});$('key').each((_,node)=>{if($(node).text()==='CFBundleDisplayName'){const name=$(node).next('string').text();if(name&&!name.includes('$('))put('brandName',name.slice(0,100),file.path,'CFBundleDisplayName');}});
    }
    if(/\.kt$/.test(file.path)) for(const match of file.text.matchAll(/\b(?:val|var)\s+(\w+)\s*(?::\s*Color)?\s*=\s*Color\(\s*(0x[0-9a-fA-F]{6,8})\s*\)/g)){const value=colorHex(match[2]);if(value)tokens.set(match[1],{value,file:file.path});}
    if(/\.swift$/.test(file.path)) for(const match of file.text.matchAll(/\b(?:let|var)\s+(primary|background|foreground|text|accentColor|cornerRadius)\s*(?::\s*\w+)?\s*=\s*([^\n;]+)/g)){
      const rgb=/Color\(\s*red:\s*([\d.]+)\s*,\s*green:\s*([\d.]+)\s*,\s*blue:\s*([\d.]+)\s*\)/.exec(match[2]);
      if(rgb) {const value='#'+rgb.slice(1).map(n=>Math.round(Math.max(0,Math.min(1,Number(n)))*255).toString(16).padStart(2,'0')).join('');tokens.set(match[1]==='accentColor'?'primary':match[1],{value,file:file.path});}
      else if(match[1]==='cornerRadius'&&/^\d+(?:\.\d+)?$/.test(match[2].trim()))put('radius',Math.min(32,Number(match[2].trim())),file.path,'cornerRadius');
    }
    if(/\.colorset\/Contents\.json$/.test(file.path)){
      try{const asset=JSON.parse(file.text),values=asset.colors||[];const selected=values.find(c=>(c.appearances||[]).some(a=>a.appearance==='luminosity'&&a.value===mode))||values.find(c=>!(c.appearances||[]).length);const components=selected?.color?.components;
        if(components&&Number(components.alpha??1)===1){const value='#'+['red','green','blue'].map(k=>{const raw=components[k];return Math.round(/^0x/i.test(raw)?parseInt(raw,16):Math.max(0,Math.min(1,Number(raw)))*255).toString(16).padStart(2,'0');}).join('');const name=file.path.split('/').at(-2).replace('.colorset','');if(/^#[0-9a-f]{6}$/i.test(value))tokens.set(/^(AccentColor|BrandPrimary)$/i.test(name)?'primary':/^(Background|Surface)$/i.test(name)?'background':/^(Foreground|Text|OnSurface)$/i.test(name)?'text':name,{value,file:file.path});}
      }catch{}
    }
  }
  for(const file of relevant.filter(f=>/\.kt$/.test(f.path)))for(const body of calls(file.text,mode==='dark'?'darkColorScheme':'lightColorScheme'))for(const match of body.matchAll(/\b(primary|background|surface|onBackground|onSurface)\s*=\s*(Color\(\s*0x[0-9a-fA-F]{6,8}\s*\)|\w+)/g)){
    const literal=/0x[0-9a-fA-F]+/.exec(match[2]);const token=literal?{value:colorHex(literal[0]),file:file.path}:tokens.get(match[2]);if(token?.value)tokens.set(match[1],token);
  }
  function resolve(name,seen=new Set()){if(seen.has(name)||seen.size>12)return null;seen.add(name);const token=tokens.get(name);if(!token)return null;if(token.value.startsWith('@color/'))return resolve(token.value.slice(7),seen);const hex=token.value.startsWith('#')?colorHex(token.value.slice(1)):null;return hex?{value:hex,file:token.file}:null;}
  for(const [field,names] of Object.entries(aliases)){for(const name of [...names,...names.map(n=>`md_theme_${mode}_${n}`)]){const token=resolve(name);if(token){put(field,token.value,token.file,name);break;}}}
  for(const key of ['corner_radius','border_radius']){const token=tokens.get(key);const size=token?.value.match(/^(\d+(?:\.\d+)?)(?:dp|sp)$/);if(size){put('radius',Math.min(32,Number(size[1])),token.file,key);break;}}
  return {theme,evidence};
}
