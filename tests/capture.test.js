import test from 'node:test';
import assert from 'node:assert/strict';
test('HTML submit, reset and button inputs retain actions instead of becoming data fields', () => {
  const html = cleanHtml(
    '<form><label>Name<input name="name"></label><input type="submit" value="Save"><input type="reset"><input type="button" value="Like"></form>',
  );
  assert.match(html, /<button[^>]*>Save<\/button>/);
  assert.match(html, /<button[^>]*>Reset<\/button>/);
  assert.match(html, /<button[^>]*>Like<\/button>/);
  assert.equal((html.match(/<input\b/g) || []).length, 1);
  assert.match(cleanHtml('<input type="PASSWORD">'), /type="password"/);
});
import {
  cleanHtml,
  pickHtml,
  extract,
  fetchPage,
  publicAddress,
  inspectQuality,
} from '../server/capture.js';
test('capture removes execution, navigation traps and CSS while preserving accessible content', () => {
  const html = cleanHtml(
    '<form action="https://evil.test"><script>alert(1)</script><button onclick="bad()">Save</button><input autofocus formaction="https://evil.test"><a href="javascript:bad()">Link</a><img src="https://example.com/a.png" onerror="bad()" alt="Example"><p style="background:url(https://evil.test)">Hello</p><iframe srcdoc="bad"></iframe></form>',
  );
  assert.doesNotMatch(html, /script|onclick|onerror|autofocus|formaction|style=|iframe|<form/);
  assert.match(html, /type="button"/);
  assert.match(html, /alt="Example"/);
});
test('extraction identifies top-level sections without duplicating nested components', () => {
  const result = extract(
    '<title>Demo</title><nav><a href="/home">Home</a></nav><section><h2>Pricing</h2><article><p>Nested</p></article></section>',
    'https://example.com/product',
  );
  assert.equal(result.items.length, 2);
  assert.equal(result.items[1].name, 'Pricing');
  assert.match(result.items[0].html, /https:\/\/example.com\/home/);
  assert.equal(result.title, 'Demo');
});
test('dynamic-only and oversized imports fail explicitly', () => {
  assert.throws(() => extract('<script>createApp()</script>'), /No readable/);
  assert.throws(() => extract('x'.repeat(2_000_001)), /under 2 MB/);
});
test('private, loopback, mapped, reserved and multicast addresses are blocked', () => {
  for (const address of [
    '127.0.0.1',
    '10.2.3.4',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '64:ff9b::7f00:1',
    '64:ff9b::a00:1',
    '64:ff9b::a9fe:a9fe',
    '64:ff9b::c0a8:101',
    '64:ff9b::e000:1',
    '64:ff9b:1::d8c6:4f01',
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('93.184.216.34'), true);
  assert.equal(publicAddress('64:ff9b::5db8:d822'), true);
  assert.equal(publicAddress('64:ff9b::d8c6:4f01'), true);
});
test('URL schemes, credentials, ports and local destinations are rejected', async () => {
  for (const url of [
    'file:///etc/passwd',
    'http://user:pass@example.com',
    'http://example.com:8080',
    'http://127.0.0.1',
    'http://[::1]',
  ])
    await assert.rejects(fetchPage(url));
});
test('quality report flags integration work without claiming behavior is recovered', () => {
  const r = inspectQuality(
    '<section><img src="x"><a href="#">Next</a><button>Go</button></section>',
  );
  assert.equal(r.dependencies, 0);
  assert.equal(r.issues.length, 3);
  assert.equal(r.elements, 4);
});

test('component picking isolates a single product without adjacent cards or executing source', () => {
  const source =
    '<section><article class="product"><h2>Phone</h2><a href="https://example.com/phone">Learn more</a><script>secret()</script></article><article class="product"><h2>Watch</h2></article></section>';
  const picked = pickHtml(source, '.product:first-child');
  assert.equal(picked.name, 'Phone');
  assert.equal(picked.kind, 'article');
  assert.match(picked.html, /https:\/\/example.com\/phone/);
  assert.doesNotMatch(picked.html, /Watch|secret|script/);
  assert.throws(() => pickHtml(source, '.product'), /exactly one/);
  assert.throws(() => pickHtml(source, '.absent'), /exactly one/);
  assert.throws(() => pickHtml(source, '['), /Invalid CSS/);
  assert.throws(() => pickHtml(source, '<h2>Invented</h2>'), /exactly one/);
  assert.throws(() => pickHtml(source, 'x'.repeat(301)), /300/);
});
