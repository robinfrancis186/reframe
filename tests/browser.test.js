import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceBrowser } from '../server/browser.js';
import { referenceResource, referenceUrl } from '../server/browser-network.js';
import https from 'node:https';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

test('pinned broker preserves framework headers, methods and isolated cookies without accepting proxy headers', async (t) => {
  let sent, ended;
  t.mock.method(https, 'request', (url, options, callback) => {
    sent = { url, options };
    const req = new EventEmitter();
    req.end = (body) => {
      ended = body;
      const response = new PassThrough();
      response.statusCode = 200;
      response.headers = {
        'content-type': 'application/json',
        'set-cookie': ['one=1; Path=/', 'two=2; Path=/'],
        connection: 'close',
      };
      callback(response);
      queueMicrotask(() => response.end('{"ok":true}'));
    };
    return req;
  });
  const body = Buffer.from('{"query":"fixture"}');
  const result = await referenceResource(
    'https://8.8.8.8/fixture',
    {
      rsc: '1',
      'next-router-state-tree': 'fixture',
      'x-custom-client': 'browser',
      host: '127.0.0.1',
      'proxy-authorization': 'discard',
    },
    { method: 'POST', body },
  );
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.headers.rsc, '1');
  assert.equal(sent.options.headers['next-router-state-tree'], 'fixture');
  assert.equal(sent.options.headers['x-custom-client'], 'browser');
  assert.equal(sent.options.headers.host, undefined);
  assert.equal(sent.options.headers['proxy-authorization'], undefined);
  assert.equal(ended, body);
  assert.equal(result.headers['set-cookie'], 'one=1; Path=/\ntwo=2; Path=/');
  assert.equal(result.headers.connection, undefined);
  assert.equal(
    await new Promise((resolve) =>
      sent.options.lookup('8.8.8.8', { all: true }, (_, addresses) =>
        resolve(addresses[0].address),
      ),
    ),
    '8.8.8.8',
  );
  await assert.rejects(
    referenceResource('https://8.8.8.8', {}, { method: 'CONNECT' }),
    /Unsupported/,
  );
  await assert.rejects(
    referenceResource('https://8.8.8.8', {}, { method: 'POST', body: Buffer.alloc(1_000_001) }),
    /1 MB/,
  );
});

test('reference URLs and resources reject credentials, unsafe schemes and private destinations', async () => {
  assert.equal(referenceUrl('example.com').href, 'https://example.com/');
  for (const url of [
    'https://u:p@example.com',
    'https://example.com:3000',
    'javascript:alert(1)',
    'file:///tmp/key',
  ]) {
    await assert.rejects(referenceResource(url));
  }
  for (const url of [
    'http://127.0.0.1',
    'http://[::1]',
    'http://localhost',
    'http://169.254.169.254',
  ])
    await assert.rejects(referenceResource(url), /blocked/);
});

test(
  'website alerts, confirmations and prompts pause for a visible response, including during initial load',
  { timeout: 60000 },
  async () => {
    const browser = new ReferenceBrowser({
      resource: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.from(
          "<title>Website dialogs</title><script>alert(\"Welcome to this fixture\")</script><button id=\"confirm\" onclick=\"document.querySelector('#result').textContent=confirm('Use this option?')?'Accepted':'Cancelled'\">Confirm</button><button id=\"prompt\" onclick=\"document.querySelector('#result').textContent=prompt('Choose a name','Default')||'No name'\">Prompt</button><p id=\"result\"></p>",
        ),
      }),
    });
    try {
      const { id } = await browser.create();
      const loaded = await browser.act({ id, action: 'navigate', url: 'https://example.com' });
      assert.equal(loaded.dialog.type, 'alert');
      assert.equal(
        (await browser.act({ id, action: 'snapshot' })).dialog.message,
        'Welcome to this fixture',
      );
      await assert.rejects(
        browser.act({ id, action: 'scroll', y: 100 }),
        /Respond to the website dialog/,
      );
      await browser.act({ id, action: 'dialog', accept: true });
      const point = async (selector) => {
        const b = await browser.tabs.get(id).page.locator(selector).boundingBox();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      };
      const confirm = await browser.act({ id, action: 'click', ...(await point('#confirm')) });
      assert.equal(confirm.dialog.type, 'confirm');
      await browser.act({ id, action: 'dialog', accept: false });
      assert.match((await browser.act({ id, action: 'scrape' })).text, /Cancelled/);
      const prompt = await browser.act({ id, action: 'click', ...(await point('#prompt')) });
      assert.equal(prompt.dialog.defaultValue, 'Default');
      await assert.rejects(
        browser.act({ id, action: 'dialog', accept: 'yes' }),
        /Choose a response/,
      );
      await browser.act({ id, action: 'dialog', accept: true, text: 'Local test' });
      assert.match((await browser.act({ id, action: 'scrape' })).text, /Local test/);
    } finally {
      await browser.close();
    }
  },
);

test(
  'browser queues assets, loads lazy sections, scrapes, screenshots and acts with origin-scoped submission permission',
  { timeout: 90000 },
  async () => {
    let active = 0,
      peak = 0;
    const writes = [],
      headers = [];
    const browser = new ReferenceBrowser({
      resource: async (raw, requestHeaders = {}, options = {}) => {
        const url = new URL(raw);
        headers.push(requestHeaders);
        const response = (body, type = 'text/html') => ({
          status: 200,
          headers: { 'content-type': type },
          body: Buffer.from(body),
        });
        if (url.pathname.startsWith('/asset-')) {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 80));
          active--;
          return response('window.loadedAssets=(window.loadedAssets||0)+1;', 'text/javascript');
        }
        if (url.pathname === '/client')
          return response(
            requestHeaders.rsc === '1' ? 'Client navigation ready' : 'Missing framework header',
            'text/plain',
          );
        if (options.method === 'POST') {
          writes.push({ url: raw, body: options.body?.toString() });
          return response('{"saved":true}', 'application/json');
        }
        if (url.hostname === 'other.example')
          return response('<title>Other origin</title><p>Other origin</p>');
        return {
          ...response(
            `<html><head><title>Browser capabilities fixture</title>${Array.from({ length: 40 }, (_, i) => `<script defer src="https://asset-${i}.example/asset-${i}.js"></script>`).join('')}<style>body{margin:0;font:16px Arial}section{padding:20px}#menu{width:200px;height:50px}#nested{height:120px;width:400px;overflow:auto}#lazy{margin-top:1500px}#drag{width:100px;height:70px;background:#ddd}</style></head><body><section><h1>Working reference</h1><div id="menu" onmouseenter="document.querySelector('#hover').textContent='Hovered menu'">Hover here</div><p id="hover"></p><label>Name<input id="name" value="must-not-export"></label><button id="client" onclick="fetch('/client',{headers:{RSC:'1','Next-Router-State-Tree':'fixture'}}).then(r=>r.text()).then(t=>document.querySelector('#client-result').textContent=t)">Load client data</button><p id="client-result"></p><button id="save" onclick="fetch('/save',{method:'POST',body:'fixture record'}).then(r=>r.json()).then(()=>document.querySelector('#saved').textContent='Saved on server').catch(()=>{})">Save record</button><p id="saved"></p><a id="popup" target="_blank" href="https://example.com/next">New window</a><div id="drag" onmousedown="this.dataset.moving='1'" onmousemove="if(this.dataset.moving)this.textContent='Dragged'" onmouseup="delete this.dataset.moving">Drag here</div><div id="nested"><div style="height:600px">Nested scroll content</div></div><section id="lazy"></section></section><script>new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))document.querySelector('#lazy').innerHTML='<h2>Lazy section available</h2><a href="/next">Next page</a>'}).observe(document.querySelector('#lazy'));</script></body></html>`,
          ),
          headers: {
            'content-type': 'text/html',
            'set-cookie': 'fixture=isolated; Path=/; SameSite=Lax',
          },
        };
      },
    });
    try {
      const { id } = await browser.create();
      const first = await browser.act({ id, action: 'navigate', url: 'https://example.com' });
      assert.equal(first.blocked, 0);
      assert.equal(await browser.tabs.get(id).page.evaluate(() => window.loadedAssets), 40);
      assert.ok(peak <= 16);
      assert.equal((await browser.tabs.get(id).context.cookies())[0].value, 'isolated');
      await assert.rejects(
        browser.act({ id, action: 'text', text: 'Do not lose this text' }),
        /editable website field/,
      );
      const point = async (selector) => {
        const b = await browser.tabs.get(id).page.locator(selector).boundingBox();
        return { x: b.x + Math.min(10, b.width / 2), y: b.y + Math.min(10, b.height / 2) };
      };
      await browser.act({ id, action: 'hover', ...(await point('#menu')) });
      assert.match((await browser.act({ id, action: 'scrape' })).text, /Hovered menu/);
      await browser.act({ id, action: 'click', ...(await point('#client')) });
      assert.match((await browser.act({ id, action: 'scrape' })).text, /Client navigation ready/);
      assert.ok(headers.some((h) => h['next-router-state-tree'] === 'fixture'));
      await browser.act({ id, action: 'click', ...(await point('#name')) });
      await browser.act({ id, action: 'key', key: 'ControlOrMeta+A' });
      await browser.act({ id, action: 'text', text: 'Private typed value' });
      assert.equal(
        await browser.tabs.get(id).page.locator('#name').inputValue(),
        'Private typed value',
      );
      const scraped = await browser.act({ id, action: 'scrape' });
      assert.ok(scraped.headings.some((h) => h.text === 'Lazy section available'));
      assert.ok(scraped.links.some((link) => link.url === 'https://example.com/next'));
      assert.ok(scraped.controls.some((control) => control.label === 'Name'));
      assert.doesNotMatch(
        JSON.stringify(scraped),
        /Private typed value|must-not-export|fixture=isolated/,
      );
      await browser.act({ id, action: 'pick', ...(await point('#name')) });
      const captured = await browser.act({ id, action: 'capture' });
      assert.doesNotMatch(captured.items[0].html, /must-not-export|Private typed/);
      const popup = await browser.act({ id, action: 'click', ...(await point('#popup')) });
      assert.equal(popup.popup, 'https://example.com/next');
      const drag = await point('#drag');
      await browser.act({ id, action: 'drag', ...drag, toX: drag.x + 60, toY: drag.y + 30 });
      assert.equal(await browser.tabs.get(id).page.locator('#drag').innerText(), 'Dragged');
      const nested = await point('#nested');
      await browser.act({ id, action: 'scroll', x: nested.x, pointerY: nested.y, y: 300 });
      assert.ok(
        await browser.tabs
          .get(id)
          .page.locator('#nested')
          .evaluate((el) => el.scrollTop > 0),
      );
      const shot = await browser.act({ id, action: 'screenshot', fullPage: true });
      assert.equal(shot.fullPage, true);
      assert.ok(shot.height > 800);
      assert.match(shot.image, /^data:image\/jpeg;base64,/);
      assert.equal(shot.truncated, false);
      assert.equal(
        await browser.tabs.get(id).page.evaluate(async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image.naturalHeight;
        }, shot.image),
        shot.height,
      );
      await browser.act({ id, action: 'click', ...(await point('#save')) });
      assert.equal(writes.length, 0);
      await assert.rejects(
        browser.act({
          id,
          action: 'permissions',
          allowWrites: true,
          origin: 'https://other.example',
        }),
        /current website/,
      );
      await browser.act({
        id,
        action: 'permissions',
        allowWrites: true,
        origin: 'https://example.com',
      });
      await browser.act({ id, action: 'click', ...(await point('#save')) });
      assert.equal(writes.length, 1);
      assert.equal(writes[0].body, 'fixture record');
      assert.match((await browser.act({ id, action: 'scrape' })).text, /Saved on server/);
      await assert.rejects(
        browser.act({ id, action: 'key', key: 'ControlOrMeta+W' }),
        /Unsupported/,
      );
      await assert.rejects(
        browser.act({ id, action: 'drag', x: 10, y: 10, toX: -1, toY: 10 }),
        /inside/,
      );
      const other = await browser.act({ id, action: 'navigate', url: 'https://other.example' });
      assert.equal(other.writeOrigin, null);
      assert.equal(browser.tabs.size, 1);
    } finally {
      await browser.close();
    }
  },
);

test(
  'isolated reference browser renders JS, picks, captures provenance, navigates, resizes and bounds tabs',
  { timeout: 60000 },
  async () => {
    const hits = [];
    const browser = new ReferenceBrowser({
      resource: async (url) => {
        hits.push(url);
        return {
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: Buffer.from(
            `<html><head><title>Reference fixture</title></head><body style="margin:0"><section id="card" style="height:200px;width:400px;background:#eae4ff;padding:20px"><div id="wrap"><div style="display:contents"><h1>Dynamic card</h1></div></div><button onclick="this.textContent='Selected'">Select</button><a href="https://example.com/next">Next</a><p id="result"></p></section><div style="height:1500px">Below fold</div><script>document.querySelector('#result').textContent='Rendered by JavaScript';fetch('/write',{method:'POST',body:'test'}).catch(()=>{});</script></body></html>`,
          ),
        };
      },
    });
    try {
      const { id } = await browser.create();
      const page = await browser.act({ id, action: 'navigate', url: 'https://example.com' });
      assert.equal(page.title, 'Reference fixture');
      assert.match(page.image, /^data:image\/jpeg;base64,/);
      assert.ok(page.blocked >= 1);
      assert.ok(!hits.some((url) => url.includes('/write')));
      const preview = await browser.act({ id, action: 'probe', x: 30, y: 45 });
      assert.equal(preview.probe.tag, 'h1');
      assert.ok(!preview.image, 'hover preview must not take a screenshot');
      const picked = await browser.act({ id, action: 'pick', x: 30, y: 45 });
      assert.equal(picked.selection.tag, 'h1');
      const parent = await browser.act({ id, action: 'pick', x: 30, y: 45, depth: 1 });
      assert.equal(parent.selection.tag, 'section', 'same-box and box-less wrappers are skipped');
      const result = await browser.act({ id, action: 'capture' });
      assert.match(result.items[0].html, /Rendered by JavaScript/);
      assert.doesNotMatch(result.items[0].html, /onclick|<script|style=/);
      assert.equal(result.items[0].source, 'https://example.com/');
      assert.match(result.items[0].referenceImage, /^data:image\/jpeg;base64,/);
      const all = await browser.act({ id, action: 'extract' });
      assert.equal(all.items.length, 1);
      const mobile = await browser.act({ id, action: 'viewport', mobile: true });
      assert.equal(mobile.viewport.width, 390);
      assert.equal(mobile.selection, null);
      await assert.rejects(browser.act({ id, action: 'pick', x: -1, y: 20 }), /inside/);
      await assert.rejects(browser.act({ id, action: 'scroll', y: Infinity }), /Invalid/);
      await browser.act({ id, action: 'navigate', url: 'https://example.com/next' });
      assert.equal((await browser.act({ id, action: 'back' })).url, 'https://example.com/');
      assert.equal((await browser.act({ id, action: 'forward' })).url, 'https://example.com/next');
      await browser.create();
      await browser.create();
      await browser.create();
      await assert.rejects(browser.create(), /four/);
      await browser.closeTab(id);
      await assert.rejects(browser.act({ id, action: 'snapshot' }), /expired/);
    } finally {
      await browser.close();
    }
  },
);
