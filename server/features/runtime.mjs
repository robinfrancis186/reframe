import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { identityStore, requestJSON, validateConnection, callExternal } from './services.mjs';

const operations = [
  'create',
  'update',
  'delete',
  'search',
  'toggle',
  'increment',
  'navigate',
  'details',
  'reset',
  'signin',
  'signup',
  'signout',
  'external',
];
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const credentialScope = (c) => JSON.stringify([c.url, c.method, c.auth]);
export function validateSpec(spec) {
  if (
    !spec ||
    spec.version !== 1 ||
    !/^rf_[a-f0-9]{12}$/.test(spec.id) ||
    typeof spec.name !== 'string' ||
    !spec.name.trim() ||
    spec.name.length > 100 ||
    !Array.isArray(spec.fields) ||
    spec.fields.length > 30 ||
    !Array.isArray(spec.actions) ||
    spec.actions.length > 30
  )
    fail(400, 'Invalid feature specification.');
  const ids = new Set();
  if (spec.authRequired !== undefined && typeof spec.authRequired !== 'boolean')
    fail(400, 'Invalid authentication requirement.');
  for (const f of spec.fields) {
    if (
      !f ||
      !/^field\d+$/.test(f.id) ||
      ids.has(f.id) ||
      !['text', 'email', 'number', 'checkbox', 'search', 'password'].includes(f.type) ||
      typeof f.label !== 'string' ||
      f.label.length > 200 ||
      typeof f.required !== 'boolean'
    )
      fail(400, 'Use supported, unique data fields.');
    ids.add(f.id);
  }
  ids.clear();
  for (const a of spec.actions) {
    if (
      !a ||
      !/^action\d+$/.test(a.id) ||
      ids.has(a.id) ||
      !operations.includes(a.operation) ||
      typeof a.label !== 'string' ||
      a.label.length > 200 ||
      typeof a.target !== 'string' ||
      a.target.length > 2000 ||
      typeof a.message !== 'string' ||
      a.message.length > 2000
    )
      fail(400, 'Define every action before building the feature.');
    if (
      a.operation === 'navigate' &&
      !/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*|#[^\s]*)$/.test(a.target)
    )
      fail(400, 'Navigation needs an http(s) URL, local path or anchor.');
    if (a.operation === 'details' && !a.message.trim())
      fail(400, 'Write the content this details action should show.');
    if (
      ['signin', 'signup'].includes(a.operation) &&
      (spec.fields.filter((f) => f.type === 'email').length !== 1 ||
        spec.fields.filter((f) => f.type === 'password').length !== 1)
    )
      fail(400, 'Authentication actions need one email and one password field.');
    if (a.operation === 'external') validateConnection(a.connection, spec.fields);
    ids.add(a.id);
  }
  if (
    spec.fields.some((f) => f.type === 'password') &&
    spec.actions.some((a) => !['signin', 'signup', 'signout'].includes(a.operation))
  )
    fail(
      400,
      'Password fields may only feed authentication actions, never records or external APIs.',
    );
  if (
    spec.actions.some((a) => ['signin', 'signup', 'signout', 'external'].includes(a.operation)) &&
    !spec.authRequired
  )
    fail(400, 'Enable authentication for account and external API actions.');
  const keys = new Map();
  for (const a of spec.actions.filter(
    (a) => a.operation === 'external' && a.connection.auth !== 'none',
  )) {
    if (
      keys.has(a.connection.keyName) &&
      keys.get(a.connection.keyName) !== credentialScope(a.connection)
    )
      fail(400, 'Use a distinct API key name for each endpoint and authentication method.');
    keys.set(a.connection.keyName, credentialScope(a.connection));
  }
  return spec;
}
function validatedValues(spec, values) {
  if (
    !values ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    Object.keys(values).some((key) => !spec.fields.some((f) => f.id === key))
  )
    fail(400, 'Invalid form fields.');
  const result = {};
  for (const f of spec.fields) {
    const value = values[f.id];
    if (f.type === 'checkbox') {
      if (typeof value !== 'boolean' || (f.required && !value))
        fail(400, `${f.label} must be checked.`);
    } else {
      if (typeof value !== 'string' || value.length > 2000)
        fail(400, `${f.label} must be text under 2000 characters.`);
      if (f.required && !value.trim()) fail(400, `${f.label} is required.`);
      if (value && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        fail(400, `${f.label} needs a valid email address.`);
      if (value && f.type === 'number' && !Number.isFinite(Number(value)))
        fail(400, `${f.label} needs a finite number.`);
    }
    result[f.id] = typeof value === 'string' ? value.trim() : value;
  }
  return result;
}

// shortcut: process-local write queues; migrate to database transactions before multiple server processes.
export function featureHandler(specification, file, { external = callExternal } = {}) {
  const spec = validateSpec(specification);
  const identity = identityStore(path.join(path.dirname(file), '..', 'security'));
  let queue = Promise.resolve();
  const initial = () => ({ version: 0, records: [], counters: {}, toggles: {}, requests: [] });
  async function read(destination = file) {
    try {
      return JSON.parse(await readFile(destination, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return initial();
      throw e;
    }
  }
  const snapshot = (state, records = state.records) => ({
    version: state.version,
    records,
    counters: state.counters,
    toggles: state.toggles,
  });
  async function execute(body, destination, user) {
    if (
      !body ||
      Object.keys(body).some(
        (k) => !['action', 'values', 'recordId', 'version', 'requestId', 'query'].includes(k),
      )
    )
      fail(400, 'Unexpected action fields.');
    const action = spec.actions.find((a) => a.id === body.action);
    if (!action || ['navigate', 'details', 'reset'].includes(action.operation))
      fail(400, 'Unknown server action.');
    const state = await read(destination);
    if (action.operation === 'search') {
      if (typeof body.query !== 'string' || body.query.length > 2000)
        fail(400, 'Search must be under 2000 characters.');
      const query = body.query.toLowerCase();
      return snapshot(
        state,
        state.records.filter((r) =>
          Object.values(r.values).some((v) => String(v).toLowerCase().includes(query)),
        ),
      );
    }
    if (
      !Number.isSafeInteger(body.version) ||
      body.version < 0 ||
      typeof body.requestId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(body.requestId)
    )
      fail(400, 'Provide a valid version and request ID.');
    const fingerprint = JSON.stringify({
      action: body.action,
      values: body.values,
      recordId: body.recordId,
      version: body.version,
    });
    const previous = state.requests.find((r) => r.id === body.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        fail(409, 'Request ID was already used for different input.');
      if (previous.pending)
        fail(
          409,
          'The previous API outcome is uncertain. Check the provider before creating a new request.',
        );
      return {
        ...snapshot(state),
        replayed: true,
        ...(previous.result !== undefined ? { result: previous.result } : {}),
      };
    }
    if (body.version !== state.version)
      fail(409, 'This feature changed elsewhere. It has been refreshed; review and try again.');
    let result;
    if (action.operation === 'external') {
      if (
        action.connection.method === 'POST' &&
        state.requests.some((r) => r.pending && JSON.parse(r.fingerprint).action === action.id)
      )
        fail(
          409,
          'A previous POST outcome is uncertain. Reconcile it with the provider before sending another request.',
        );
      const values = validatedValues(spec, body.values);
      const secret =
        action.connection.auth === 'none'
          ? null
          : await identity.credential(
              user,
              action.connection.keyName,
              undefined,
              credentialScope(action.connection),
            );
      if (action.connection.auth !== 'none' && !secret)
        fail(428, 'Add your API key in Account & API keys first.');
      if (state.requests.length >= 10000) fail(409, 'Local write limit reached.');
      // Persist intent before POST so a lost provider response can never silently duplicate a remote write.
      if (action.connection.method === 'POST') {
        state.requests.push({ id: body.requestId, fingerprint, pending: true });
        await persist(destination, state);
      }
      result = await external(action.connection, values, secret, body.requestId);
      if (typeof result !== 'string' || result.length > 100000)
        fail(502, 'Invalid external API response.');
      state.requests = state.requests.filter((r) => r.id !== body.requestId);
    } else if (action.operation === 'create') {
      if (state.records.length >= 200)
        fail(409, 'This local feature has reached its 200-record limit.');
      state.records.push({
        id: randomUUID(),
        values: validatedValues(spec, body.values),
        createdAt: new Date().toISOString(),
      });
    } else if (['update', 'delete'].includes(action.operation)) {
      const record = state.records.find((r) => r.id === body.recordId);
      if (!record) fail(404, 'Select an existing record.');
      if (action.operation === 'update') record.values = validatedValues(spec, body.values);
      else state.records = state.records.filter((r) => r !== record);
    } else if (action.operation === 'toggle') state.toggles[action.id] = !state.toggles[action.id];
    else if (action.operation === 'increment') {
      if ((state.counters[action.id] || 0) >= 1_000_000) fail(409, 'Counter limit reached.');
      state.counters[action.id] = (state.counters[action.id] || 0) + 1;
    }
    state.version++;
    state.requests.push({
      id: body.requestId,
      fingerprint,
      ...(result !== undefined ? { result } : {}),
    });
    // Keep deduplication for the lifetime of this bounded local store; never replay forgotten writes.
    if (state.requests.length > 10000)
      fail(409, 'Local write limit reached. Export and migrate this feature before more writes.');
    await persist(destination, state);
    return { ...snapshot(state), ...(result !== undefined ? { result } : {}) };
  }
  async function persist(destination, state) {
    if (Buffer.byteLength(JSON.stringify(state)) > 16000000)
      fail(409, 'Local storage limit reached. Migrate this feature before more writes.');
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = destination + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600, flush: true });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return async (
    req,
    res,
    next = () => {
      res.statusCode = 404;
      res.end();
    },
  ) => {
    const pathname = (req.url || '').split('?')[0];
    const base = `/api/reframe/${spec.id}`;
    if (![base, base + '/auth', base + '/credentials'].includes(pathname)) return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const host = req.headers.host;
      if (
        !host ||
        !/^(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(host) ||
        (req.headers.origin && req.headers.origin !== `http://${host}`)
      )
        fail(403, 'This feature is local and same-origin only.');
      if (pathname === base + '/auth')
        return res.end(
          JSON.stringify(
            await identity.auth(req, res, req.method === 'POST' ? await requestJSON(req) : null),
          ),
        );
      const user = spec.authRequired ? await identity.current(req) : null;
      if (pathname === base + '/credentials') {
        if (!user) fail(401, 'Sign in to manage API keys.');
        const connections = new Map(
          spec.actions
            .filter((a) => a.operation === 'external' && a.connection.auth !== 'none')
            .map((a) => [a.connection.keyName, a.connection]),
        );
        if (req.method === 'POST') {
          const body = await requestJSON(req);
          if (!connections.has(body?.name)) fail(400, 'This feature does not use that API key.');
          await identity.credential(
            user,
            body.name,
            body.value,
            credentialScope(connections.get(body.name)),
          );
        } else if (req.method !== 'GET') fail(405, 'Use GET or POST.');
        const keys = [];
        for (const [name, connection] of connections)
          keys.push({
            name,
            endpoint: connection.url,
            method: connection.method,
            configured: !!(await identity.credential(
              user,
              name,
              undefined,
              credentialScope(connection),
            )),
          });
        return res.end(JSON.stringify({ keys }));
      }
      const destination =
        spec.authRequired && user
          ? path.join(path.dirname(file), spec.id + '.users', user.id + '.json')
          : file;
      if (req.method === 'GET') {
        if (spec.authRequired && !user) fail(401, 'Sign in to use this component.');
        await queue;
        return res.end(JSON.stringify(snapshot(await read(destination))));
      }
      if (req.method !== 'POST') fail(405, 'Use GET or POST.');
      const body = await requestJSON(req),
        action = spec.actions.find((a) => a.id === body?.action);
      if (action && ['signin', 'signup', 'signout'].includes(action.operation)) {
        const auth = await identity.auth(req, res, {
          operation: action.operation,
          email: body.values?.[spec.fields.find((f) => f.type === 'email')?.id],
          password: body.values?.[spec.fields.find((f) => f.type === 'password')?.id],
        });
        return res.end(JSON.stringify({ ...snapshot(initial()), ...auth }));
      }
      if (spec.authRequired && !user) fail(401, 'Sign in to use this component.');
      const work = queue.then(() => execute(body, destination, user));
      queue = work.catch(() => {});
      res.end(JSON.stringify(await work));
    } catch (e) {
      res.statusCode = e.status || 503;
      res.end(
        JSON.stringify({
          error: e.status ? e.message : 'Storage unavailable. Previous data was preserved.',
        }),
      );
    }
  };
}
