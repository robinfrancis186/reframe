import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

test('REA and MCP reject oversized bounded collections before walking their elements', () => {
  const require = createRequire(import.meta.url);
  for (const consumer of ['rea-agents/package.json', '@modelcontextprotocol/sdk/server/index.js']) {
    const { z } = createRequire(require.resolve(consumer))('zod');
    let visits = 0;
    const element = z.string().superRefine(() => {
      visits++;
    });
    for (const [schema, oversized, valid] of [
      [z.array(element).max(1), ['a', 'b'], ['a']],
      [z.set(element).max(1), new Set(['a', 'b']), new Set(['a'])],
      [
        z.map(z.string(), element).max(1),
        new Map([
          ['a', 'a'],
          ['b', 'b'],
        ]),
        new Map([['a', 'a']]),
      ],
    ]) {
      visits = 0;
      assert.equal(schema.safeParse(oversized).success, false);
      assert.equal(
        visits,
        0,
        consumer + ' must enforce collection limits before element validation.',
      );
      assert.equal(schema.safeParse(valid).success, true);
      assert.equal(visits, 1, 'Ordinary inputs must still validate.');
    }
  }
});
