import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const operations = ['create', 'update', 'delete', 'search', 'toggle', 'increment', 'navigate', 'details', 'reset'];
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function validateSpec(spec) {
  if (!spec || spec.version !== 1 || !/^rf_[a-f0-9]{12}$/.test(spec.id) || typeof spec.name !== 'string' || !spec.name.trim() || spec.name.length > 100 || !Array.isArray(spec.fields) || spec.fields.length > 30 || !Array.isArray(spec.actions) || spec.actions.length > 30) fail(400, 'Invalid feature specification.');
  const ids = new Set();
  for (const f of spec.fields) {
    if (!f || !/^field\d+$/.test(f.id) || ids.has(f.id) || !['text', 'email', 'number', 'checkbox', 'search'].includes(f.type) || typeof f.label !== 'string' || f.label.length > 200 || typeof f.required !== 'boolean') fail(400, 'Use supported, unique data fields. Passwords and authentication require a dedicated identity provider.');
    ids.add(f.id);
  }
  ids.clear();
  for (const a of spec.actions) {
    if (!a || !/^action\d+$/.test(a.id) || ids.has(a.id) || !operations.includes(a.operation) || typeof a.label !== 'string' || a.label.length > 200 || typeof a.target !== 'string' || a.target.length > 2000 || typeof a.message !== 'string' || a.message.length > 2000) fail(400, 'Define every action before building the feature.');
    if (a.operation === 'navigate' && !/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*|#[^\s]*)$/.test(a.target)) fail(400, 'Navigation needs an http(s) URL, local path or anchor.');
    if (a.operation === 'details' && !a.message.trim()) fail(400, 'Write the content this details action should show.');
    ids.add(a.id);
  }
  return spec;
}
function validatedValues(spec, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !spec.fields.some(f => f.id === key))) fail(400, 'Invalid form fields.');
  const result = {};
  for (const f of spec.fields) {
    const value = values[f.id];
    if (f.type === 'checkbox') {
      if (typeof value !== 'boolean' || (f.required && !value)) fail(400, `${f.label} must be checked.`);
    } else {
      if (typeof value !== 'string' || value.length > 2000) fail(400, `${f.label} must be text under 2000 characters.`);
      if (f.required && !value.trim()) fail(400, `${f.label} is required.`);
      if (value && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(400, `${f.label} needs a valid email address.`);
      if (value && f.type === 'number' && !Number.isFinite(Number(value))) fail(400, `${f.label} needs a finite number.`);
    }
    result[f.id] = typeof value === 'string' ? value.trim() : value;
  }
  return result;
}

// shortcut: one local workspace per server process; use database transactions and user authorization before shared hosting.
export function featureHandler(specification, file) {
  const spec = validateSpec(specification);
  let queue = Promise.resolve();
  const initial = () => ({ version: 0, records: [], counters: {}, toggles: {}, requests: [] });
  async function read() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return initial(); throw e; }
  }
  const snapshot = (state, records = state.records) => ({ version: state.version, records, counters: state.counters, toggles: state.toggles });
  async function execute(body) {
    if (!body || Object.keys(body).some(k => !['action', 'values', 'recordId', 'version', 'requestId', 'query'].includes(k))) fail(400, 'Unexpected action fields.');
    const action = spec.actions.find(a => a.id === body.action);
    if (!action || ['navigate', 'details', 'reset'].includes(action.operation)) fail(400, 'Unknown server action.');
    const state = await read();
    if (action.operation === 'search') {
      if (typeof body.query !== 'string' || body.query.length > 2000) fail(400, 'Search must be under 2000 characters.');
      const query = body.query.toLowerCase();
      return snapshot(state, state.records.filter(r => Object.values(r.values).some(v => String(v).toLowerCase().includes(query))));
    }
    if (!Number.isSafeInteger(body.version) || body.version < 0 || typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) fail(400, 'Provide a valid version and request ID.');
    const fingerprint = JSON.stringify({ action: body.action, values: body.values, recordId: body.recordId, version: body.version });
    const previous = state.requests.find(r => r.id === body.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail(409, 'Request ID was already used for different input.');
      return { ...snapshot(state), replayed: true };
    }
    if (body.version !== state.version) fail(409, 'This feature changed elsewhere. It has been refreshed; review and try again.');
    if (action.operation === 'create') {
      if (state.records.length >= 200) fail(409, 'This local feature has reached its 200-record limit.');
      state.records.push({ id: randomUUID(), values: validatedValues(spec, body.values), createdAt: new Date().toISOString() });
    } else if (['update', 'delete'].includes(action.operation)) {
      const record = state.records.find(r => r.id === body.recordId);
      if (!record) fail(404, 'Select an existing record.');
      if (action.operation === 'update') record.values = validatedValues(spec, body.values);
      else state.records = state.records.filter(r => r !== record);
    } else if (action.operation === 'toggle') state.toggles[action.id] = !state.toggles[action.id];
    else if (action.operation === 'increment') {
      if ((state.counters[action.id] || 0) >= 1_000_000) fail(409, 'Counter limit reached.');
      state.counters[action.id] = (state.counters[action.id] || 0) + 1;
    }
    state.version++;
    state.requests.push({ id: body.requestId, fingerprint });
    // Keep deduplication for the lifetime of this bounded local store; never replay forgotten writes.
    if (state.requests.length > 10000) fail(409, 'Local write limit reached. Export and migrate this feature before more writes.');
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try { await writeFile(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600, flush: true }); await rename(temporary, file); }
    finally { await rm(temporary, { force: true }); }
    return snapshot(state);
  }
  return async (req, res, next = () => { res.statusCode = 404; res.end(); }) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== `/api/reframe/${spec.id}`) return next();
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const host = req.headers.host;
      if (!host || !/^(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) fail(403, 'This feature is local and same-origin only.');
      if (req.method === 'GET') { await queue; return res.end(JSON.stringify(snapshot(await read()))); }
      if (req.method !== 'POST') fail(405, 'Use GET or POST.');
      if (!/^application\/json\b/.test(req.headers['content-type'] || '')) fail(415, 'Send JSON.');
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 70000) fail(413, 'Request exceeds 70 KB.'); }
      let body; try { body = JSON.parse(raw); } catch { fail(400, 'Invalid JSON.'); }
      const work = queue.then(() => execute(body)); queue = work.catch(() => {});
      res.end(JSON.stringify(await work));
    } catch (e) { res.statusCode = e.status || 503; res.end(JSON.stringify({ error: e.status ? e.message : 'Storage unavailable. Previous data was preserved.' })); }
  };
}
