import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { request as httpRequest } from 'node:http';
import { Shop, shopRouter } from '../examples/connected-app/server/shop.js';

async function fixture(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'reframe-shop-'));
  try {
    await fn(path.join(dir, 'shop.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test('product flow persists a priced cart and atomically reserves inventory, with durable idempotency', () =>
  fixture(async (file) => {
    let shop = new Shop(file);
    assert.equal((await shop.get()).cart.quantity, 0);
    const added = await shop.setItem({ variantId: 'ink', quantity: 2, version: 0 });
    assert.equal(added.cart.totalCents, 4000);
    shop = new Shop(file);
    assert.equal((await shop.get()).cart.quantity, 2);
    const body = { version: 1, requestId: randomUUID() };
    const result = await shop.reserve(body);
    assert.equal(result.order.totalCents, 4000);
    assert.equal(result.cart.quantity, 0);
    assert.equal(result.variants.find((v) => v.id === 'ink').stock, 2);
    const retry = await new Shop(file).reserve(body);
    assert.equal(retry.order.id, result.order.id);
    assert.equal(retry.version, result.version);
    assert.equal(retry.replayed, true);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).orders.length, 1);
    await assert.rejects(shop.reserve({ ...body, version: 0 }), /different cart/);
  }));
test('quantity, unknown products, price tampering, empty carts, stale writes and concurrent submissions are rejected', () =>
  fixture(async (file) => {
    const shop = new Shop(file);
    for (const body of [
      null,
      [],
      {},
      { variantId: '__proto__', quantity: 1, version: 0 },
      { variantId: 'moss', quantity: -1, version: 0 },
      { variantId: 'moss', quantity: 1.5, version: 0 },
      { variantId: 'moss', quantity: 6, version: 0 },
      { variantId: 'moss', quantity: 1, version: 0, priceCents: 1 },
    ]) {
      assert.throws(() => shop.setItem(body));
    }
    await assert.rejects(shop.reserve({ version: 0, requestId: randomUUID() }), /Add an item/);
    const results = await Promise.allSettled([
      shop.setItem({ variantId: 'moss', quantity: 1, version: 0 }),
      shop.setItem({ variantId: 'clay', quantity: 2, version: 0 }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await shop.get()).cart.quantity, 1);
    const reservations = await Promise.allSettled([
      shop.reserve({ version: 1, requestId: randomUUID() }),
      shop.reserve({ version: 1, requestId: randomUUID() }),
    ]);
    assert.equal(reservations.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).orders.length, 1);
  }));
test('remove, sold-out stock and corrupt persisted data never silently reset a purchase state', () =>
  fixture(async (file) => {
    const shop = new Shop(file);
    await shop.setItem({ variantId: 'ink', quantity: 1, version: 0 });
    assert.equal(
      (await shop.setItem({ variantId: 'ink', quantity: 0, version: 1 })).cart.quantity,
      0,
    );
    await shop.setItem({ variantId: 'ink', quantity: 4, version: 2 });
    await shop.reserve({ version: 3, requestId: randomUUID() });
    await assert.rejects(shop.setItem({ variantId: 'ink', quantity: 1, version: 4 }), /stock/);
    assert.equal((await shop.get()).version, 4);
    await writeFile(file, 'broken json');
    await assert.rejects(shop.get());
    assert.equal(await readFile(file, 'utf8'), 'broken json');
  }));
test('real HTTP API rejects foreign origins, bad hosts, malformed JSON and oversized bodies', () =>
  fixture(async (file) => {
    const app = express();
    app.use('/api/shop', shopRouter(file));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/shop`;
    try {
      const get = await fetch(url);
      assert.equal(get.status, 200);
      assert.equal(get.headers.get('cache-control'), 'no-store');
      assert.equal((await fetch(url, { headers: { origin: 'https://evil.example' } })).status, 403);
      const badHostStatus = await new Promise((resolve, reject) => {
        const req = httpRequest(url, { headers: { host: 'evil.example' } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
      });
      assert.equal(badHostStatus, 403);
      assert.equal(
        (
          await fetch(url + '/cart', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: '{',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(url + '/cart', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ large: 'x'.repeat(9000) }),
          })
        ).status,
        413,
      );
      const saved = await fetch(url + '/cart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: 'clay', quantity: 2, version: 0 }),
      });
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).cart.totalCents, 3600);
      const order = await fetch(url + '/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, requestId: randomUUID() }),
      });
      assert.equal(order.status, 200);
      assert.equal((await order.json()).order.status, 'reserved');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }));
