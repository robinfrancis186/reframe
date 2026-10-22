import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requestJSON } from './services.mjs';

export function validateCatalog(catalog) {
  if(!catalog||typeof catalog!=='object'||Array.isArray(catalog)||JSON.stringify(catalog).length>30000||Object.keys(catalog).some(k=>!['product','variants'].includes(k)))throw new Error('Use a product catalog under 30 KB.');
  const p=catalog.product, variants=catalog.variants;
  if(p&&Object.keys(p).some(k=>!['id','name','description','currency','details','notice'].includes(k)))throw new Error('Unknown product catalog field.');
  if(!p||typeof p.id!=='string'||!/^[-a-z0-9]{1,80}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||typeof p.description!=='string'||p.description.length>2000||!['USD','INR','EUR','GBP'].includes(p.currency)||typeof p.notice!=='string'||p.notice.length>1000||!Array.isArray(p.details)||p.details.length>10||p.details.some(d=>typeof d!=='string'||d.length>500)||!Array.isArray(variants)||!variants.length||variants.length>48) throw new Error('Provide a bounded product catalog with demo prices and stock.');
  const ids=new Set(), choices=new Set(), keys=Object.keys(variants[0]?.options||{}).sort();
  if(keys.length>4||keys.some(k=>!/^[-A-Za-z ]{1,40}$/.test(k)))throw new Error('Use up to four named product options.');
  for(const v of variants){
    const options=v?.options||{};
    if(!v||Object.keys(v).some(k=>!['id','name','options','priceCents','initialStock','color'].includes(k))||typeof options!=='object'||Array.isArray(options)||v.color!==undefined&&!/^#[a-f0-9]{6}$/i.test(v.color))throw new Error('Invalid variant fields.');
    if(!v||!/^[-a-z0-9]{1,80}$/.test(v.id)||ids.has(v.id)||typeof v.name!=='string'||!v.name.trim()||v.name.length>200||!Number.isSafeInteger(v.priceCents)||v.priceCents<1||v.priceCents>100000000||!Number.isSafeInteger(v.initialStock)||v.initialStock<0||v.initialStock>1000||Object.keys(options).sort().join('|')!==keys.join('|')||keys.some(k=>typeof options[k]!=='string'||!options[k].trim()||options[k].length>100))throw new Error('Use unique variants, integer prices and valid stock/options.');
    const combination=JSON.stringify(keys.map(k=>options[k]));if(keys.length&&choices.has(combination))throw new Error('Each option combination must identify one variant.');choices.add(combination);ids.add(v.id);
  }
  return catalog;
}

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function bodyKeys(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k))) fail(400, 'Invalid request fields.');
}

// shortcut: one local workspace and one server process; use a transactional database before multiuser hosting.
export class Shop {
  constructor(file, catalog) { validateCatalog(catalog); this.file = file; this.product = structuredClone(catalog.product); this.variants = structuredClone(catalog.variants); this.queue = Promise.resolve(); }
  async read() {
    try {
      const state=JSON.parse(await readFile(this.file,'utf8'));
      if(!Number.isSafeInteger(state.version)||state.version<0||!Array.isArray(state.cart)||state.cart.length>48||!Array.isArray(state.orders)||state.orders.length>200||!state.stock||this.variants.some(v=>!Number.isInteger(state.stock[v.id])||state.stock[v.id]<0)||new Set(state.cart.map(l=>l.variantId)).size!==state.cart.length||state.cart.some(l=>!this.variants.some(v=>v.id===l.variantId)||!Number.isInteger(l.quantity)||l.quantity<1||l.quantity>5))throw new Error('Shop data no longer matches this catalog. Review a migration; stored data was preserved.');
      return state;
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { version: 0, cart: [], stock: Object.fromEntries(this.variants.map(v => [v.id, v.initialStock])), orders: [] };
    }
  }
  lines(state) {
    return state.cart.map(item => {
      const variant = this.variants.find(v => v.id === item.variantId);
      return { variantId: variant.id, name: variant.name, ...(variant.options?{options:variant.options}:{}), quantity: item.quantity, priceCents: variant.priceCents, subtotalCents: variant.priceCents * item.quantity };
    });
  }
  snapshot(state) {
    const items = this.lines(state);
    return { product: this.product, variants: this.variants.map(({ initialStock, ...v }) => ({ ...v, stock: state.stock[v.id] })), version: state.version,
      cart: { items, quantity: items.reduce((n, i) => n + i.quantity, 0), totalCents: items.reduce((n, i) => n + i.subtotalCents, 0) }, lastOrder: state.orders.at(-1) || null };
  }
  async get() { await this.queue; return this.snapshot(await this.read()); }
  change(update) {
    const work = this.queue.then(async () => {
      const state = await this.read();
      const result = update(state);
      if (!result.replayed) {
        if(state.version>=10000||state.orders.length>200)fail(409,'Local shop limit reached. Export and migrate before more writes.');
        state.version++;
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = this.file + '.' + randomUUID() + '.tmp';
        try {
          await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx', flush: true });
          await rename(temporary, this.file);
        } finally { await rm(temporary, { force: true }); }
      }
      return { ...this.snapshot(state), ...result };
    });
    this.queue = work.catch(() => {});
    return work;
  }
  setItem(body) {
    bodyKeys(body, ['variantId', 'quantity', 'version']);
    const { variantId, quantity, version } = body;
    if (!this.variants.some(v => v.id === variantId) || !Number.isInteger(quantity) || quantity < 0 || quantity > 5 || !Number.isSafeInteger(version) || version < 0) fail(400, 'Choose a valid option and a quantity from 0 to 5.');
    return this.change(state => {
      if (version !== state.version) fail(409, 'Your cart changed elsewhere. We refreshed it; review it and try again.');
      if (quantity > state.stock[variantId]) fail(409, 'Not enough stock for that quantity.');
      state.cart = state.cart.filter(i => i.variantId !== variantId);
      if (quantity) state.cart.push({ variantId, quantity });
      return {};
    });
  }
  reserve(body) {
    bodyKeys(body, ['version', 'requestId']);
    const { version, requestId } = body;
    if (!Number.isSafeInteger(version) || version < 0 || typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) fail(400, 'Invalid reservation request.');
    return this.change(state => {
      const previous = state.orders.find(o => o.requestId === requestId);
      if (previous) {
        if (previous.cartVersion !== version) fail(409, 'This request ID belongs to a different cart.');
        return { order: previous, replayed: true };
      }
      if (version !== state.version) fail(409, 'Your cart changed elsewhere. We refreshed it; review it and try again.');
      if (!state.cart.length) fail(400, 'Add an item before reserving.');
      for (const item of state.cart) if (item.quantity > state.stock[item.variantId]) fail(409, 'Stock changed. Review your cart.');
      const items = this.lines(state);
      const order = { id: randomUUID(), requestId, cartVersion: version, createdAt: new Date().toISOString(), status: 'reserved', items, totalCents: items.reduce((n, i) => n + i.subtotalCents, 0), currency: this.product.currency };
      for (const item of state.cart) state.stock[item.variantId] -= item.quantity;
      state.orders.push(order);
      state.cart = [];
      return { order, replayed: false };
    });
  }
}

export function featureHandler(spec,file){
  if(!/^rf_[a-f0-9]{12}$/.test(spec?.id))throw new Error('Invalid product feature.');
  const shop=new Shop(file,spec.commerce);
  return async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    try{
      const host=req.headers.host;
      if(!host||!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==`http://${host}`)fail(403,'This demo shop is local and same-origin only.');
      if((req.url||'').split('?')[0]!==`/api/reframe/${spec.id}`)fail(404,'Unknown product route.');
      if(req.method==='GET')return res.end(JSON.stringify(await shop.get()));
      if(req.method!=='POST')fail(405,'Use GET or POST.');
      const body=await requestJSON(req),{operation,...input}=body||{};
      const result=operation==='cart'?await shop.setItem(input):operation==='reserve'?await shop.reserve(input):fail(400,'Choose a supported product action.');
      res.end(JSON.stringify(result));
    }catch(error){res.statusCode=error.status||503;res.end(JSON.stringify({error:error.status?error.message:'Shop storage is unavailable. Your previous cart was preserved.'}));}
  };
}
