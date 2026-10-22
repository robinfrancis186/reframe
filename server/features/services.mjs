import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import https from 'node:https';
import path from 'node:path';

const derive = promisify(scrypt), services = new Map();
const passwordHash = (password,salt) => derive(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024});
export const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function atomicJSON(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600, flush: true }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
async function json(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
export async function requestJSON(req) {
  if (!/^application\/json\b/.test(req.headers['content-type'] || '')) fail(415, 'Send JSON.');
  let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 70000) fail(413, 'Request exceeds 70 KB.'); }
  try { return JSON.parse(raw); } catch { fail(400, 'Invalid JSON.'); }
}
const hash = value => createHash('sha256').update(value).digest('hex');
export function identityStore(folder) {
  folder = path.resolve(folder);
  if (services.has(folder)) return services.get(folder);
  let queue = Promise.resolve(); const attempts = new Map();
  const cookieName = 'reframe_' + hash(folder).slice(0,16);
  const file = path.join(folder, 'identity.json');
  const read = () => json(file, { users: [], sessions: [] });
  const exclusive = fn => { const work = queue.then(fn); queue = work.catch(() => {}); return work; };
  function token(req) { return req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] || (req.headers['x-reframe-client'] === 'native' ? '' : req.headers.cookie?.match(new RegExp('(?:^|;\\s*)' + cookieName + '=([a-f0-9]{64})(?:;|$)'))?.[1]) || ''; }
  async function current(req) {
    await queue; const state = await read(), session = state.sessions.find(s => s.token === hash(token(req)) && s.expires > Date.now());
    return session ? state.users.find(u => u.id === session.user) || null : null;
  }
  const publicUser = user => user ? { id: user.id, email: user.email } : null;
  async function auth(req, res, body) {
    if (req.method === 'GET') return { user: publicUser(await current(req)) };
    if (req.method !== 'POST') fail(405, 'Use GET or POST.');
    if (!body || !['signup', 'signin', 'signout'].includes(body.operation)) fail(400, 'Choose signup, signin or signout.');
    return exclusive(async () => {
      const state = await read(), now = Date.now(); state.sessions = state.sessions.filter(s => s.expires > now);
      if (body.operation === 'signout') {
        state.sessions = state.sessions.filter(s => s.token !== hash(token(req))); await atomicJSON(file, state);
        res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/api/reframe/; Max-Age=0`); return { user: null };
      }
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) fail(400, 'Use a valid email and a password of 12–128 characters.');
      for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
      const attemptKey = (req.socket?.remoteAddress || 'local') + ':' + email;
      const limit = attempts.get(attemptKey) || { count: 0, until: now + 900000 };
      if (limit.count >= 10 || attempts.size >= 1000) fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
      limit.count++; attempts.set(attemptKey, limit);
      let user = state.users.find(u => u.email === email);
      if (body.operation === 'signup') {
        if (user) fail(409, 'An account already exists. Sign in instead.');
        if (state.users.length >= 100) fail(409, 'Local account limit reached.');
        const salt = randomBytes(16).toString('hex'), password = (await passwordHash(body.password, salt)).toString('hex');
        user = { id: randomUUID(), email, salt, password }; state.users.push(user);
      } else {
        const candidate = await passwordHash(body.password, user?.salt || '00000000000000000000000000000000');
        if (!user || !timingSafeEqual(candidate, Buffer.from(user.password, 'hex'))) fail(401, 'Email or password is incorrect.');
      }
      const raw = randomBytes(32).toString('hex');
      state.sessions = state.sessions.filter(s => s.token !== hash(token(req)));
      const own = state.sessions.filter(s => s.user === user.id); if (own.length >= 5) state.sessions = state.sessions.filter(s => s !== own[0]);
      state.sessions.push({ token: hash(raw), user: user.id, expires: now + 86400000 }); await atomicJSON(file, state); attempts.delete(attemptKey);
      res.setHeader('Set-Cookie', `${cookieName}=${raw}; HttpOnly; SameSite=Strict; Path=/api/reframe/; Max-Age=86400`);
      return { user: publicUser(user), ...(req.headers['x-reframe-client'] === 'native' && !req.headers.origin ? { token: raw } : {}) };
    });
  }
  async function key() {
    const name = path.join(folder, 'vault.key'); await mkdir(folder, { recursive: true, mode: 0o700 });
    try { await writeFile(name, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const value = await readFile(name); if (value.length !== 32) fail(503, 'Credential vault is unavailable.'); return value;
  }
  async function credential(user, name, value, scope = '') {
    if (!user) fail(401, 'Sign in to manage API keys.');
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) fail(400, 'Invalid API key name.');
    return exclusive(async () => {
      const vaultFile = path.join(folder, 'credentials.json'), vault = await json(vaultFile, {}), id = user.id + ':' + hash(scope) + ':' + name;
      if (value === undefined) {
        if (!vault[id]) return null;
        const stored = vault[id], decipher = createDecipheriv('aes-256-gcm', await key(), Buffer.from(stored.iv, 'hex'));
        decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(Buffer.from(stored.tag, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(stored.data, 'hex')), decipher.final()]).toString('utf8');
      }
      if (typeof value !== 'string' || value.length > 8192 || /[^\x21-\x7e]/.test(value)) fail(400, 'Use an ASCII API key under 8 KB without whitespace.');
      if (!value) delete vault[id];
      else {
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', await key(), iv); cipher.setAAD(Buffer.from(id));
        vault[id] = { iv: iv.toString('hex'), tag: '', data: Buffer.concat([cipher.update(value), cipher.final()]).toString('hex') }; vault[id].tag = cipher.getAuthTag().toString('hex');
      }
      await atomicJSON(vaultFile, vault); return null;
    });
  }
  const service = { current, auth, credential, publicUser }; services.set(folder, service); return service;
}

const blocked4 = new BlockList(), allowed6 = new BlockList(), blocked6 = new BlockList();
for (const [address, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]]) blocked4.addSubnet(address, bits);
allowed6.addSubnet('2000::', 3, 'ipv6');
for (const [address,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) blocked6.addSubnet(address,bits,'ipv6');
export function publicAPIAddress(address) { return isIP(address) === 4 ? !blocked4.check(address) : isIP(address) === 6 && allowed6.check(address,'ipv6') && !blocked6.check(address,'ipv6'); }
export function apiURL(input) {
  let url; try { url = new URL(input); } catch { fail(400, 'Provide a public HTTPS API endpoint.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || url.search) fail(400, 'Use a public HTTPS endpoint without URL credentials, query strings or fragments. Map query fields below; keep keys in the vault.');
  return url;
}
export function validateConnection(connection, fields) {
  if (connection && Object.keys(connection).some(k => !['url','method','auth','keyName','inputMap'].includes(k))) fail(400, 'Keep API secrets in the destination vault, not the feature contract.');
  if (!connection || !['GET','POST'].includes(connection.method) || !['none','bearer','x-api-key'].includes(connection.auth) || typeof connection.url !== 'string' || connection.url.length > 2000) fail(400, 'Configure the external API endpoint, method and authentication.');
  const url = apiURL(connection.url);
  if (isIP(url.hostname.replace(/^\[|\]$/g,'')) && !publicAPIAddress(url.hostname.replace(/^\[|\]$/g,''))) fail(400, 'Private API destinations are blocked.');
  if (connection.auth !== 'none' && !/^[A-Z][A-Z0-9_]{0,63}$/.test(connection.keyName || '')) fail(400, 'Name the server-side API key, for example WEATHER_API_KEY.');
  if (!connection.inputMap || typeof connection.inputMap !== 'object' || Array.isArray(connection.inputMap) || Object.keys(connection.inputMap).length > 30 || Object.entries(connection.inputMap).some(([key,value]) => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || !fields.some(f => f.id === value && f.type !== 'password'))) fail(400, 'Map request parameter names to this component’s non-password fields.');
}
export async function callExternal(connection, values, secret, requestId) {
  const url = apiURL(connection.url), addresses = await lookup(url.hostname.replace(/^\[|\]$/g,''), { all: true });
  if (!addresses.length || addresses.some(a => !publicAPIAddress(a.address))) fail(400, 'Private API destinations are blocked.');
  const input = Object.fromEntries(Object.entries(connection.inputMap).map(([name,field]) => [name, values[field]]));
  if (connection.method === 'GET') for (const [name,value] of Object.entries(input)) url.searchParams.set(name,String(value));
  const body = connection.method === 'POST' ? JSON.stringify(input) : undefined;
  const headers = { Accept:'application/json', 'Accept-Encoding':'identity', 'User-Agent':'Reframe/0.1' };
  if (body) Object.assign(headers, { 'Content-Type':'application/json', 'Idempotency-Key':requestId });
  if (connection.auth !== 'none') { if (!secret) fail(428, 'Add your API key in Account & API keys first.'); headers[connection.auth === 'bearer' ? 'Authorization' : 'X-API-Key'] = connection.auth === 'bearer' ? 'Bearer ' + secret : secret; }
  const address = addresses[0];
  return new Promise((resolve,reject) => {
    const request = https.request(url, { method:connection.method, headers, signal:AbortSignal.timeout(10000), lookup:(_host,options,cb) => options.all ? cb(null,[address]) : cb(null,address.address,address.family) }, response => {
      const chunks=[]; let bytes=0;
      response.on('data',chunk => { bytes+=chunk.length; if(bytes>100000){response.destroy();reject(Object.assign(new Error('API response exceeds 100 KB.'),{status:502}));}else chunks.push(chunk); });
      response.on('error',reject); response.on('end',()=>{
        if(response.statusCode<200||response.statusCode>=300)return reject(Object.assign(new Error(`External API returned HTTP ${response.statusCode}.`),{status:502}));
        try { const value=JSON.parse(Buffer.concat(chunks).toString('utf8')); let result=JSON.stringify(value,null,2); if(secret)result=result.split(JSON.stringify(secret).slice(1,-1)).join('[redacted]'); resolve(result); }
        catch { reject(Object.assign(new Error('External API did not return valid JSON.'),{status:502})); }
      });
    });
    request.on('error',()=>reject(Object.assign(new Error('External API request failed or timed out. Check the provider before retrying a POST.'),{status:502}))); request.end(body);
  });
}
