import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mountDownloads } from '../server/downloads.js';
test('browser-compatible exports preserve bytes and use bounded, temporary attachment URLs', async () => {
  const app = express();
  app.use(express.json({ limit: '24mb' }));
  mountDownloads(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port,
    body = Buffer.from('Portable component π\n<script>not executed</script>');
  const post = (value) =>
    fetch(base + '/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  try {
    const response = await post({
      name: 'My component.json',
      type: 'application/json',
      base64: body.toString('base64'),
    });
    assert.equal(response.status, 200);
    const { url } = await response.json();
    assert.match(url, /\/api\/downloads\/[a-f0-9-]{36}$/);
    const file = await fetch(base + url);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), body);
    assert.match(file.headers.get('content-disposition'), /^attachment;.*My component.json/);
    assert.match(file.headers.get('content-security-policy'), /sandbox/);
    assert.equal(file.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(base + '/api/downloads/unknown')).status, 410);
    for (const invalid of [
      { name: '../private.json', type: 'application/json', base64: '' },
      { name: 'file', type: 'text/html\r\nX-Injected: yes', base64: '' },
      { name: 'file', type: 'text/plain', base64: '!!!=' },
      { name: 'file', type: 'text/plain', base64: 'Zh==' },
      { name: 'file', type: 'text/plain', base64: 'A'.repeat(21333340) },
    ])
      assert.equal((await post(invalid)).status, 400);
    for (let i = 0; i < 7; i++)
      assert.equal((await post({ name: 'file.txt', type: 'text/plain', base64: '' })).status, 200);
    assert.equal(
      (await post({ name: 'one-more.txt', type: 'text/plain', base64: '' })).status,
      429,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
