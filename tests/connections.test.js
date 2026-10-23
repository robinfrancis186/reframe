import { runOpenAIMcp } from '../server/openai-mcp.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Connections } from '../server/connections.js';
import { graphifySource, graphifyStatus } from '../server/graphify.js';

test('connections store only credential hashes, preserve permissions and sanitize shared metadata', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'reframe-pair-'));
  try {
    const connections = new Connections(folder),
      created = await connections.create({ name: 'Local verifier', scopes: ['library'] });
    assert.equal((await connections.authorize('Bearer ' + created.token)).id, created.client.id);
    assert.ok(!(await readFile(connections.file, 'utf8')).includes(created.token));
    assert.equal((await stat(connections.file)).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(await connections.list()).includes('"hash"'));
    await assert.rejects(connections.authorize('Bearer no-token'), (e) => e.status === 401);
    await assert.rejects(connections.create({ name: 'Invalid', scopes: ['apply'] }), /permissions/);
    const item = {
      id: 'one',
      name: 'Note',
      html: '<article><h2>Note</h2><script>execute()</script></article>',
      source: 'Supplied HTML',
      kind: 'article',
      evidence: 'No hidden logic',
      capturedAt: new Date().toISOString(),
      unknownCredential: 'do-not-retain',
    };
    await Promise.all([connections.save(item), connections.save({ ...item, id: 'two' })]);
    const stored = await connections.component('one');
    assert.ok(!stored.html.includes('execute'));
    assert.equal(stored.unknownCredential, undefined);
    assert.equal((await connections.list()).inbox.length, 2);
    await connections.revoke(created.client.id);
    await assert.rejects(connections.authorize('Bearer ' + created.token), (e) => e.status === 401);
    await connections.remove('one');
    await assert.rejects(connections.component('one'), /not found/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('official MCP clients complete HTTP and stdio capture/build/shared-inbox flow with scope and revocation checks', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'reframe-mcp-')),
    probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const processHandle = spawn(process.execPath, ['server/index.js'], {
      env: {
        ...process.env,
        PORT: String(port),
        REFRAME_STORE: folder,
        NODE_ENV: 'production',
        OPENAI_API_KEY: '',
      },
      stdio: 'ignore',
    }),
    base = `http://127.0.0.1:${port}`;
  let client, bridge, projectClient;
  const post = async (route, body) => {
    const response = await fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/api/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(60);
    }
    assert.ok(ready);
    const token = await post('/api/connections/create', {
      name: 'MCP integration verifier',
      scopes: ['library', 'capture', 'build', 'clipboard'],
    });
    assert.equal(
      (
        await fetch(base + '/mcp', {
          method: 'POST',
          headers: { Origin: 'https://foreign.invalid' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + '/MCP/', {
          method: 'POST',
          headers: { Origin: 'https://foreign.invalid' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + '/API/connections/', { headers: { Origin: 'https://foreign.invalid' } }))
        .status,
      403,
    );
    assert.equal((await fetch(base + '/mcp', { method: 'POST' })).status, 401);
    client = new Client({ name: 'Reframe verification client', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: { headers: { Authorization: 'Bearer ' + token.token } },
      }),
    );
    const list = await client.listTools();
    assert.ok(list.tools.some((t) => t.name === 'build_component'));
    assert.ok(!list.tools.some((t) => /apply|project|run_code|connect_project/.test(t.name)));
    assert.equal((await client.callTool({ name: 'project_fit', arguments: {} })).isError, true);
    assert.equal(
      (
        await client.callTool({
          name: 'capture_component',
          arguments: { url: 'http://127.0.0.1/private' },
        })
      ).isError,
      true,
    );
    const captured = (
      await client.callTool({
        name: 'capture_component',
        arguments: {
          html: '<section><h2>MCP notebook</h2><label>Email<input type="email" required></label><button>Save</button><button>Count</button></section>',
        },
      })
    ).structuredContent;
    assert.ok(captured.items.length);
    const item = { ...captured.items[0], name: 'MCP notebook' };
    const report = (
      await client.callTool({ name: 'inspect_component', arguments: { html: item.html } })
    ).structuredContent;
    const spec = { fields: report.fields, actions: report.actions };
    const built = await client.callTool({ name: 'build_component', arguments: { item, spec } });
    assert.ok(!built.isError, JSON.stringify(built));
    const feature = built.structuredContent.item;
    assert.ok(feature.feature.files['Component.tsx']);
    assert.ok(feature.feature.files['runtime.mjs']);
    assert.ok(
      !(await client.callTool({ name: 'save_component', arguments: { item: feature } })).isError,
    );
    const inbox = await (await fetch(base + '/api/connections')).json();
    assert.equal(inbox.inbox.length, 1);
    assert.ok(inbox.inbox[0].item.feature.spec.actions.some((a) => a.operation === 'increment'));
    assert.equal(inbox.activity[0].tool, 'save_component');
    assert.ok(!JSON.stringify(inbox).includes(token.token));
    const read = await client.callTool({
      name: 'read_shared_component',
      arguments: { id: feature.id },
    });
    assert.equal(read.structuredContent.item.feature.sourceHash, feature.feature.sourceHash);
    let decision = 0,
      ref;
    const hostConnections = new Connections(folder);
    const host = await runOpenAIMcp(
      { goal: 'Capture supplied counter HTML, build and save.' },
      {
        connections: hostConnections,
        port,
        respond: async (payload) => {
          assert.ok(!JSON.stringify(payload).includes(token.token));
          const output = payload.input.filter((i) => i.type === 'function_call_output').at(-1);
          if (decision === 1) ref = JSON.parse(output.output).items[0].ref;
          if (decision === 2) ref = JSON.parse(output.output).ref;
          const steps = [
            [
              'capture_component',
              {
                url: null,
                html: '<section><article><h2>Model counter</h2><button>Count</button></article><article>Other component</article></section>',
              },
            ],
            ['pick_component', { ref, selector: 'article:first-child' }],
            ['inspect_component', { ref }],
            [
              'build_component',
              {
                ref,
                name: 'Model counter',
                actions: [{ id: 'action1', operation: 'increment', target: '', message: '' }],
              },
            ],
            ['save_component', { ref }],
          ];
          if (decision === 5)
            return {
              output: [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: 'Saved the working counter.' }],
                },
              ],
            };
          const [name, args] = steps[decision++];
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call' + decision,
                name,
                arguments: JSON.stringify(args),
              },
            ],
          };
        },
      },
    );
    assert.deepEqual(
      host.steps.map((s) => s.tool),
      [
        'capture_component',
        'pick_component',
        'inspect_component',
        'build_component',
        'save_component',
      ],
    );
    assert.equal(host.saved.length, 1);
    assert.ok(
      (await hostConnections.list()).clients.find((c) => c.name === 'OpenAI · local MCP host')
        .revoked,
    );
    await assert.rejects(
      runOpenAIMcp(
        { goal: 'Test provider outage' },
        {
          connections: hostConnections,
          port,
          respond: async () => {
            throw new Error('Provider unavailable');
          },
        },
      ),
      /Provider unavailable/,
    );
    assert.ok(
      (await hostConnections.list()).clients
        .filter((c) => c.name === 'OpenAI · local MCP host')
        .every((c) => c.revoked),
    );
    bridge = new Client({ name: 'Stdio bridge verifier', version: '1.0.0' });
    await bridge.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.resolve('server/mcp-stdio.js')],
        env: { PATH: process.env.PATH, REFRAME_PORT: String(port), REFRAME_MCP_TOKEN: token.token },
        stderr: 'pipe',
      }),
    );
    assert.equal((await bridge.listTools()).tools.length, list.tools.length);
    assert.ok(
      (await bridge.callTool({ name: 'search_components', arguments: { query: 'accordion' } }))
        .structuredContent.items.length,
    );
    const destination = path.join(folder, 'destination');
    await mkdir(path.join(destination, 'src'), { recursive: true });
    const source = 'export default function App(){return <main><h1>Notes</h1></main>}';
    await writeFile(path.join(destination, 'src/App.tsx'), source);
    await writeFile(
      path.join(destination, 'package.json'),
      JSON.stringify({
        name: 'notes',
        dependencies: { react: '19.2.0' },
        devDependencies: { vite: '6.4.5' },
      }),
    );
    const project = await post('/api/projects/connect', { path: destination }),
      access = await post('/api/connections/create', {
        name: 'Project verifier',
        scopes: ['projects'],
      });
    projectClient = new Client({ name: 'Project client', version: '1.0.0' });
    await projectClient.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: { headers: { Authorization: 'Bearer ' + access.token } },
      }),
    );
    const known = (await projectClient.callTool({ name: 'list_projects', arguments: {} }))
      .structuredContent;
    assert.ok(known.projects.some((p) => p.id === project.id));
    assert.ok(!JSON.stringify(known).includes(destination));
    const screens = await projectClient.callTool({
      name: 'inspect_project',
      arguments: { id: project.id },
    });
    assert.ok(!JSON.stringify(screens).includes(destination));
    const target = (
      await projectClient.callTool({
        name: 'project_targets',
        arguments: { id: project.id, file: 'src/App.tsx' },
      })
    ).structuredContent;
    const fit = await projectClient.callTool({
      name: 'project_fit',
      arguments: {
        id: project.id,
        file: 'src/App.tsx',
        pointId: target.points[0].id,
        hash: target.hash,
        item: feature,
      },
    });
    assert.ok(!fit.isError, JSON.stringify(fit));
    assert.ok(fit.structuredContent.score > 0);
    assert.equal(
      (await projectClient.callTool({ name: 'apply', arguments: { id: 'invented' } })).isError,
      true,
    );
    assert.equal(await readFile(path.join(destination, 'src/App.tsx'), 'utf8'), source);
    await post('/api/connections/revoke', { id: token.client.id });
    await assert.rejects(client.listTools(), /401|invalid|revoked|Unauthorized/i);
  } finally {
    await projectClient?.close();
    await bridge?.close();
    await client?.close();
    processHandle.kill('SIGTERM');
    if (processHandle.exitCode === null)
      await new Promise((resolve) => processHandle.once('exit', resolve));
    await rm(folder, { recursive: true, force: true });
  }
});

test('real Graphify AST extraction detects symbols and relationships without executing supplied JavaScript', async () => {
  const status = await graphifyStatus();
  if (!status.available) {
    await assert.rejects(graphifySource('function sample(){}'), /unavailable/);
    return;
  }
  const code =
    'function inspect(){return true} export function capture(){throw new Error("must never execute");return inspect()}';
  const result = await graphifySource(code);
  assert.match(result.engine, /Graphify/);
  assert.ok(result.nodes >= 2);
  assert.ok(result.edges >= 1);
  assert.match(JSON.stringify(result.graph), /capture/);
  assert.ok(result.sourceDigest);
  await assert.rejects(graphifySource('x'.repeat(500001)), /500 KB/);
});
