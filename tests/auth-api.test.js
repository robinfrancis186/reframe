import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildFeature, inspectFeature } from '../server/features.js';
import { featureHandler } from '../server/features/runtime.mjs';
import {
  validateConnection,
  publicAPIAddress,
  identityStore,
} from '../server/features/services.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

async function fixture(fn, method = 'GET') {
  const folder = await mkdtemp(path.join(tmpdir(), 'reframe-auth-'));
  const html =
    '<section><h2>Connected lookup</h2><label>Message<input required></label><button>Save</button><button>Lookup</button></section>';
  const spec = inspectFeature(html);
  spec.authRequired = true;
  spec.actions[1].operation = 'external';
  spec.actions[1].connection = {
    url: 'https://api.example.com/lookup',
    method,
    auth: 'bearer',
    keyName: 'SERVICE_API_KEY',
    inputMap: { message: 'field1' },
  };
  const bundle = await buildFeature({ html, spec, name: 'Lookup' }),
    calls = [];
  const handler = featureHandler(bundle.spec, path.join(folder, 'data', bundle.spec.id + '.json'), {
    external: async (connection, values, secret, requestId) => {
      calls.push({ connection, values, secret, requestId });
      if (secret !== 'test-provider-key')
        throw Object.assign(new Error('External API returned HTTP 401.'), { status: 502 });
      if (values.field1 === 'timeout')
        throw Object.assign(new Error('Provider timed out.'), { status: 502 });
      return JSON.stringify({ reply: values.field1, authenticated: true });
    },
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/reframe/${bundle.spec.id}`;
  const client = () => {
    let cookie = '';
    return async (route = '', body, extra = {}) => {
      const response = await fetch(base + route, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.headers.has('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.get('set-cookie'),
      };
    };
  };
  try {
    await fn({ folder, bundle, client, calls, base });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(folder, { recursive: true, force: true });
  }
}
const credentials = { email: 'account@example.org', password: 'Test-only password 123!' };
const action = (id, version = 0, value = 'Hello') => ({
  action: id,
  version,
  values: { field1: value },
  requestId: randomUUID(),
});

test('real HTTP auth isolates records, rejects bad passwords/origins, persists hashed accounts and revokes sessions', () =>
  fixture(async ({ client, folder, bundle, base }) => {
    const alice = client(),
      bob = client();
    assert.equal((await alice()).status, 401);
    assert.equal(
      (await alice('/auth', { operation: 'signup', email: credentials.email, password: 'short' }))
        .status,
      400,
    );
    const registered = await alice('/auth', { operation: 'signup', ...credentials });
    assert.equal(registered.status, 200);
    assert.match(registered.cookie, /HttpOnly; SameSite=Strict/);
    assert.equal(registered.data.token, undefined);
    assert.equal((await alice('', action('action1'))).data.records.length, 1);
    await bob('/auth', {
      operation: 'signup',
      email: 'second@example.org',
      password: credentials.password,
    });
    assert.equal((await bob()).data.records.length, 0);
    assert.equal((await bob('', { ...action('action1'), recordId: 'unknown' })).status, 200);
    assert.equal((await alice()).data.records.length, 1);
    const outsider = client();
    assert.equal(
      (
        await outsider('/auth', {
          operation: 'signin',
          ...credentials,
          password: 'Wrong password 123!',
        })
      ).status,
      401,
    );
    assert.equal((await outsider('/auth', { operation: 'signin', ...credentials })).status, 200);
    assert.equal((await outsider()).data.records.length, 1);
    const cross = await fetch(base, { headers: { Origin: 'https://foreign.example' } });
    assert.equal(cross.status, 403);
    const oldCookie = registered.cookie.split(';')[0];
    await alice('/auth', { operation: 'signout' });
    assert.equal((await alice()).status, 401);
    assert.equal((await fetch(base, { headers: { Cookie: oldCookie } })).status, 401);
    const stored = await readFile(path.join(folder, 'security/identity.json'), 'utf8');
    assert.ok(!stored.includes(credentials.password));
    assert.ok(!stored.includes(oldCookie.split('=')[1]));
    assert.equal((await stat(path.join(folder, 'security/identity.json'))).mode & 0o777, 0o600);
    const identity = identityStore(path.join(folder, 'security'));
    assert.equal(await identity.current({ headers: { cookie: oldCookie } }), null);
    const native = await bob(
      '/auth',
      { operation: 'signin', email: 'second@example.org', password: credentials.password },
      { 'X-Reframe-Client': 'native' },
    );
    assert.match(native.data.token, /^[a-f0-9]{64}$/);
    assert.equal(
      (await fetch(base, { headers: { Authorization: 'Bearer ' + native.data.token } })).status,
      200,
    );
    const expired = JSON.parse(await readFile(path.join(folder, 'security/identity.json'), 'utf8'));
    expired.sessions.forEach((s) => (s.expires = 0));
    await writeFile(path.join(folder, 'security/identity.json'), JSON.stringify(expired));
    assert.equal((await outsider()).status, 401);
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await outsider('/auth', {
            operation: 'signin',
            email: 'limit@example.org',
            password: credentials.password,
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await outsider('/auth', {
          operation: 'signin',
          email: 'limit@example.org',
          password: credentials.password,
        })
      ).status,
      429,
    );
  }));

test('per-user API keys are encrypted, replaceable and removable; server forwards declared mappings and deduplicates calls', () =>
  fixture(async ({ client, folder, calls }) => {
    const user = client(),
      other = client();
    const account = await user('/auth', { operation: 'signup', ...credentials });
    assert.equal((await user('', action('action2'))).status, 428);
    assert.equal(calls.length, 0);
    assert.equal((await user('/credentials', { name: 'OTHER_KEY', value: 'wrong' })).status, 400);
    const saved = await user('/credentials', {
      name: 'SERVICE_API_KEY',
      value: 'test-provider-key',
    });
    assert.equal(saved.data.keys[0].configured, true);
    assert.equal(saved.data.keys[0].endpoint, 'https://api.example.com/lookup');
    assert.ok(!JSON.stringify(saved.data).includes('test-provider-key'));
    const request = action('action2'),
      first = await user('', request);
    assert.equal(first.status, 200);
    assert.equal(JSON.parse(first.data.result).authenticated, true);
    assert.equal(calls[0].secret, 'test-provider-key');
    assert.deepEqual(calls[0].connection.inputMap, { message: 'field1' });
    assert.equal((await user('', request)).data.replayed, true);
    assert.equal(calls.length, 1);
    const vault = await readFile(path.join(folder, 'security/credentials.json'), 'utf8');
    assert.ok(!vault.includes('test-provider-key'));
    const store = identityStore(path.join(folder, 'security'));
    assert.equal(
      await store.credential(
        account.data.user,
        'SERVICE_API_KEY',
        undefined,
        JSON.stringify(['https://different.example.com/lookup', 'GET', 'bearer']),
      ),
      null,
      'A new endpoint cannot reuse another endpoint’s saved key.',
    );
    await other('/auth', {
      operation: 'signup',
      email: 'other@example.org',
      password: credentials.password,
    });
    assert.equal((await other('/credentials')).data.keys[0].configured, false);
    await user('/credentials', { name: 'SERVICE_API_KEY', value: 'replacement' });
    assert.equal((await user('/credentials')).data.keys[0].configured, true);
    assert.equal((await user('', action('action2', 1))).status, 502);
    await user('/credentials', { name: 'SERVICE_API_KEY', value: '' });
    assert.equal((await user('/credentials')).data.keys[0].configured, false);
    assert.equal((await user('', action('action2', 1))).status, 428);
  }));

test('an uncertain external POST remains blocked across fresh request IDs rather than repeating a remote write', () =>
  fixture(async ({ client, calls }) => {
    const user = client();
    await user('/auth', { operation: 'signup', ...credentials });
    await user('/credentials', { name: 'SERVICE_API_KEY', value: 'test-provider-key' });
    const successful = action('action2');
    assert.equal((await user('', successful)).status, 200);
    assert.equal((await user('', successful)).data.replayed, true);
    assert.equal(calls.length, 1);
    const request = action('action2', 1, 'timeout');
    assert.equal((await user('', request)).status, 502);
    assert.equal((await user('', request)).status, 409);
    assert.equal((await user('', action('action2', 1, 'new input'))).status, 409);
    assert.equal(calls.length, 2);
  }, 'POST'));

test('authentication capture compiles secure controls and cannot store or forward passwords as ordinary data', async () => {
  const html =
    '<label>Email<input type="email"></label><label>Password<input type="password"></label><button>Sign in</button><button>Sign up</button>';
  const bundle = await buildFeature({ html, name: 'Login' });
  assert.equal(bundle.spec.authRequired, true);
  assert.deepEqual(
    bundle.spec.actions.map((a) => a.operation),
    ['signin', 'signup'],
  );
  assert.ok(bundle.files['Account.tsx']);
  assert.match(bundle.files['Component.swift'], /SecureField/);
  const spec = structuredClone(bundle.spec);
  spec.actions[0].operation = 'create';
  await assert.rejects(
    buildFeature({ html, spec, name: 'Unsafe' }),
    /Password fields may only feed authentication/,
  );
  if (process.platform === 'darwin') {
    const folder = await mkdtemp(path.join(tmpdir(), 'reframe-auth-swift-'));
    try {
      await writeFile(path.join(folder, 'Client.swift'), bundle.files['ReframeClient.swift']);
      await writeFile(path.join(folder, 'Component.swift'), bundle.files['Component.swift']);
      await promisify(execFile)(
        'swiftc',
        ['-typecheck', path.join(folder, 'Client.swift'), path.join(folder, 'Component.swift')],
        { timeout: 60000 },
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
});

test('external contracts reject private endpoints, URL credentials, query secrets and invalid mappings', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.2.2',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    '2002:7f00:1::',
  ])
    assert.equal(publicAPIAddress(address), false, address);
  for (const address of ['8.8.8.8', '2606:4700:4700::1111'])
    assert.equal(publicAPIAddress(address), true, address);
  for (const url of [
    'http://api.example.com',
    'https://127.0.0.1',
    'https://user:key@api.example.com',
    'https://api.example.com?key=secret',
  ])
    assert.throws(() => validateConnection({ url, method: 'GET', auth: 'none', inputMap: {} }, []));
  assert.throws(() =>
    validateConnection(
      {
        url: 'https://api.example.com',
        method: 'GET',
        auth: 'bearer',
        keyName: 'secret\nheader',
        inputMap: {},
      },
      [],
    ),
  );
});

test(
  'compiled native Swift client signs in, saves a scoped API key, calls the API and loses access after signout',
  { skip: process.platform !== 'darwin' },
  () =>
    fixture(async ({ folder, bundle, base }) => {
      await writeFile(path.join(folder, 'Client.swift'), bundle.files['ReframeClient.swift']);
      await writeFile(
        path.join(folder, 'Probe.swift'),
        `import Foundation
@main struct Probe { static func main() async throws {
var client=ReframeClient(baseURL:URL(string:"${new URL(base).origin}")!,featureID:"${bundle.spec.id}")
let signed=try await client.account(operation:"signup",email:"swift@example.org",password:"Native test password 123!")
assert(signed.user != nil && signed.token != nil);client.token=signed.token
let keys=try await client.credentials(name:"SERVICE_API_KEY",value:"test-provider-key");assert(keys.first?.configured == true)
let state=try await client.request();assert(state.version == 0 && state.records.isEmpty)
let reply=try await client.request(ReframeRequest(action:"action2",values:["field1":.text("Hello")],recordId:"",query:"",version:0,requestId:UUID().uuidString))
assert(reply.result?.contains("true") == true)
_ = try await client.account(operation:"signout")
do { _ = try await client.request();fatalError("Revoked session accepted") } catch let error as ReframeFailure { assert(error.status == 401) }
print("Native authenticated API round trip passed")
} }
`,
      );
      await promisify(execFile)(
        'swiftc',
        [
          '-parse-as-library',
          path.join(folder, 'Client.swift'),
          path.join(folder, 'Probe.swift'),
          '-o',
          path.join(folder, 'probe'),
        ],
        { timeout: 60000 },
      );
      const result = await promisify(execFile)(path.join(folder, 'probe'), [], { timeout: 30000 });
      assert.match(result.stdout, /authenticated API round trip passed/);
    }),
);
