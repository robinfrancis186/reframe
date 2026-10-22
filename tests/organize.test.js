import test from 'node:test';
import assert from 'node:assert/strict';
import {elementType,autoTags,normalizeTag,normalizeCollection,validOrganisation,withTags,addCollection,matchesLibrary,sortLibrary,facets,siteOf} from '../src/library/organize.js';

const website=(html,{height=200,css='',source='https://www.apple.com/iphone/',rootStyle=''}={})=>({id:Math.random().toString(36).slice(2),name:'Captured',html:'<p>x</p>',source,kind:'rendered-component',capturedAt:'2026-10-22T10:00:00.000Z',evidence:'',feature:{spec:{website:{css,pages:[{html,height,component:true,rootStyle}]}}}});
const plain=(html,name='Starter')=>({id:name,name,html,source:'Reframe starter • original example',kind:'section',capturedAt:'2026-10-21T10:00:00.000Z',evidence:''});

test('element type comes from the root element, its contents and its size',()=>{
  const cases=[
    [website('<nav class="ac-gn"><ul><li><a>Store</a></li></ul></nav>'),'Navigation'],
    [website('<div class="globalnav-content"><a>x</a></div>'),'Navigation'],
    [website('<header><h1>Brand</h1></header>'),'Header'],
    [website('<footer><p>©</p></footer>'),'Footer'],
    [website('<fieldset><input name="q"></fieldset>'),'Form'],
    [website('<div><label>Email</label><input type="email"></div>'),'Form'],
    [website('<a class="button" href="/x">Learn more</a>',{height:44}),'Button'],
    [website('<a href="/x">Learn more</a>',{height:44}),'Button'],
    [website('<a href="/x"><div><h2>Big link card</h2></div></a>',{height:300}),'Hero'],
    [website('<ul><li>a</li></ul>'),'List'],
    [website('<picture><img src="https://x/a.jpg"></picture>'),'Media'],
    [website('<h2>Title</h2>'),'Text'],
    [website('<div class="tile-content"><h2>iPhone Duo</h2><a>Learn more</a></div>',{height:573}),'Hero'],
    [website('<section class="pricing"><h3>Pro</h3><p>$9</p></section>',{height:400}),'Card'],
    [website('<div><p>Plain</p></div>',{height:900}),'Section'],
    [plain('<nav class="navigation"><a>Product</a></nav>'),'Navigation'],
    [plain('<article class="pricing"><h1>Pro</h1></article>'),'Card'],
    [{...plain('<div></div>'),libraryId:'search'},'Original'],
  ];
  for(const [item,type] of cases)assert.equal(elementType(item),type,item.feature?.spec.website.pages[0].html||item.html);
});

test('automatic tags include site, fonts and main colors, and are cached per saved object',()=>{
  const css='@font-face{font-family:"SF Pro Text";font-weight:400;src:url("data:font/woff2;base64,AAAA")}[data-rf-rendered="0"]{color:rgb(29, 29, 31);background-color:#0071e3}a{color:#0071e3}';
  const item=website('<a class="button">Buy</a>',{height:44,css,rootStyle:'font-family:"SF Pro Display", Helvetica;font-size:17px'});
  const tags=autoTags(item);
  assert.deepEqual(tags,{site:'apple.com',type:'Button',fonts:['SF Pro Text','SF Pro Display'],colors:['#0071e3','#1d1d1f']});
  assert.equal(autoTags(item),tags,'derived once per object');
  assert.equal(siteOf({source:'not a url',libraryId:'x'}),'Reframe Originals');assert.equal(siteOf({source:'Imported HTML'}),'Local');
});

test('user tags and collections are normalized, deduplicated and bounded',()=>{
  assert.equal(normalizeTag('  Dark   MODE!! '),'dark mode');assert.equal(normalizeTag('<script>'),'script');assert.equal(normalizeTag('x'.repeat(60)).length,40);
  assert.equal(normalizeCollection(' Landing  page — Q4 '),'Landing page Q4');
  assert.deepEqual(withTags(['a'],' A '),['a'],'duplicates are ignored');assert.deepEqual(withTags(['a'],'B'),['a','b']);assert.deepEqual(withTags(['a'],'  '),['a']);
  assert.equal(withTags(Array.from({length:20},(_,i)=>'t'+i),'one more').length,20);
  assert.deepEqual(addCollection([],'Pricing ideas'),['Pricing ideas']);
  assert.ok(validOrganisation({}));assert.ok(validOrganisation({tags:['dark mode'],collections:['Pricing ideas']}));
  for(const bad of [{tags:'x'},{tags:['Upper']},{tags:['a','a']},{tags:['']},{collections:['bad<']},{tags:Array.from({length:21},(_,i)=>'t'+i)}])assert.equal(validOrganisation(bad),false,JSON.stringify(bad));
});

test('search matches every word across names, sites, types, fonts, colors, tags and collections; facets and sorting',()=>{
  const nav={...website('<nav><a>Store</a></nav>',{css:'a{color:#0071e3}'}),name:'Global nav',tags:['dark mode'],collections:['Headers'],capturedAt:'2026-10-20T10:00:00.000Z',fidelity:{score:99}};
  const hero={...website('<div class="tile"><h2>Duo</h2></div>',{height:500,source:'https://www.wikipedia.org/'}),name:'Hero tile',tags:['launch'],capturedAt:'2026-10-22T10:00:00.000Z',fidelity:{score:80}};
  const starter={...plain('<article class="pricing"><h1>Pro</h1></article>','Pricing card'),capturedAt:'2026-10-21T10:00:00.000Z'};
  const items=[nav,hero,starter];
  const find=(filter)=>items.filter(i=>matchesLibrary(i,filter)).map(i=>i.name);
  assert.deepEqual(find({query:'apple navigation'}),['Global nav']);
  assert.deepEqual(find({query:'#0071e3'}),['Global nav']);
  assert.deepEqual(find({query:'DARK'}),['Global nav']);
  assert.deepEqual(find({query:'wikipedia hero'}),['Hero tile']);
  assert.deepEqual(find({query:'apple hero'}),[],'every word must match');
  assert.deepEqual(find({type:'Card'}),['Pricing card']);
  assert.deepEqual(find({collection:'Headers'}),['Global nav']);assert.deepEqual(find({tag:'launch'}),['Hero tile']);assert.deepEqual(find({site:'wikipedia.org'}),['Hero tile']);
  assert.deepEqual(sortLibrary(items,'newest').map(i=>i.name),['Hero tile','Pricing card','Global nav']);
  assert.deepEqual(sortLibrary(items,'oldest').map(i=>i.name),['Global nav','Pricing card','Hero tile']);
  assert.deepEqual(sortLibrary(items,'name').map(i=>i.name),['Global nav','Hero tile','Pricing card']);
  assert.deepEqual(sortLibrary(items,'match').map(i=>i.name),['Global nav','Hero tile','Pricing card'],'unscored last');
  assert.deepEqual(items.map(i=>i.name),['Global nav','Hero tile','Pricing card'],'sorting does not reorder the saved list');
  const counts=facets(items);
  assert.deepEqual(counts.types,[['Card',1],['Hero',1],['Navigation',1]]);
  assert.deepEqual(counts.collections,[['Headers',1]]);assert.deepEqual(counts.tags,[['dark mode',1],['launch',1]]);
});
