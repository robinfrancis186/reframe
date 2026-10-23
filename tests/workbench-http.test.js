import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

test('workbench HTTP keeps data uncached, blocks foreign requests and never echoes malformed credential payloads', async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', OPENAI_API_KEY: '' },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Test workbench exited before startup.');
      try {
        const r = await fetch(base + '/api/health');
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(50);
    }
    assert.ok(ready);
    const health = await fetch(base + '/api/health');
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal((await health.json()).scope, 'local-workbench');
    const badHost = await new Promise((resolve, reject) =>
      get(base + '/api/health', { headers: { Host: 'untrusted.invalid' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject),
    );
    assert.equal(badHost, 403);
    assert.equal(
      (await fetch(base + '/api/agents/status', { headers: { Origin: 'https://foreign.invalid' } }))
        .status,
      403,
    );
    assert.equal(
      (await fetch(base + '/api/agents/status', { headers: { 'Sec-Fetch-Site': 'cross-site' } }))
        .status,
      403,
    );
    const secret = 'sk-test-never-echo-this-credential';
    const invalid = await fetch(base + '/api/projects/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"apiKey":"' + secret + '",BROKEN',
    });
    assert.equal(invalid.status, 400);
    const text = await invalid.text();
    assert.ok(!text.includes(secret));
    assert.match(text, /valid JSON/);
    const unknown = await fetch(base + '/api/does-not-exist');
    assert.equal(unknown.status, 404);
    assert.equal(unknown.headers.get('cache-control'), 'no-store');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
});
